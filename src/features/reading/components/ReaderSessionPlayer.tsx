"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  SentenceAssessmentResponse,
  SentenceAssessmentWord
} from "@/features/assessment/types/AssessmentTypes";
import type { WordTiming } from "@/shared/types/WordTiming";
import { splitSentences, tokenizeSentence } from "@/shared/utils/textSegmentation";
import styles from "@/features/reading/components/ChildReadingUi.module.css";

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

type ReviewEntry = {
  word: string;
  count: number;
};

type RecordingState = "idle" | "recording" | "processing";

type LastAssessment = {
  provider: "azure";
  score: SentenceAssessmentResponse["score"];
  words: SentenceAssessmentWord[];
  feedback: SentenceAssessmentResponse["feedback"];
};

const AUTO_NEXT_SENTENCE_MS = 2000;
const AUTO_NEXT_PAGE_MS = 5000;
const RETRY_PROMPT_MS = 900;
const MAX_RETRY_COUNT = 1;
const REVIEW_STORAGE_PREFIX = "kids-echo-reading-review";
const LAST_SESSION_STORAGE_KEY = "kids-echo-reading-last-session";

type LastSessionSnapshot = {
  bookId: string;
  bookTitle: string;
  pageNumber: number;
  totalPages: number;
  updatedAt: number;
};

type PrecacheMessage = {
  type: "PRECACHE_URLS";
  payload: string[];
};

function getOrientationDefaultView(): PageViewMode {
  if (typeof window === "undefined") {
    return "single";
  }
  return window.matchMedia("(orientation: landscape)").matches ? "spread" : "single";
}

function buildReviewStorageKey(bookId: string): string {
  return `${REVIEW_STORAGE_PREFIX}:${bookId}`;
}

function saveLastSessionSnapshot(snapshot: LastSessionSnapshot) {
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

function loadReviewMap(bookId: string): Record<string, number> {
  if (typeof window === "undefined") {
    return {};
  }

  const raw = window.localStorage.getItem(buildReviewStorageKey(bookId));
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const next: Record<string, number> = {};
    for (const [word, count] of Object.entries(parsed)) {
      if (typeof count === "number" && Number.isFinite(count) && count > 0) {
        next[word] = Math.floor(count);
      }
    }
    return next;
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

function mergeChannelsToMono(audioBuffer: AudioBuffer): Float32Array {
  const { numberOfChannels, length } = audioBuffer;
  const mono = new Float32Array(length);
  for (let channel = 0; channel < numberOfChannels; channel += 1) {
    const data = audioBuffer.getChannelData(channel);
    for (let index = 0; index < length; index += 1) {
      mono[index] += data[index] / numberOfChannels;
    }
  }
  return mono;
}

function downsampleBuffer(source: Float32Array, sampleRate: number, targetRate: number): Float32Array {
  if (targetRate >= sampleRate) {
    return source;
  }

  const ratio = sampleRate / targetRate;
  const targetLength = Math.floor(source.length / ratio);
  const result = new Float32Array(targetLength);

  for (let index = 0; index < targetLength; index += 1) {
    const sourceStart = Math.floor(index * ratio);
    const sourceEnd = Math.min(source.length, Math.floor((index + 1) * ratio));
    let sum = 0;
    let count = 0;

    for (let sourceIndex = sourceStart; sourceIndex < sourceEnd; sourceIndex += 1) {
      sum += source[sourceIndex];
      count += 1;
    }

    result[index] = count > 0 ? sum / count : 0;
  }

  return result;
}

function encodePcm16Wav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const bytesPerSample = 2;
  const blockAlign = bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  let offset = 0;
  const writeString = (value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
    offset += value.length;
  };

  writeString("RIFF");
  view.setUint32(offset, 36 + dataSize, true);
  offset += 4;
  writeString("WAVE");
  writeString("fmt ");
  view.setUint32(offset, 16, true);
  offset += 4;
  view.setUint16(offset, 1, true);
  offset += 2;
  view.setUint16(offset, 1, true);
  offset += 2;
  view.setUint32(offset, sampleRate, true);
  offset += 4;
  view.setUint32(offset, byteRate, true);
  offset += 4;
  view.setUint16(offset, blockAlign, true);
  offset += 2;
  view.setUint16(offset, 16, true);
  offset += 2;
  writeString("data");
  view.setUint32(offset, dataSize, true);
  offset += 4;

  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    const pcm = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    view.setInt16(offset, pcm, true);
    offset += 2;
  }

  return buffer;
}

async function convertToMonoWavBlob(source: Blob, targetSampleRate = 16000): Promise<Blob> {
  const audioContext = new AudioContext();
  try {
    const sourceBuffer = await source.arrayBuffer();
    const decoded = await audioContext.decodeAudioData(sourceBuffer);
    const mono = mergeChannelsToMono(decoded);
    const downsampled = downsampleBuffer(mono, decoded.sampleRate, targetSampleRate);
    const wavBuffer = encodePcm16Wav(downsampled, targetSampleRate);
    return new Blob([wavBuffer], { type: "audio/wav" });
  } finally {
    await audioContext.close();
  }
}

function getSentenceBoxClassName(readingState: ReadingState): string {
  if (readingState === "ai_playing") {
    return `${styles.sentenceBox} ${styles.statePlay}`;
  }
  if (readingState === "child_recording") {
    return `${styles.sentenceBox} ${styles.stateRecord}`;
  }
  if (readingState === "sentence_done" || readingState === "page_transition_wait") {
    return `${styles.sentenceBox} ${styles.stateDone}`;
  }
  if (readingState === "sentence_retry_prompt" || readingState === "page_review") {
    return `${styles.sentenceBox} ${styles.stateFail}`;
  }
  return `${styles.sentenceBox} ${styles.stateIdle}`;
}

export function ReaderSessionPlayer({
  bookTitle,
  bookId,
  pageId,
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

  const [readingState, setReadingState] = useState<ReadingState>("idle");
  const [statusMessage, setStatusMessage] = useState("준비 완료");
  const [sentenceIndex, setSentenceIndex] = useState(0);
  const [masteredBySentence, setMasteredBySentence] = useState<boolean[][]>([]);
  const [attemptCounts, setAttemptCounts] = useState<number[]>([]);
  const [selectedWordIndexes, setSelectedWordIndexes] = useState<number[]>([]);
  const [activeWordIndex, setActiveWordIndex] = useState(-1);
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [recordingError, setRecordingError] = useState<string>();
  const [sessionId, setSessionId] = useState<string>();
  const [lastAssessment, setLastAssessment] = useState<LastAssessment | null>(null);
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
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);

  const currentTokens = sentenceTokens[sentenceIndex] ?? [];
  const currentMastered = masteredBySentence[sentenceIndex] ?? [];

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

  function stopRecordingStream() {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    mediaRecorderRef.current = null;

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
      mediaStreamRef.current = null;
    }
    recordingChunksRef.current = [];
    setRecordingState("idle");
  }

  function stopAllAutomation() {
    clearFlowTimers();
    stopSpeech();
    stopRecordingStream();
    setActiveWordIndex(-1);
  }

  async function startRecordingCapture() {
    if (typeof window === "undefined" || typeof navigator === "undefined") {
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setRecordingError("현재 브라우저는 마이크 녹음을 지원하지 않습니다.");
      return;
    }
    if (mediaRecorderRef.current || recordingState === "recording" || recordingState === "processing") {
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const mimeCandidates = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/mp4"
      ];
      const supported = mimeCandidates.find((mimeType) => MediaRecorder.isTypeSupported(mimeType));
      const recorder = supported ? new MediaRecorder(stream, { mimeType: supported }) : new MediaRecorder(stream);

      recordingChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecordingError(undefined);
      setRecordingState("recording");
      setStatusMessage("녹음 중이에요. 문장을 끝까지 읽은 뒤 채점 버튼을 눌러주세요.");
    } catch (error) {
      setRecordingState("idle");
      setRecordingError(error instanceof Error ? error.message : "마이크 접근에 실패했습니다.");
    }
  }

  function getRemainingWordIndexes(targetSentenceIndex: number, matrix: boolean[][]): number[] {
    const row = matrix[targetSentenceIndex] ?? [];
    return row
      .map((isMastered, idx) => ({ isMastered, idx }))
      .filter((item) => !item.isMastered)
      .map((item) => item.idx);
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
    setFinalReviewWords(toSortedReviewEntries(reviewMap).slice(0, 8));
  }

  function beginChildRecording(targetSentenceIndex: number) {
    setSentenceIndex(targetSentenceIndex);
    sentenceIndexRef.current = targetSentenceIndex;
    setSelectedWordIndexes([]);
    setLastAssessment(null);
    setActiveWordIndex(-1);
    setReadingState("child_recording");
    setRecordingError(undefined);
    setStatusMessage("자동 진행: 문장 전체를 따라 읽어보자.");
    void startRecordingCapture();
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
    setStatusMessage("자동 진행: 문장 전체를 먼저 들어보자.");
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

    aiFallbackTimerRef.current = setTimeout(
      onFinished,
      Math.max(1600, Math.min(5200, sentence.length * 95))
    );
  }

  async function assessRecordedSentence(audioBlob: Blob) {
    const currentSentence = sentenceIndexRef.current;
    const sentence = sentences[currentSentence] ?? "";

    setRecordingState("processing");
    setRecordingError(undefined);
    setStatusMessage("채점 중입니다. 잠시만 기다려주세요.");

    try {
      const wavBlob = await convertToMonoWavBlob(audioBlob);
      const formData = new FormData();
      formData.set("audio", new File([wavBlob], `reading-${Date.now()}.wav`, { type: "audio/wav" }));
      formData.set("sentenceIndex", String(currentSentence));
      formData.set("sentenceText", sentence);
      formData.set("locale", "en-US");
      if (sessionId) {
        formData.set("sessionId", sessionId);
      }

      const response = await fetch(`/api/reader/books/${bookId}/pages/${pageId}/assessment`, {
        method: "POST",
        body: formData
      });
      const payload = (await response.json()) as
        | SentenceAssessmentResponse
        | {
            error?: string;
          };

      if (!response.ok || !("words" in payload)) {
        throw new Error(("error" in payload ? payload.error : undefined) ?? "채점 요청에 실패했습니다.");
      }

      setSessionId(payload.sessionId);
      setLastAssessment({
        provider: payload.provider,
        score: payload.score,
        words: payload.words,
        feedback: payload.feedback
      });

      const autoMatchedIndexes = payload.words
        .filter((word) => word.state === "correct" || word.state === "partial")
        .map((word) => word.index)
        .filter((index) => Number.isInteger(index) && index >= 0);

      setSelectedWordIndexes(autoMatchedIndexes);
      completeChildRecording(autoMatchedIndexes, payload.feedback.message);
      setRecordingState("idle");
    } catch (error) {
      setRecordingState("idle");
      setRecordingError(error instanceof Error ? error.message : "채점에 실패했습니다.");
      setStatusMessage("채점 실패. 단어를 수동 선택 후 완료할 수 있어요.");
    }
  }

  async function stopRecordingAndAssess() {
    if (readingState !== "child_recording") {
      return;
    }
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== "recording") {
      setStatusMessage("녹음이 시작되지 않았어요. 먼저 녹음 시작 버튼을 눌러주세요.");
      return;
    }

    const stoppedBlob = await new Promise<Blob>((resolve, reject) => {
      recorder.addEventListener(
        "stop",
        () => {
          const blob = new Blob(recordingChunksRef.current, {
            type: recorder.mimeType || "audio/webm"
          });
          resolve(blob);
        },
        { once: true }
      );
      recorder.addEventListener(
        "error",
        () => {
          reject(new Error("녹음 중 오류가 발생했습니다."));
        },
        { once: true }
      );
      recorder.stop();
    });

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
      mediaStreamRef.current = null;
    }
    mediaRecorderRef.current = null;

    if (stoppedBlob.size === 0) {
      setRecordingState("idle");
      setRecordingError("녹음 데이터가 비어 있습니다. 다시 시도해주세요.");
      return;
    }

    await assessRecordedSentence(stoppedBlob);
  }

  function finalizePage(targetMatrix: boolean[][]) {
    const unmasteredWords = getPageUnmasteredWords(targetMatrix);

    if (unmasteredWords.length > 0 && !pageReviewDoneRef.current) {
      setPageReviewWords(unmasteredWords);
      setReadingState("page_review");
      setStatusMessage("페이지 마무리 전에 남은 단어를 한 번 더 해보자.");
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
    setStatusMessage("자주 어려웠던 단어를 먼저 복습해보자.");
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

  function completeChildRecording(
    selectedIndexesOverride?: number[],
    successMessageOverride?: string
  ) {
    if (readingState !== "child_recording") {
      return;
    }

    stopRecordingStream();
    const currentSentence = sentenceIndexRef.current;
    const nextAttempt = (attemptCounts[currentSentence] ?? 0) + 1;
    const nextAttemptCounts = [...attemptCounts];
    nextAttemptCounts[currentSentence] = nextAttempt;
    setAttemptCounts(nextAttemptCounts);

    const nextMatrix = masteredBySentence.map((row) => [...row]);
    const selectedIndexes = selectedIndexesOverride ?? selectedWordIndexes;
    selectedIndexes.forEach((wordIndex) => {
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
      setStatusMessage(successMessageOverride ?? "이 단어 한 번 더 해볼까?");
      retryPromptTimerRef.current = setTimeout(() => {
        beginAiPlaying(currentSentence);
      }, RETRY_PROMPT_MS);
      return;
    }

    setReadingState("sentence_done");
    if (remainingIndexes.length > 0) {
      setStatusMessage(successMessageOverride ?? "남은 단어는 페이지 끝에서 다시 해보자.");
    } else {
      setStatusMessage(
        successMessageOverride ?? `잘 읽었어요. ${AUTO_NEXT_SENTENCE_MS / 1000}초 후 다음 문장으로 이동합니다.`
      );
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
    setStatusMessage("자동 진행이 중지되었습니다.");
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
    pageReviewDoneRef.current = false;
    setPageReviewWords([]);
    setFinalReviewWords([]);
    setLastAssessment(null);
    setRecordingError(undefined);
    setRecordingState("idle");

    const initialMastered = sentenceTokens.map((tokens) => tokens.map(() => false));
    setMasteredBySentence(initialMastered);
    masteredBySentenceRef.current = initialMastered;
    setAttemptCounts(sentenceTokens.map(() => 0));
    setSelectedWordIndexes([]);
    setSentenceIndex(0);
    sentenceIndexRef.current = 0;

    if (sentenceTokens.length === 0) {
      setReadingState("idle");
      setStatusMessage("이 페이지에 읽을 문장이 없습니다.");
      return;
    }

    setReadingState("idle");
    setStatusMessage("준비 완료");

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
            {readingState === "final_review" ? "복습 추천 완료" : `문장 ${sentenceIndex + 1}/${sentences.length || 0}`}
          </span>
        </header>

        {readingState !== "final_review" && (
          <section className={styles.card}>
            <h2>{readingTitle}</h2>
            <p className={styles.subtitle}>
              페이지 {pageNumber} / {totalPages || "?"}
            </p>
            <div className={styles.readingToolbar}>
              <p className={styles.subtitle}>
                현재: {pageViewMode === "spread" ? "두 페이지 보기" : "한 페이지 보기"}
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
                  const filled =
                    currentMastered[index] ||
                    selectedWordIndexes.includes(index) ||
                    (readingState === "ai_playing" && activeWordIndex === index);
                  return (
                    <button
                      key={`${sentenceIndex}-${index}-${token}`}
                      type="button"
                      className={`${styles.scriptToken} ${filled ? styles.tokenFilled : ""}`}
                      onClick={() => toggleWordSelection(index)}
                      disabled={
                        readingState !== "child_recording" ||
                        currentMastered[index] ||
                        recordingState === "processing"
                      }
                    >
                      {token}
                    </button>
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
                onClick={recordingState === "recording" ? stopRecordingAndAssess : startRecordingCapture}
                disabled={readingState !== "child_recording" || recordingState === "processing"}
              >
                {recordingState === "recording"
                  ? "녹음 종료 + 채점"
                  : recordingState === "processing"
                    ? "채점 중..."
                    : "녹음 시작"}
              </button>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnSoft}`}
                onClick={() => completeChildRecording()}
                disabled={readingState !== "child_recording" || recordingState === "processing"}
              >
                수동 완료
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
            {recordingError && <p className={styles.statusLine}>마이크/채점 오류: {recordingError}</p>}

            {lastAssessment && (
              <div className={styles.pageReview}>
                <strong>
                  단어 채점 결과 · 정답 {lastAssessment.feedback.goodWords}/{lastAssessment.words.length}
                </strong>
                <p className={styles.subtitle} style={{ marginTop: 6 }}>
                  {lastAssessment.feedback.message}
                </p>
                <p className={styles.subtitle} style={{ marginTop: 6 }}>
                  점수: 정확도 {Math.round(lastAssessment.score.accuracyScore ?? 0)} / 유창성{" "}
                  {Math.round(lastAssessment.score.fluencyScore ?? 0)} / 완성도{" "}
                  {Math.round(lastAssessment.score.completenessScore ?? 0)}
                </p>
                <ul className={styles.reviewList}>
                  {lastAssessment.words.map((word) => (
                    <li key={`assessment-word-${word.index}-${word.referenceWord}`} className={styles.reviewWord}>
                      {word.referenceWord} · {word.state}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {readingState === "page_review" && (
              <div className={styles.pageReview}>
                <strong>이 단어 한 번 더 해볼까?</strong>
                <ul className={styles.reviewList}>
                  {pageReviewWords.map((word) => (
                    <li key={`review-${word}`} className={styles.reviewWord}>
                      {word}
                    </li>
                  ))}
                </ul>
                <div className={styles.controls}>
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnSoft}`}
                    onClick={startPageReviewRetry}
                  >
                    다시 해보기
                  </button>
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnSoft}`}
                    onClick={skipPageReview}
                  >
                    다음 페이지로
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {readingState === "final_review" && (
          <section className={`${styles.card} ${styles.resultCard}`}>
            <h2>AI 추천 복습</h2>
            <p className={styles.subtitle}>
              {finalReviewWords.length === 0
                ? "오늘은 추천 복습 단어가 없어요. 정말 잘했어요!"
                : "자주 어려웠던 단어를 먼저 복습해보자."}
            </p>
            <ul className={styles.reviewList}>
              {finalReviewWords.length === 0 && <li className={styles.reviewWord}>모든 단어 안정적</li>}
              {finalReviewWords.map((entry) => (
                <li key={`final-${entry.word}`} className={styles.reviewWord}>
                  {entry.word} · 추천 {entry.count}회
                </li>
              ))}
            </ul>
            <div className={styles.controls}>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnSoft}`}
                onClick={resetFinalReviewAndRestart}
              >
                추천 단어 다시 읽기
              </button>
              <Link href="/library" className={`${styles.btn} ${styles.btnSoft}`}>
                다음 책 보기
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
              readingState === "final_review" ? "" : styles.footerNavActive
            }`}
          >
            2. 읽기 연습
          </span>
          <span
            className={`${styles.footerNavItem} ${
              readingState === "final_review" ? styles.footerNavActive : ""
            }`}
          >
            3. 결과 보기
          </span>
        </nav>

        {wordTimings.length === 0 && (
          <div className={styles.errorBox}>
            이 페이지는 단어 타이밍 메타데이터가 없어 문장 루프 중심으로 안내합니다.
          </div>
        )}
      </div>
    </main>
  );
}
