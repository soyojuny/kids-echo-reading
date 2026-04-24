"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { WordTiming } from "@/shared/types/WordTiming";
import { normalizeToken, splitSentences, tokenizeSentence } from "@/shared/utils/textSegmentation";
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

type LocalWordState = "correct" | "partial" | "missed" | "wrong" | "inserted";

type LocalAssessmentWord = {
  index: number;
  referenceWord: string;
  state: LocalWordState;
  recognizedText?: string;
};

type BrowserSpeechRecognitionResult = {
  isFinal?: boolean;
  0?: {
    transcript?: string;
  };
};

type BrowserSpeechRecognitionEvent = {
  results?: ArrayLike<BrowserSpeechRecognitionResult>;
};

type BrowserSpeechRecognitionErrorEvent = {
  error?: string;
  message?: string;
};

type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

const AUTO_NEXT_SENTENCE_MS = 1000;
const AUTO_NEXT_PAGE_MS = 1000;
const CHILD_LISTENING_MAX_MS = 12000;
const LAST_SESSION_STORAGE_KEY = "kids-echo-reading-last-session";

function getSpeechRecognitionConstructor(): (new () => BrowserSpeechRecognition) | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  const host = window as Window & {
    SpeechRecognition?: new () => BrowserSpeechRecognition;
    webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
  };
  return host.SpeechRecognition ?? host.webkitSpeechRecognition;
}

function isPartialWordMatch(reference: string, recognized: string): boolean {
  if (!reference || !recognized) {
    return false;
  }
  if (reference === recognized) {
    return true;
  }

  const minLength = Math.min(reference.length, recognized.length);
  if (minLength < 4) {
    return false;
  }

  return reference.includes(recognized) || recognized.includes(reference);
}

function assessLocalPronunciation(referenceTokens: string[], recognizedText: string): LocalAssessmentWord[] {
  const recognizedTokens = tokenizeSentence(recognizedText);
  const normalizedRecognized = recognizedTokens.map((token) => normalizeToken(token));
  const normalizedReference = referenceTokens.map((token) => normalizeToken(token));
  const assessed: LocalAssessmentWord[] = [];

  let referenceIndex = 0;
  let recognizedIndex = 0;

  while (referenceIndex < referenceTokens.length && recognizedIndex < recognizedTokens.length) {
    const referenceWord = referenceTokens[referenceIndex];
    const recognizedWord = recognizedTokens[recognizedIndex];
    const normalizedRef = normalizedReference[referenceIndex];
    const normalizedRecognizedWord = normalizedRecognized[recognizedIndex];

    if (normalizedRef && normalizedRef === normalizedRecognizedWord) {
      assessed.push({
        index: referenceIndex,
        referenceWord,
        recognizedText: recognizedWord,
        state: "correct"
      });
      referenceIndex += 1;
      recognizedIndex += 1;
      continue;
    }

    const nextRecognized = normalizedRecognized[recognizedIndex + 1];
    if (nextRecognized && nextRecognized === normalizedRef) {
      assessed.push({
        index: assessed.length,
        referenceWord: recognizedWord,
        recognizedText: recognizedWord,
        state: "inserted"
      });
      recognizedIndex += 1;
      continue;
    }

    const nextReference = normalizedReference[referenceIndex + 1];
    if (nextReference && nextReference === normalizedRecognizedWord) {
      assessed.push({
        index: referenceIndex,
        referenceWord,
        state: "missed"
      });
      referenceIndex += 1;
      continue;
    }

    assessed.push({
      index: referenceIndex,
      referenceWord,
      recognizedText: recognizedWord,
      state: isPartialWordMatch(normalizedRef, normalizedRecognizedWord) ? "partial" : "wrong"
    });
    referenceIndex += 1;
    recognizedIndex += 1;
  }

  while (referenceIndex < referenceTokens.length) {
    assessed.push({
      index: referenceIndex,
      referenceWord: referenceTokens[referenceIndex],
      state: "missed"
    });
    referenceIndex += 1;
  }

  while (recognizedIndex < recognizedTokens.length) {
    const recognizedWord = recognizedTokens[recognizedIndex];
    assessed.push({
      index: assessed.length,
      referenceWord: recognizedWord,
      recognizedText: recognizedWord,
      state: "inserted"
    });
    recognizedIndex += 1;
  }

  return assessed;
}

function resolveActiveWordIndex(wordTimings: WordTiming[], currentAudioMs: number): number {
  if (wordTimings.length === 0) {
    return -1;
  }

  if (currentAudioMs < wordTimings[0].startMs) {
    return -1;
  }

  for (let index = 0; index < wordTimings.length; index += 1) {
    const timing = wordTimings[index];
    if (currentAudioMs <= timing.endMs) {
      return index;
    }
  }

  return wordTimings.length - 1;
}

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
  const [speechRecognitionSupported, setSpeechRecognitionSupported] = useState(false);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [highlightedCorrectIndexes, setHighlightedCorrectIndexes] = useState<number[]>([]);

  const sentenceIndexRef = useRef(0);
  const aiWordIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const aiWordTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const sentenceTransitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageTransitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const segmentStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const segmentMonitorFrameRef = useRef<number | null>(null);
  const listeningStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speechUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const segmentAudioRef = useRef<HTMLAudioElement | null>(null);
  const speechRecognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const sentenceAttemptCountRef = useRef<Record<number, number>>({});
  const sentenceAutoAdvanceLockedRef = useRef<Record<number, boolean>>({});

  const currentTokens = sentenceTokens[sentenceIndex] ?? [];
  const highlightedCorrectIndexSet = useMemo(
    () => new Set(highlightedCorrectIndexes),
    [highlightedCorrectIndexes]
  );

  function clearFlowTimers() {
    if (aiWordIntervalRef.current) {
      clearInterval(aiWordIntervalRef.current);
      aiWordIntervalRef.current = null;
    }
    if (aiWordTimersRef.current.length > 0) {
      aiWordTimersRef.current.forEach((timer) => {
        clearTimeout(timer);
      });
      aiWordTimersRef.current = [];
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
    if (listeningStopTimerRef.current) {
      clearTimeout(listeningStopTimerRef.current);
      listeningStopTimerRef.current = null;
    }
    if (segmentMonitorFrameRef.current !== null && typeof window !== "undefined") {
      window.cancelAnimationFrame(segmentMonitorFrameRef.current);
      segmentMonitorFrameRef.current = null;
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
    if (segmentMonitorFrameRef.current !== null && typeof window !== "undefined") {
      window.cancelAnimationFrame(segmentMonitorFrameRef.current);
      segmentMonitorFrameRef.current = null;
    }
    audio.pause();
    audio.onended = null;
    audio.onerror = null;
    audio.onloadedmetadata = null;
    audio.src = "";
    segmentAudioRef.current = null;
  }

  function stopSpeechRecognition() {
    const recognition = speechRecognitionRef.current;
    if (!recognition) {
      return;
    }

    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    try {
      recognition.abort();
    } catch {
      // Ignore abort errors while recognition has not started yet.
    }
    if (listeningStopTimerRef.current) {
      clearTimeout(listeningStopTimerRef.current);
      listeningStopTimerRef.current = null;
    }
    speechRecognitionRef.current = null;
    setIsRecognizing(false);
  }

  function stopAllAutomation() {
    clearFlowTimers();
    stopSpeech();
    stopSegmentAudio();
    stopSpeechRecognition();
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

    const nextTiming = wordTimings[range.endWordIndex + 1];
    const startMs = Math.max(0, startTiming.startMs - 80);
    const paddedEndMs = endTiming.endMs + 90;
    const boundedEndMs =
      nextTiming && Number.isFinite(nextTiming.startMs)
        ? Math.min(paddedEndMs, Math.max(endTiming.endMs + 30, nextTiming.startMs - 40))
        : paddedEndMs;
    const endMs = Math.max(startMs + 320, boundedEndMs);
    return { startMs, endMs };
  }

  function getSentenceWordTimings(targetSentenceIndex: number): WordTiming[] | undefined {
    const range = sentenceWordRanges[targetSentenceIndex];
    if (!range || range.tokenCount <= 0) {
      return undefined;
    }

    const sentenceTimingSlice = wordTimings.slice(range.startWordIndex, range.startWordIndex + range.tokenCount);
    if (sentenceTimingSlice.length !== range.tokenCount) {
      return undefined;
    }

    const hasInvalid = sentenceTimingSlice.some(
      (timing) =>
        !Number.isFinite(timing.startMs) ||
        !Number.isFinite(timing.endMs) ||
        timing.endMs <= timing.startMs
    );
    if (hasInvalid) {
      return undefined;
    }

    return sentenceTimingSlice;
  }

  function startFallbackWordHighlight(tokenCount: number, totalDurationMs: number) {
    if (tokenCount <= 0) {
      setActiveWordIndex(-1);
      return;
    }

    setActiveWordIndex(0);
    if (tokenCount === 1) {
      return;
    }

    const intervalMs = Math.max(120, Math.floor(totalDurationMs / tokenCount));
    let indexCursor = 0;
    aiWordIntervalRef.current = setInterval(() => {
      indexCursor += 1;
      if (indexCursor >= tokenCount) {
        setActiveWordIndex(tokenCount - 1);
        if (aiWordIntervalRef.current) {
          clearInterval(aiWordIntervalRef.current);
          aiWordIntervalRef.current = null;
        }
        return;
      }
      setActiveWordIndex(indexCursor);
    }, intervalMs);
  }

  function startSyncedWordHighlight(targetSentenceIndex: number, segmentStartMs: number): boolean {
    const sentenceTimingSlice = getSentenceWordTimings(targetSentenceIndex);
    const tokenCount = sentenceTokens[targetSentenceIndex]?.length ?? 0;
    if (!sentenceTimingSlice || tokenCount !== sentenceTimingSlice.length) {
      return false;
    }

    setActiveWordIndex(-1);
    sentenceTimingSlice.forEach((timing, index) => {
      const delayMs = Math.max(0, timing.startMs - segmentStartMs);
      const timer = setTimeout(() => {
        setActiveWordIndex(index);
      }, delayMs);
      aiWordTimersRef.current.push(timer);
    });

    const lastTiming = sentenceTimingSlice[sentenceTimingSlice.length - 1];
    const endTimer = setTimeout(() => {
      setActiveWordIndex(sentenceTimingSlice.length - 1);
    }, Math.max(0, lastTiming.endMs - segmentStartMs));
    aiWordTimersRef.current.push(endTimer);
    return true;
  }

  function playAudioSegment(
    startMs: number,
    endMs: number,
    onFinished: () => void,
    onProgress?: (currentAudioMs: number) => void
  ): boolean {
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
          const stopAtSec = Math.max(clampedStart + 0.12, endSec - 0.03);
          const monitor = () => {
            if (finished || segmentAudioRef.current !== audio) {
              return;
            }

            const currentAudioMs = Math.max(0, Math.round(audio.currentTime * 1000));
            onProgress?.(currentAudioMs);
            if (audio.currentTime >= stopAtSec) {
              finishOnce();
              return;
            }

            if (typeof window !== "undefined") {
              segmentMonitorFrameRef.current = window.requestAnimationFrame(monitor);
            }
          };

          if (typeof window !== "undefined") {
            segmentMonitorFrameRef.current = window.requestAnimationFrame(monitor);
          }

          const stopMs = Math.max(240, (endSec - clampedStart) * 1000 + 120);
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
    setHighlightedCorrectIndexes([]);
    setReadingState("child_reading");
    setStatusMessage("듣기 모드입니다. 문장을 따라 읽어 주세요.");
    startChildListening(targetSentenceIndex);
  }

  function beginSpeechRecognitionAssessment(
    targetSentenceIndex: number,
    onFinished: (result: { localAssessment: LocalAssessmentWord[]; tokenCount: number }) => void
  ) {
    if (isRecognizing) {
      return;
    }

    const RecognitionConstructor = getSpeechRecognitionConstructor();
    if (!RecognitionConstructor) {
      setStatusMessage("이 브라우저는 음성 인식을 지원하지 않습니다.");
      return;
    }

    const referenceTokens = sentenceTokens[targetSentenceIndex] ?? [];
    if (referenceTokens.length === 0) {
      setStatusMessage("평가할 문장이 없습니다.");
      return;
    }

    setIsRecognizing(true);

    const recognition = new RecognitionConstructor();
    speechRecognitionRef.current = recognition;
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    let latestTranscript = "";
    let hadError = false;

    recognition.onresult = (event) => {
      const results = event.results;
      if (!results) {
        return;
      }

      let merged = "";
      for (let index = 0; index < results.length; index += 1) {
        const transcript = results[index]?.[0]?.transcript;
        if (typeof transcript === "string" && transcript.trim()) {
          merged += `${transcript.trim()} `;
        }
      }
      latestTranscript = merged.trim();
    };

    recognition.onerror = (event) => {
      hadError = true;
      setStatusMessage(
        `음성 인식에 실패했습니다${event.error ? ` (${event.error})` : ""}. 다시 시도해 주세요.`
      );
    };

    recognition.onend = () => {
      if (listeningStopTimerRef.current) {
        clearTimeout(listeningStopTimerRef.current);
        listeningStopTimerRef.current = null;
      }
      speechRecognitionRef.current = null;
      setIsRecognizing(false);

      if (hadError) {
        return;
      }

      if (!latestTranscript) {
        onFinished({ localAssessment: [], tokenCount: referenceTokens.length });
        return;
      }

      const localAssessment = assessLocalPronunciation(referenceTokens, latestTranscript);
      onFinished({ localAssessment, tokenCount: referenceTokens.length });
    };

    try {
      recognition.start();
      if (listeningStopTimerRef.current) {
        clearTimeout(listeningStopTimerRef.current);
      }
      listeningStopTimerRef.current = setTimeout(() => {
        if (!speechRecognitionRef.current) {
          return;
        }
        try {
          speechRecognitionRef.current.stop();
        } catch {
          // Ignore stop errors when recognition already ended.
        }
      }, CHILD_LISTENING_MAX_MS);
      setStatusMessage("듣고 있어요. 천천히 또박또박 읽어 주세요.");
    } catch {
      if (listeningStopTimerRef.current) {
        clearTimeout(listeningStopTimerRef.current);
        listeningStopTimerRef.current = null;
      }
      speechRecognitionRef.current = null;
      setIsRecognizing(false);
      setStatusMessage("음성 인식을 시작하지 못했습니다. 다시 시도해 주세요.");
    }
  }

  function startChildListening(targetSentenceIndex: number) {
    beginSpeechRecognitionAssessment(targetSentenceIndex, ({ localAssessment, tokenCount }) => {
      const correctIndexes = localAssessment
        .filter((word) => word.state === "correct" && word.index >= 0 && word.index < tokenCount)
        .map((word) => word.index);
      const dedupedCorrectIndexes = [...new Set(correctIndexes)];
      setHighlightedCorrectIndexes(dedupedCorrectIndexes);

      const attemptCount = (sentenceAttemptCountRef.current[targetSentenceIndex] ?? 0) + 1;
      sentenceAttemptCountRef.current[targetSentenceIndex] = attemptCount;
      const isSentenceCompleted = tokenCount > 0 && dedupedCorrectIndexes.length === tokenCount;
      const autoAdvanceLocked = sentenceAutoAdvanceLockedRef.current[targetSentenceIndex] ?? false;

      if (isSentenceCompleted && !autoAdvanceLocked) {
        setReadingState("sentence_done");
        setStatusMessage(`${AUTO_NEXT_SENTENCE_MS / 1000}초 후 다음 문장으로 이동합니다.`);
        sentenceTransitionTimerRef.current = setTimeout(() => {
          goNextSentenceOrPage(false);
        }, AUTO_NEXT_SENTENCE_MS);
        return;
      }

      setReadingState("child_reading");
      if (isSentenceCompleted && autoAdvanceLocked) {
        setStatusMessage("정확히 읽었어요. 다음 문장/페이지 버튼을 누르면 이동합니다.");
        return;
      }

      if (attemptCount < 2) {
        setStatusMessage("정확히 읽은 단어가 표시됐어요. 다시 한번 말해 보세요.");
        startChildListening(targetSentenceIndex);
        return;
      }

      sentenceAutoAdvanceLockedRef.current[targetSentenceIndex] = true;
      setStatusMessage("현재 문장에 머물러요. 다음 문장/페이지 버튼을 누르면 이동합니다.");
    });
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
    sentenceAttemptCountRef.current[targetSentenceIndex] = 0;
    sentenceAutoAdvanceLockedRef.current[targetSentenceIndex] = false;
    setHighlightedCorrectIndexes([]);
    setReadingState("ai_playing");
    setStatusMessage("AI가 먼저 읽고 있어요.");

    const timingRange = getSentenceTimingRange(targetSentenceIndex);
    const sentenceWordTimings = getSentenceWordTimings(targetSentenceIndex);

    const onFinished = () => {
      if (aiWordIntervalRef.current) {
        clearInterval(aiWordIntervalRef.current);
        aiWordIntervalRef.current = null;
      }
      if (aiWordTimersRef.current.length > 0) {
        aiWordTimersRef.current.forEach((timer) => {
          clearTimeout(timer);
        });
        aiWordTimersRef.current = [];
      }
      beginChildReading(targetSentenceIndex);
    };

    if (
      timingRange &&
      playAudioSegment(timingRange.startMs, timingRange.endMs, onFinished, (currentAudioMs) => {
        if (!sentenceWordTimings) {
          return;
        }
        const nextIndex = resolveActiveWordIndex(sentenceWordTimings, currentAudioMs);
        setActiveWordIndex((previous) => (previous === nextIndex ? previous : nextIndex));
      })
    ) {
      if (!sentenceWordTimings) {
        startFallbackWordHighlight(tokens.length, timingRange.endMs - timingRange.startMs);
      }
      return;
    }

    if (targetSentenceIndex === 0 && playWholeAudio(onFinished)) {
      if (sentenceWordTimings) {
        startSyncedWordHighlight(targetSentenceIndex, 0);
      } else {
        startFallbackWordHighlight(tokens.length, Math.max(1800, sentence.length * 90));
      }
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
      startFallbackWordHighlight(tokens.length, Math.max(1800, sentence.length * 90));
      return;
    }

    startFallbackWordHighlight(tokens.length, Math.max(1500, Math.min(5200, sentence.length * 90)));
    aiFallbackTimerRef.current = setTimeout(
      onFinished,
      Math.max(1500, Math.min(5200, sentence.length * 90))
    );
  }

  function finalizePage(immediate = false) {
    stopAllAutomation();
    if (nextPageNumber) {
      if (immediate) {
        router.push(`/session/${bookId}/${nextPageNumber}`);
        return;
      }
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

    finalizePage(manualOverride);
  }

  function completeChildReading() {
    if (readingState !== "child_reading") {
      return;
    }
    if (!speechRecognitionSupported) {
      setStatusMessage("이 브라우저는 음성 인식을 지원하지 않습니다.");
      return;
    }
    if (isRecognizing) {
      setStatusMessage("음성 인식이 진행 중입니다. 잠시만 기다려 주세요.");
      return;
    }

    startChildListening(sentenceIndexRef.current);
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
    setSpeechRecognitionSupported(Boolean(getSpeechRecognitionConstructor()));
  }, []);

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
    setHighlightedCorrectIndexes([]);
    sentenceAttemptCountRef.current = {};
    sentenceAutoAdvanceLockedRef.current = {};

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
                  const activeByAi = readingState === "ai_playing" && activeWordIndex === index;
                  const activeByChild =
                    readingState !== "ai_playing" && highlightedCorrectIndexSet.has(index);
                  return (
                    <span
                      key={`${sentenceIndex}-${index}-${token}`}
                      className={`${styles.scriptToken} ${
                        activeByAi || activeByChild ? styles.tokenFilled : ""
                      }`}
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
                disabled={readingState !== "child_reading" || !speechRecognitionSupported || isRecognizing}
              >
                {isRecognizing ? "듣는 중..." : "듣기 다시 시작"}
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

            {!speechRecognitionSupported && (
              <div className={styles.errorBox}>
                이 브라우저는 Web Speech API를 지원하지 않아 음성 인식을 사용할 수 없습니다.
              </div>
            )}
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

