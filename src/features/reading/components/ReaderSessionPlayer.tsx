"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { WordTiming } from "@/shared/types/WordTiming";

type PageViewMode = "single" | "spread";
type ReadingState =
  | "idle"
  | "ai_playing"
  | "child_recording"
  | "sentence_retry_prompt"
  | "sentence_done"
  | "page_review"
  | "page_transition_wait"
  | "final_review";

type ReaderSessionPlayerProps = {
  bookTitle: string;
  bookId: string;
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

type ReviewEntry = {
  word: string;
  count: number;
};

const AUTO_NEXT_SENTENCE_MS = 2000;
const AUTO_NEXT_PAGE_MS = 5000;
const RETRY_PROMPT_MS = 900;
const MAX_RETRY_COUNT = 1;
const REVIEW_STORAGE_PREFIX = "kids-echo-reading-review";

function splitSentences(text: string): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return [];
  }

  const matched = normalized
    .match(/[^.!?。！？\n]+[.!?。！？]?/g)
    ?.map((sentence) => sentence.trim())
    .filter(Boolean);
  return matched && matched.length > 0 ? matched : [normalized];
}

function tokenizeSentence(sentence: string): string[] {
  return sentence
    .trim()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function getOrientationDefaultView(): PageViewMode {
  if (typeof window === "undefined") {
    return "single";
  }
  return window.matchMedia("(orientation: landscape)").matches ? "spread" : "single";
}

function buildReviewStorageKey(bookId: string): string {
  return `${REVIEW_STORAGE_PREFIX}:${bookId}`;
}

function loadReviewMap(bookId: string): Record<string, number> {
  if (typeof window === "undefined") {
    return {};
  }

  const key = buildReviewStorageKey(bookId);
  const raw = window.localStorage.getItem(key);
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const reviewMap: Record<string, number> = {};
    for (const [word, count] of Object.entries(parsed)) {
      if (typeof count === "number" && Number.isFinite(count) && count > 0) {
        reviewMap[word] = Math.floor(count);
      }
    }
    return reviewMap;
  } catch {
    return {};
  }
}

function saveReviewMap(bookId: string, reviewMap: Record<string, number>) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(buildReviewStorageKey(bookId), JSON.stringify(reviewMap));
}

function toSortedReviewEntries(reviewMap: Record<string, number>): ReviewEntry[] {
  return Object.entries(reviewMap)
    .sort((a, b) => b[1] - a[1])
    .map(([word, count]) => ({ word, count }));
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
  previousPageNumber,
  nextPageNumber
}: ReaderSessionPlayerProps) {
  const router = useRouter();

  const sentences = useMemo(() => splitSentences(confirmedText), [confirmedText]);
  const sentenceTokens = useMemo(
    () => sentences.map((sentence) => tokenizeSentence(sentence)),
    [sentences]
  );

  const [readingState, setReadingState] = useState<ReadingState>("idle");
  const [statusMessage, setStatusMessage] = useState("읽기 루프를 시작해보자.");
  const [sentenceIndex, setSentenceIndex] = useState(0);
  const [masteredBySentence, setMasteredBySentence] = useState<boolean[][]>([]);
  const [attemptCounts, setAttemptCounts] = useState<number[]>([]);
  const [selectedWordIndexes, setSelectedWordIndexes] = useState<number[]>([]);
  const [activeWordIndex, setActiveWordIndex] = useState(-1);
  const [pageReviewWords, setPageReviewWords] = useState<string[]>([]);
  const [finalReviewWords, setFinalReviewWords] = useState<ReviewEntry[]>([]);
  const [pageViewMode, setPageViewMode] = useState<PageViewMode>("single");
  const [manualViewMode, setManualViewMode] = useState(false);

  const sentenceIndexRef = useRef(0);
  const masteredBySentenceRef = useRef<boolean[][]>([]);
  const pageReviewDoneRef = useRef(false);
  const aiWordIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryPromptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sentenceTransitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageTransitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speechUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const currentTokens = sentenceTokens[sentenceIndex] ?? [];
  const currentMastered = masteredBySentence[sentenceIndex] ?? [];
  const hasTimingMetadata = wordTimings.length > 0;

  function clearFlowTimers() {
    if (aiWordIntervalRef.current) {
      clearInterval(aiWordIntervalRef.current);
      aiWordIntervalRef.current = null;
    }
    if (retryPromptTimerRef.current) {
      clearTimeout(retryPromptTimerRef.current);
      retryPromptTimerRef.current = null;
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
  }

  function stopSpeech() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }
    window.speechSynthesis.cancel();
    speechUtteranceRef.current = null;
  }

  function stopAllAutomation() {
    clearFlowTimers();
    stopSpeech();
    setActiveWordIndex(-1);
  }

  function getRemainingWordIndexes(targetSentenceIndex: number, matrix: boolean[][]): number[] {
    const row = matrix[targetSentenceIndex] ?? [];
    return row.map((isMastered, idx) => ({ isMastered, idx })).filter((item) => !item.isMastered).map((item) => item.idx);
  }

  function getPageUnmasteredWords(matrix: boolean[][]): string[] {
    const words: string[] = [];
    matrix.forEach((row, sIdx) => {
      row.forEach((isMastered, tIdx) => {
        if (!isMastered) {
          const token = sentenceTokens[sIdx]?.[tIdx];
          if (token) {
            words.push(token);
          }
        }
      });
    });
    return [...new Set(words)];
  }

  function addReviewWords(words: string[]) {
    if (!words.length) {
      return;
    }

    const reviewMap = loadReviewMap(bookId);
    words.forEach((word) => {
      reviewMap[word] = (reviewMap[word] ?? 0) + 1;
    });
    saveReviewMap(bookId, reviewMap);
  }

  function prepareFinalReview(currentUnmasteredWords: string[]) {
    addReviewWords(currentUnmasteredWords);
    const reviewMap = loadReviewMap(bookId);
    const entries = toSortedReviewEntries(reviewMap).slice(0, 10);
    setFinalReviewWords(entries);
  }

  function beginChildRecording(targetSentenceIndex: number) {
    setSentenceIndex(targetSentenceIndex);
    sentenceIndexRef.current = targetSentenceIndex;
    setActiveWordIndex(-1);
    setSelectedWordIndexes([]);
    setReadingState("child_recording");
    setStatusMessage("문장을 따라 읽고, 맞게 읽은 단어를 눌러보자.");
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
    setSelectedWordIndexes([]);
    setReadingState("ai_playing");
    setStatusMessage("AI가 문장을 먼저 읽고 있어요.");
    setActiveWordIndex(0);

    let progressIndex = 0;
    aiWordIntervalRef.current = setInterval(() => {
      progressIndex += 1;
      if (progressIndex >= tokens.length) {
        setActiveWordIndex(tokens.length - 1);
        return;
      }
      setActiveWordIndex(progressIndex);
    }, 240);

    const onFinished = () => {
      if (aiWordIntervalRef.current) {
        clearInterval(aiWordIntervalRef.current);
        aiWordIntervalRef.current = null;
      }
      beginChildRecording(targetSentenceIndex);
    };

    if (
      typeof window !== "undefined" &&
      "speechSynthesis" in window &&
      typeof SpeechSynthesisUtterance !== "undefined"
    ) {
      const utterance = new SpeechSynthesisUtterance(sentence);
      utterance.lang = "ko-KR";
      utterance.rate = 0.95;
      utterance.onend = onFinished;
      utterance.onerror = onFinished;
      speechUtteranceRef.current = utterance;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
      return;
    }

    const fallbackMs = Math.max(1600, Math.min(5200, sentence.length * 95));
    aiFallbackTimerRef.current = setTimeout(onFinished, fallbackMs);
  }

  function finalizePage(targetMatrix: boolean[][]) {
    const unmasteredWords = getPageUnmasteredWords(targetMatrix);

    if (unmasteredWords.length > 0 && !pageReviewDoneRef.current) {
      setPageReviewWords(unmasteredWords);
      setReadingState("page_review");
      setStatusMessage("이 단어 한 번 더 해볼까?");
      return;
    }

    if (nextPageNumber) {
      addReviewWords(unmasteredWords);
      setReadingState("page_transition_wait");
      setStatusMessage(`${AUTO_NEXT_PAGE_MS / 1000}초 후 다음 페이지로 이동합니다.`);
      pageTransitionTimerRef.current = setTimeout(() => {
        router.push(`/session/${bookId}/${nextPageNumber}`);
      }, AUTO_NEXT_PAGE_MS);
      return;
    }

    prepareFinalReview(unmasteredWords);
    setReadingState("final_review");
    setStatusMessage("오늘 읽기에서 다시 보면 좋은 단어를 모았어요.");
  }

  function goNextSentenceOrPage(manualOverride = false, matrixInput?: boolean[][]) {
    stopAllAutomation();
    const matrix = matrixInput ?? masteredBySentenceRef.current;
    const currentSentence = sentenceIndexRef.current;

    if (currentSentence < sentenceTokens.length - 1) {
      const nextSentence = currentSentence + 1;
      setSentenceIndex(nextSentence);
      sentenceIndexRef.current = nextSentence;
      if (manualOverride) {
        setStatusMessage("다음 문장으로 이동했어요.");
      }
      beginAiPlaying(nextSentence);
      return;
    }

    finalizePage(matrix);
  }

  function completeChildRecording() {
    if (readingState !== "child_recording") {
      return;
    }

    const currentSentence = sentenceIndexRef.current;
    const nextAttempt = (attemptCounts[currentSentence] ?? 0) + 1;
    const nextAttemptCounts = [...attemptCounts];
    nextAttemptCounts[currentSentence] = nextAttempt;
    setAttemptCounts(nextAttemptCounts);

    const nextMatrix = masteredBySentence.map((row) => [...row]);
    selectedWordIndexes.forEach((wordIndex) => {
      if (nextMatrix[currentSentence] && typeof nextMatrix[currentSentence][wordIndex] === "boolean") {
        nextMatrix[currentSentence][wordIndex] = true;
      }
    });

    masteredBySentenceRef.current = nextMatrix;
    setMasteredBySentence(nextMatrix);
    setSelectedWordIndexes([]);

    const remainingIndexes = getRemainingWordIndexes(currentSentence, nextMatrix);
    if (remainingIndexes.length > 0 && nextAttempt <= MAX_RETRY_COUNT) {
      setReadingState("sentence_retry_prompt");
      setStatusMessage("이 단어 한 번 더 해볼까?");
      retryPromptTimerRef.current = setTimeout(() => {
        beginAiPlaying(currentSentence);
      }, RETRY_PROMPT_MS);
      return;
    }

    setReadingState("sentence_done");
    if (remainingIndexes.length > 0) {
      setStatusMessage("남은 단어는 페이지 끝에서 다시 연습해보자.");
    } else {
      setStatusMessage(`${AUTO_NEXT_SENTENCE_MS / 1000}초 후 다음 문장으로 이동합니다.`);
    }

    sentenceTransitionTimerRef.current = setTimeout(() => {
      goNextSentenceOrPage(false, nextMatrix);
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
    setStatusMessage("이전 문장으로 이동했어요.");
    beginAiPlaying(prevSentence);
  }

  function handleStop() {
    stopAllAutomation();
    setReadingState("idle");
    setStatusMessage("자동 진행을 중지했어요.");
  }

  function startPageReviewRetry() {
    pageReviewDoneRef.current = true;
    const matrix = masteredBySentenceRef.current;
    const retrySentence = matrix.findIndex((row) => row.some((isMastered) => !isMastered));
    if (retrySentence < 0) {
      finalizePage(matrix);
      return;
    }

    setPageReviewWords([]);
    setSentenceIndex(retrySentence);
    sentenceIndexRef.current = retrySentence;
    setStatusMessage("좋아, 남은 단어부터 다시 해보자.");
    beginAiPlaying(retrySentence);
  }

  function skipPageReview() {
    pageReviewDoneRef.current = true;
    setPageReviewWords([]);
    finalizePage(masteredBySentenceRef.current);
  }

  function toggleWordSelection(wordIndex: number) {
    if (readingState !== "child_recording") {
      return;
    }
    if (currentMastered[wordIndex]) {
      return;
    }
    setSelectedWordIndexes((previous) =>
      previous.includes(wordIndex)
        ? previous.filter((value) => value !== wordIndex)
        : [...previous, wordIndex]
    );
  }

  function resetFinalReviewAndRestart() {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(buildReviewStorageKey(bookId));
    }
    router.push(`/session/${bookId}/1`);
  }

  useEffect(() => {
    sentenceIndexRef.current = sentenceIndex;
  }, [sentenceIndex]);

  useEffect(() => {
    masteredBySentenceRef.current = masteredBySentence;
  }, [masteredBySentence]);

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
    stopAllAutomation();
    pageReviewDoneRef.current = false;
    setPageReviewWords([]);
    setFinalReviewWords([]);

    const initialMastered = sentenceTokens.map((tokens) => tokens.map(() => false));
    setMasteredBySentence(initialMastered);
    masteredBySentenceRef.current = initialMastered;
    const initialAttempts = sentenceTokens.map(() => 0);
    setAttemptCounts(initialAttempts);
    setSelectedWordIndexes([]);
    setSentenceIndex(0);
    sentenceIndexRef.current = 0;

    if (sentenceTokens.length === 0) {
      setReadingState("idle");
      setStatusMessage("이 페이지에 읽을 문장이 없습니다.");
      return;
    }

    setReadingState("idle");
    setStatusMessage("읽기를 시작합니다.");

    const startTimer = setTimeout(() => {
      beginAiPlaying(0);
    }, 100);

    return () => {
      clearTimeout(startTimer);
    };
  }, [sentenceTokens, confirmedText]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      stopAllAutomation();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <main className="container">
      <section className="panel">
        <h1>읽기 연습</h1>
        <p>
          책: <strong>{bookTitle}</strong>
        </p>
        <p>
          페이지: {pageNumber} / {totalPages || "?"}
        </p>
        <p className="muted">
          상태: <code>{readingState}</code>
        </p>
      </section>

      <section className="panel" style={{ marginTop: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}>
          <p className="muted" style={{ margin: 0 }}>
            현재 보기: {pageViewMode === "spread" ? "2페이지" : "1페이지"}
          </p>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              type="button"
              onClick={() => {
                setManualViewMode(true);
                setPageViewMode("single");
              }}
              disabled={pageViewMode === "single"}
            >
              1페이지
            </button>
            <button
              type="button"
              onClick={() => {
                setManualViewMode(true);
                setPageViewMode("spread");
              }}
              disabled={pageViewMode === "spread"}
            >
              2페이지
            </button>
          </div>
        </div>

        <div
          style={{
            marginTop: "0.8rem",
            display: "grid",
            gap: "0.75rem",
            gridTemplateColumns: pageViewMode === "spread" ? "repeat(2, minmax(0, 1fr))" : "1fr"
          }}
        >
          <article className="panel" style={{ padding: "0.65rem" }}>
            <img
              src={imageUrl}
              alt={`book page ${pageNumber}`}
              style={{ width: "100%", maxHeight: "440px", objectFit: "contain", borderRadius: "10px" }}
            />
          </article>
          {pageViewMode === "spread" && (
            <article className="panel" style={{ padding: "0.65rem" }}>
              {nextPageImageUrl ? (
                <img
                  src={nextPageImageUrl}
                  alt={`book page ${nextPageNumber ?? pageNumber + 1}`}
                  style={{ width: "100%", maxHeight: "440px", objectFit: "contain", borderRadius: "10px" }}
                />
              ) : (
                <div
                  style={{
                    minHeight: "220px",
                    display: "grid",
                    placeContent: "center",
                    borderRadius: "10px",
                    border: "1px dashed #b9cced",
                    color: "#4e617f"
                  }}
                >
                  다음 페이지가 없습니다.
                </div>
              )}
            </article>
          )}
        </div>
      </section>

      <section className="panel" style={{ marginTop: "1rem" }}>
        <h2>문장 따라 읽기</h2>
        <p className="muted">
          문장 {sentenceTokens.length === 0 ? 0 : sentenceIndex + 1} / {sentenceTokens.length}
        </p>
        <p style={{ marginTop: "0.6rem", fontSize: "1.05rem", lineHeight: 1.9 }}>
          {currentTokens.length === 0 && <span className="muted">문장이 없습니다.</span>}
          {currentTokens.map((token, index) => {
            const isMastered = currentMastered[index];
            const isActive = readingState === "ai_playing" && activeWordIndex === index;
            const isSelected = readingState === "child_recording" && selectedWordIndexes.includes(index);
            return (
              <button
                key={`${sentenceIndex}-${index}-${token}`}
                type="button"
                onClick={() => toggleWordSelection(index)}
                disabled={readingState !== "child_recording" || isMastered}
                style={{
                  marginRight: "0.45rem",
                  marginBottom: "0.4rem",
                  borderRadius: "10px",
                  border: isMastered || isSelected ? "1px solid #2c7efc" : "1px solid #d4e1f7",
                  background: isMastered || isSelected || isActive ? "#e8f1ff" : "transparent",
                  color: isMastered || isSelected || isActive ? "#1459bb" : "#11203a",
                  padding: "0.2rem 0.45rem",
                  cursor: readingState === "child_recording" && !isMastered ? "pointer" : "default",
                  fontSize: "1rem"
                }}
              >
                {token}
              </button>
            );
          })}
        </p>

        <p className="muted" style={{ marginTop: "0.8rem" }}>
          {statusMessage}
        </p>

        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.8rem" }}>
          <button type="button" onClick={handleStop}>
            중지
          </button>
          <button type="button" onClick={goPrevSentence} disabled={sentenceIndex <= 0}>
            이전 문장
          </button>
          <button
            type="button"
            onClick={() => goNextSentenceOrPage(true)}
            disabled={readingState === "page_transition_wait" || readingState === "final_review"}
          >
            다음 문장 / 페이지
          </button>
          <button
            type="button"
            onClick={completeChildRecording}
            disabled={readingState !== "child_recording"}
          >
            읽기 완료
          </button>
        </div>

        {readingState === "page_review" && (
          <article
            style={{
              marginTop: "1rem",
              border: "1px solid #bfd8ff",
              borderRadius: "12px",
              background: "#f3f8ff",
              padding: "0.8rem"
            }}
          >
            <strong>이 단어 한 번 더 해볼까?</strong>
            <div style={{ marginTop: "0.6rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {pageReviewWords.map((word) => (
                <span
                  key={`page-review-${word}`}
                  style={{
                    border: "1px solid #c7dcff",
                    borderRadius: "999px",
                    padding: "0.2rem 0.55rem",
                    color: "#1459bb",
                    background: "#ffffff"
                  }}
                >
                  {word}
                </span>
              ))}
            </div>
            <div style={{ marginTop: "0.7rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <button type="button" onClick={startPageReviewRetry}>
                다시 해보기
              </button>
              <button type="button" onClick={skipPageReview}>
                다음 페이지로
              </button>
            </div>
          </article>
        )}

        {readingState === "final_review" && (
          <article
            style={{
              marginTop: "1rem",
              border: "1px solid #bfd8ff",
              borderRadius: "12px",
              background: "#f3f8ff",
              padding: "0.8rem"
            }}
          >
            <h3 style={{ marginTop: 0 }}>AI 추천 복습</h3>
            {finalReviewWords.length === 0 ? (
              <p className="muted">오늘은 추천 복습 단어가 없어요. 정말 잘했어요!</p>
            ) : (
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                {finalReviewWords.map((entry) => (
                  <span
                    key={`final-review-${entry.word}`}
                    style={{
                      border: "1px solid #c7dcff",
                      borderRadius: "999px",
                      padding: "0.2rem 0.55rem",
                      color: "#1459bb",
                      background: "#ffffff"
                    }}
                  >
                    {entry.word} · 추천 {entry.count}회
                  </span>
                ))}
              </div>
            )}
            <div style={{ marginTop: "0.7rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <button type="button" onClick={resetFinalReviewAndRestart}>
                추천 단어 다시 읽기
              </button>
              <Link href="/library">책 목록으로</Link>
            </div>
          </article>
        )}
      </section>

      <section className="panel" style={{ marginTop: "1rem" }}>
        <h2>보조 정보</h2>
        <p className="muted">
          단어 타이밍 메타데이터: {hasTimingMetadata ? "사용 가능" : "없음"}
        </p>
        {audioUrl ? (
          <audio controls src={audioUrl} style={{ width: "100%" }} />
        ) : (
          <p className="muted">이 페이지는 저장된 TTS 오디오가 없습니다.</p>
        )}
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.7rem" }}>
          {previousPageNumber ? (
            <Link href={`/session/${bookId}/${previousPageNumber}`}>이전 페이지</Link>
          ) : (
            <span className="muted">첫 페이지</span>
          )}
          {nextPageNumber ? (
            <Link href={`/session/${bookId}/${nextPageNumber}`}>다음 페이지</Link>
          ) : (
            <span className="muted">마지막 페이지</span>
          )}
        </div>
      </section>
    </main>
  );
}
