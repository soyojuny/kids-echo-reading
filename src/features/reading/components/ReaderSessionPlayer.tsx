"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { WordTiming } from "@/shared/types/WordTiming";
import { splitSentences, tokenizeSentence } from "@/shared/utils/textSegmentation";
import styles from "@/features/reading/components/ChildReadingUi.module.css";

type PageViewMode = "single" | "spread";
type ReadingState =
  | "idle"
  | "ai_playing"
  | "child_reading"
  | "sentence_done"
  | "page_transition_wait"
  | "completed";

type ReaderSessionPlayerProps = {
  bookTitle: string;
  bookId: string;
  pageId: string;
  pageNumber: number;
  totalPages: number;
  imageUrl: string;
  nextPageImageUrl?: string;
  confirmedText: string;
  audioUrl?: string;
  wordTimings: WordTiming[];
  previousPageNumber?: number;
  nextPageNumber?: number;
};

type PrecacheMessage = {
  type: "PRECACHE_URLS";
  payload: string[];
};

type SentenceWordRange = {
  startWordIndex: number;
  endWordIndex: number;
  tokenCount: number;
};

const AUTO_NEXT_SENTENCE_MS = 1800;
const AUTO_NEXT_PAGE_MS = 3000;
const LAST_SESSION_STORAGE_KEY = "kids-echo-reading-last-session";

function getOrientationDefaultView(): PageViewMode {
  if (typeof window === "undefined") {
    return "single";
  }
  return window.matchMedia("(orientation: landscape)").matches ? "spread" : "single";
}

function saveLastSessionSnapshot(snapshot: {
  bookId: string;
  bookTitle: string;
  pageNumber: number;
  totalPages: number;
  updatedAt: number;
}) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(LAST_SESSION_STORAGE_KEY, JSON.stringify(snapshot));
}

function postPrecacheMessage(urls: string[]) {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  const dedupedUrls = [...new Set(urls.filter((url) => typeof url === "string" && url.length > 0))];
  if (dedupedUrls.length === 0) {
    return;
  }

  const message: PrecacheMessage = {
    type: "PRECACHE_URLS",
    payload: dedupedUrls
  };

  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage(message);
    return;
  }

  void navigator.serviceWorker.ready
    .then((registration) => {
      registration.active?.postMessage(message);
    })
    .catch(() => {
      // Ignore pre-cache warmup failures.
    });
}

function getSentenceBoxClassName(readingState: ReadingState): string {
  if (readingState === "ai_playing") {
    return `${styles.sentenceBox} ${styles.statePlay}`;
  }
  if (readingState === "child_reading") {
    return `${styles.sentenceBox} ${styles.stateRecord}`;
  }
  if (readingState === "sentence_done" || readingState === "page_transition_wait" || readingState === "completed") {
    return `${styles.sentenceBox} ${styles.stateDone}`;
  }
  return `${styles.sentenceBox} ${styles.stateIdle}`;
}

export function ReaderSessionPlayer({
  bookTitle,
  bookId,
  pageNumber,
  totalPages,
  imageUrl,
  nextPageImageUrl,
  confirmedText,
  audioUrl,
  wordTimings,
  nextPageNumber
}: ReaderSessionPlayerProps) {
  const router = useRouter();

  const sentences = useMemo(() => splitSentences(confirmedText), [confirmedText]);
  const sentenceTokens = useMemo(
    () => sentences.map((sentence) => tokenizeSentence(sentence)),
    [sentences]
  );
  const sentenceWordRanges = useMemo<SentenceWordRange[]>(() => {
    let cursor = 0;
    return sentenceTokens.map((tokens) => {
      const tokenCount = tokens.length;
      const startWordIndex = cursor;
      const endWordIndex = cursor + Math.max(0, tokenCount - 1);
      cursor += tokenCount;
      return { startWordIndex, endWordIndex, tokenCount };
    });
  }, [sentenceTokens]);

  const [readingState, setReadingState] = useState<ReadingState>("idle");
  const [statusMessage, setStatusMessage] = useState("준비 완료");
  const [sentenceIndex, setSentenceIndex] = useState(0);
  const [activeWordIndex, setActiveWordIndex] = useState(-1);
  const [pageViewMode, setPageViewMode] = useState<PageViewMode>("single");
  const [manualViewMode, setManualViewMode] = useState(false);

  const sentenceIndexRef = useRef(0);
  const aiWordIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sentenceTransitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageTransitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const segmentStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speechUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const segmentAudioRef = useRef<HTMLAudioElement | null>(null);

  const currentTokens = sentenceTokens[sentenceIndex] ?? [];

  function clearFlowTimers() {
    if (aiWordIntervalRef.current) {
      clearInterval(aiWordIntervalRef.current);
      aiWordIntervalRef.current = null;
    }
    if (sentenceTransitionTimerRef.current) {
      clearTimeout(sentenceTransitionTimerRef.current);
      sentenceTransitionTimerRef.current = null;
    }
    if (pageTransitionTimerRef.current) {
      clearTimeout(pageTransitionTimerRef.current);
      pageTransitionTimerRef.current = null;
    }
    if (aiFallbackTimerRef.current) {
      clearTimeout(aiFallbackTimerRef.current);
      aiFallbackTimerRef.current = null;
    }
    if (segmentStopTimerRef.current) {
      clearTimeout(segmentStopTimerRef.current);
      segmentStopTimerRef.current = null;
    }
  }

  function stopSpeech() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }
    window.speechSynthesis.cancel();
    speechUtteranceRef.current = null;
  }

  function stopSegmentAudio() {
    const audio = segmentAudioRef.current;
    if (!audio) {
      return;
    }
    audio.pause();
    audio.src = "";
    segmentAudioRef.current = null;
  }

  function stopAllAutomation() {
    clearFlowTimers();
    stopSpeech();
    stopSegmentAudio();
    setActiveWordIndex(-1);
  }

  function getSentenceTimingRange(targetSentenceIndex: number): { startMs: number; endMs: number } | undefined {
    const range = sentenceWordRanges[targetSentenceIndex];
    if (!range || range.tokenCount <= 0) {
      return undefined;
    }

    const startTiming = wordTimings[range.startWordIndex];
    const endTiming = wordTimings[range.endWordIndex];
    if (!startTiming || !endTiming) {
      return undefined;
    }

    if (!Number.isFinite(startTiming.startMs) || !Number.isFinite(endTiming.endMs)) {
      return undefined;
    }

    const startMs = Math.max(0, startTiming.startMs - 120);
    const endMs = Math.max(startMs + 450, endTiming.endMs + 220);
    return { startMs, endMs };
  }

  function playAudioSegment(startMs: number, endMs: number, onFinished: () => void): boolean {
    if (!audioUrl) {
      return false;
    }

    let finished = false;
    const finishOnce = () => {
      if (finished) {
        return;
      }
      finished = true;
      stopSegmentAudio();
      onFinished();
    };

    const audio = new Audio(audioUrl);
    segmentAudioRef.current = audio;

    audio.onloadedmetadata = () => {
      const startSec = Math.max(0, startMs / 1000);
      const endSec = Math.max(startSec + 0.25, endMs / 1000);

      const clampedStart =
        Number.isFinite(audio.duration) && audio.duration > 0
          ? Math.min(startSec, Math.max(0, audio.duration - 0.05))
          : startSec;

      audio.currentTime = clampedStart;
      void audio.play()
        .then(() => {
          const stopMs = Math.max(300, (endSec - clampedStart) * 1000);
          segmentStopTimerRef.current = setTimeout(() => {
            finishOnce();
          }, stopMs);
        })
        .catch(() => {
          finishOnce();
        });
    };

    audio.onended = () => {
      finishOnce();
    };
    audio.onerror = () => {
      finishOnce();
    };

    audio.load();
    return true;
  }

  function playWholeAudio(onFinished: () => void): boolean {
    if (!audioUrl) {
      return false;
    }

    let finished = false;
    const finishOnce = () => {
      if (finished) {
        return;
      }
      finished = true;
      stopSegmentAudio();
      onFinished();
    };

    const audio = new Audio(audioUrl);
    segmentAudioRef.current = audio;
    audio.onended = () => {
      finishOnce();
    };
    audio.onerror = () => {
      finishOnce();
    };

    void audio.play().catch(() => {
      finishOnce();
    });
    return true;
  }

  function beginChildReading(targetSentenceIndex: number) {
    setSentenceIndex(targetSentenceIndex);
    sentenceIndexRef.current = targetSentenceIndex;
    setActiveWordIndex(-1);
    setReadingState("child_reading");
    setStatusMessage("아이 차례예요. 문장을 따라 읽고 완료 버튼을 눌러 주세요.");
  }

  function beginAiPlaying(targetSentenceIndex: number) {
    const sentence = sentences[targetSentenceIndex];
    const tokens = sentenceTokens[targetSentenceIndex];
    if (!sentence || !tokens || tokens.length === 0) {
      return;
    }

    stopAllAutomation();
    setSentenceIndex(targetSentenceIndex);
    sentenceIndexRef.current = targetSentenceIndex;
    setReadingState("ai_playing");
    setStatusMessage("AI가 먼저 읽고 있어요.");
    setActiveWordIndex(0);

    const timingRange = getSentenceTimingRange(targetSentenceIndex);
    const intervalMs =
      timingRange && timingRange.endMs > timingRange.startMs
        ? Math.max(120, Math.floor((timingRange.endMs - timingRange.startMs) / Math.max(tokens.length, 1)))
        : 240;

    let progressIndex = 0;
    aiWordIntervalRef.current = setInterval(() => {
      progressIndex += 1;
      if (progressIndex >= tokens.length) {
        setActiveWordIndex(tokens.length - 1);
        return;
      }
      setActiveWordIndex(progressIndex);
    }, intervalMs);

    const onFinished = () => {
      if (aiWordIntervalRef.current) {
        clearInterval(aiWordIntervalRef.current);
        aiWordIntervalRef.current = null;
      }
      beginChildReading(targetSentenceIndex);
    };

    if (timingRange && playAudioSegment(timingRange.startMs, timingRange.endMs, onFinished)) {
      return;
    }

    if (targetSentenceIndex === 0 && playWholeAudio(onFinished)) {
      return;
    }

    if (
      typeof window !== "undefined" &&
      "speechSynthesis" in window &&
      typeof SpeechSynthesisUtterance !== "undefined"
    ) {
      const utterance = new SpeechSynthesisUtterance(sentence);
      utterance.lang = "en-US";
      utterance.rate = 0.95;
      utterance.onend = onFinished;
      utterance.onerror = onFinished;
      speechUtteranceRef.current = utterance;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
      return;
    }

    aiFallbackTimerRef.current = setTimeout(
      onFinished,
      Math.max(1500, Math.min(5200, sentence.length * 90))
    );
  }

  function finalizePage() {
    stopAllAutomation();
    if (nextPageNumber) {
      setReadingState("page_transition_wait");
      setStatusMessage(`${AUTO_NEXT_PAGE_MS / 1000}초 후 다음 페이지로 이동합니다.`);
      pageTransitionTimerRef.current = setTimeout(() => {
        router.push(`/session/${bookId}/${nextPageNumber}`);
      }, AUTO_NEXT_PAGE_MS);
      return;
    }

    setReadingState("completed");
    setStatusMessage("이 책의 읽기를 모두 마쳤어요.");
  }

  function goNextSentenceOrPage(manualOverride = false) {
    stopAllAutomation();
    const currentSentence = sentenceIndexRef.current;

    if (currentSentence < sentenceTokens.length - 1) {
      const nextSentence = currentSentence + 1;
      if (manualOverride) {
        setStatusMessage("다음 문장으로 이동합니다.");
      }
      beginAiPlaying(nextSentence);
      return;
    }

    finalizePage();
  }

  function completeChildReading() {
    if (readingState !== "child_reading") {
      return;
    }

    setReadingState("sentence_done");
    setStatusMessage(`좋아요. ${AUTO_NEXT_SENTENCE_MS / 1000}초 후 다음 문장으로 이동합니다.`);
    sentenceTransitionTimerRef.current = setTimeout(() => {
      goNextSentenceOrPage(false);
    }, AUTO_NEXT_SENTENCE_MS);
  }

  function goPrevSentence() {
    if (sentenceIndex <= 0) {
      return;
    }
    stopAllAutomation();
    const prevSentence = sentenceIndex - 1;
    setSentenceIndex(prevSentence);
    sentenceIndexRef.current = prevSentence;
    setStatusMessage("이전 문장으로 이동했습니다.");
    beginAiPlaying(prevSentence);
  }

  function handleStop() {
    stopAllAutomation();
    setReadingState("idle");
    setStatusMessage("자동 진행을 멈췄습니다.");
  }

  function restartCurrentBook() {
    router.push(`/session/${bookId}/1`);
  }

  useEffect(() => {
    sentenceIndexRef.current = sentenceIndex;
  }, [sentenceIndex]);

  useEffect(() => {
    const applyByOrientation = () => {
      if (!manualViewMode) {
        setPageViewMode(getOrientationDefaultView());
      }
    };

    applyByOrientation();
    const onResize = () => applyByOrientation();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, [manualViewMode]);

  useEffect(() => {
    saveLastSessionSnapshot({
      bookId,
      bookTitle,
      pageNumber,
      totalPages,
      updatedAt: Date.now()
    });
  }, [bookId, bookTitle, pageNumber, totalPages]);

  useEffect(() => {
    postPrecacheMessage([imageUrl, nextPageImageUrl ?? "", audioUrl ?? ""]);
  }, [imageUrl, nextPageImageUrl, audioUrl]);

  useEffect(() => {
    stopAllAutomation();
    setSentenceIndex(0);
    sentenceIndexRef.current = 0;
    setActiveWordIndex(-1);

    if (sentenceTokens.length === 0) {
      setReadingState("idle");
      setStatusMessage("이 페이지에 읽을 문장이 없습니다.");
      return;
    }

    setReadingState("idle");
    setStatusMessage("준비 완료");

    const startTimer = setTimeout(() => {
      beginAiPlaying(0);
    }, 120);

    return () => {
      clearTimeout(startTimer);
    };
  }, [sentenceTokens, confirmedText]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      stopAllAutomation();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const sentenceBoxClassName = getSentenceBoxClassName(readingState);
  const readingTitle =
    pageViewMode === "spread" && nextPageNumber
      ? `${bookTitle} · ${pageNumber}-${nextPageNumber}페이지`
      : `${bookTitle} · ${pageNumber}페이지`;

  return (
    <main className={styles.appRoot}>
      <div className={styles.app}>
        <header className={styles.topbar}>
          <div>
            <h1 className={styles.title}>리딩 놀이터</h1>
            <p className={styles.subtitle}>아동용 읽기 연습 CX 화면</p>
          </div>
          <span className={styles.chip}>
            {readingState === "completed" ? "완료" : `문장 ${sentenceIndex + 1}/${sentences.length || 0}`}
          </span>
        </header>

        {readingState !== "completed" && (
          <section className={styles.card}>
            <h2>{readingTitle}</h2>
            <p className={styles.subtitle}>
              페이지 {pageNumber} / {totalPages || "?"}
            </p>

            <div className={styles.readingToolbar}>
              <p className={styles.subtitle}>
                현재: {pageViewMode === "spread" ? "2페이지 보기" : "1페이지 보기"}
              </p>
              <div className={styles.viewToggle}>
                <button
                  type="button"
                  className={`${styles.viewButton} ${pageViewMode === "single" ? styles.viewButtonActive : ""}`}
                  onClick={() => {
                    setManualViewMode(true);
                    setPageViewMode("single");
                  }}
                >
                  1페이지
                </button>
                <button
                  type="button"
                  className={`${styles.viewButton} ${pageViewMode === "spread" ? styles.viewButtonActive : ""}`}
                  onClick={() => {
                    setManualViewMode(true);
                    setPageViewMode("spread");
                  }}
                >
                  2페이지
                </button>
              </div>
            </div>

            <div className={`${styles.illustration} ${pageViewMode === "spread" ? styles.illustrationSpread : ""}`}>
              <div className={styles.pagePanel}>
                <img className={styles.pageImage} src={imageUrl} alt={`page-${pageNumber}`} />
              </div>
              {pageViewMode === "spread" && (
                <div className={styles.pagePanel}>
                  {nextPageImageUrl ? (
                    <img
                      className={styles.pageImage}
                      src={nextPageImageUrl}
                      alt={`page-${nextPageNumber ?? pageNumber + 1}`}
                    />
                  ) : (
                    <span>다음 페이지 미리보기 없음</span>
                  )}
                </div>
              )}
            </div>

            <h3 style={{ margin: "16px 0 0" }}>문장 따라 읽기</h3>
            <p className={styles.subtitle}>
              문장 {sentences.length === 0 ? 0 : sentenceIndex + 1} / {sentences.length}
            </p>

            <div className={sentenceBoxClassName}>
              <p className={styles.script}>
                {currentTokens.length === 0 && <span className={styles.scriptToken}>문장이 없습니다.</span>}
                {currentTokens.map((token, index) => {
                  const active = readingState === "ai_playing" && activeWordIndex === index;
                  return (
                    <span
                      key={`${sentenceIndex}-${index}-${token}`}
                      className={`${styles.scriptToken} ${active ? styles.tokenFilled : ""}`}
                    >
                      {token}
                    </span>
                  );
                })}
              </p>
            </div>

            <div className={styles.controls}>
              <button type="button" className={`${styles.btn} ${styles.btnSoft}`} onClick={handleStop}>
                중지
              </button>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnSoft}`}
                onClick={() => beginAiPlaying(sentenceIndex)}
                disabled={readingState === "page_transition_wait"}
              >
                현재 문장 다시 듣기
              </button>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnSoft}`}
                onClick={completeChildReading}
                disabled={readingState !== "child_reading"}
              >
                따라 읽기 완료
              </button>
            </div>

            <div className={styles.sentenceNav}>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnSoft}`}
                onClick={goPrevSentence}
                disabled={sentenceIndex <= 0}
              >
                이전 문장
              </button>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnSoft}`}
                onClick={() => goNextSentenceOrPage(true)}
                disabled={readingState === "page_transition_wait"}
              >
                다음 문장 / 페이지
              </button>
            </div>

            <p className={styles.statusLine}>{statusMessage}</p>
          </section>
        )}

        {readingState === "completed" && (
          <section className={`${styles.card} ${styles.resultCard}`}>
            <h2>읽기 완료</h2>
            <p className={styles.subtitle}>평가 기능은 잠시 제외하고, 읽기 흐름 중심으로 진행합니다.</p>
            <div className={styles.controls}>
              <button type="button" className={`${styles.btn} ${styles.btnSoft}`} onClick={restartCurrentBook}>
                처음부터 다시 읽기
              </button>
              <Link href="/library" className={`${styles.btn} ${styles.btnSoft}`}>
                다른 책 고르기
              </Link>
            </div>
          </section>
        )}

        {audioUrl && (
          <section className={`${styles.card} ${styles.resultCard}`}>
            <p className={styles.subtitle}>TTS 미리듣기</p>
            <audio controls src={audioUrl} style={{ width: "100%" }} />
          </section>
        )}

        <nav className={styles.footerNav}>
          <Link href="/library" className={styles.footerNavItem}>
            1. 책 고르기
          </Link>
          <span
            className={`${styles.footerNavItem} ${
              readingState === "completed" ? "" : styles.footerNavActive
            }`}
          >
            2. 읽기 연습
          </span>
          <span
            className={`${styles.footerNavItem} ${
              readingState === "completed" ? styles.footerNavActive : ""
            }`}
          >
            3. 결과 보기
          </span>
        </nav>

        {!audioUrl && (
          <div className={styles.errorBox}>
            이 페이지에는 TTS 오디오가 없어 브라우저 음성으로 대체 재생합니다.
          </div>
        )}
      </div>
    </main>
  );
}
