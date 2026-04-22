import { getAzureSpeechEnv } from "@/server/core/env";
import { normalizeToken, tokenizeSentence } from "@/shared/utils/textSegmentation";

type AzurePronunciationWord = {
  Word?: string;
  PronunciationAssessment?: {
    AccuracyScore?: number;
    ErrorType?: string;
  };
};

type AzurePronunciationAssessment = {
  AccuracyScore?: number;
  FluencyScore?: number;
  CompletenessScore?: number;
  ProsodyScore?: number;
  PronScore?: number;
};

type AzureNBestRow = {
  Words?: AzurePronunciationWord[];
  PronunciationAssessment?: AzurePronunciationAssessment;
};

type AzureRecognitionResponse = {
  RecognitionStatus?: string;
  NBest?: AzureNBestRow[];
};

export type AssessedWord = {
  index: number;
  referenceWord: string;
  recognizedText?: string;
  state: "correct" | "partial" | "missed" | "wrong" | "inserted";
  accuracyScore?: number;
  errorType?: string;
};

export type PronunciationAssessmentResult = {
  words: AssessedWord[];
  overallScore?: number;
  accuracyScore?: number;
  fluencyScore?: number;
  completenessScore?: number;
  prosodyScore?: number;
};

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function normalizeErrorType(errorType?: string): string | undefined {
  if (!errorType) {
    return undefined;
  }
  return errorType.trim().toLowerCase();
}

function toWordState(params: {
  referenceWord: string;
  recognizedText?: string;
  accuracyScore?: number;
  errorType?: string;
}): AssessedWord["state"] {
  const errorType = normalizeErrorType(params.errorType);
  if (errorType === "omission") {
    return "missed";
  }
  if (errorType === "insertion") {
    return "inserted";
  }
  if (errorType === "mispronunciation") {
    return "wrong";
  }

  const normalizedRef = normalizeToken(params.referenceWord);
  const normalizedRecognized = normalizeToken(params.recognizedText ?? "");
  const isMatched = normalizedRef.length > 0 && normalizedRef === normalizedRecognized;

  if (isMatched && (params.accuracyScore ?? 0) >= 80) {
    return "correct";
  }
  if (isMatched) {
    return "partial";
  }
  if (!params.recognizedText) {
    return "missed";
  }
  return "wrong";
}

function mapWords(
  referenceText: string,
  words: AzurePronunciationWord[] | undefined
): AssessedWord[] {
  const referenceWords = tokenizeSentence(referenceText);
  const recognizedWords = words ?? [];
  const maxLength = Math.max(referenceWords.length, recognizedWords.length);
  const mapped: AssessedWord[] = [];

  for (let index = 0; index < maxLength; index += 1) {
    const referenceWord = referenceWords[index];
    const recognized = recognizedWords[index];
    const recognizedText = recognized?.Word?.trim();
    const accuracyScore = toNumber(recognized?.PronunciationAssessment?.AccuracyScore);
    const errorType = recognized?.PronunciationAssessment?.ErrorType;

    if (!referenceWord) {
      mapped.push({
        index,
        referenceWord: recognizedText ?? "",
        recognizedText,
        accuracyScore,
        errorType,
        state: "inserted"
      });
      continue;
    }

    mapped.push({
      index,
      referenceWord,
      recognizedText,
      accuracyScore,
      errorType,
      state: toWordState({
        referenceWord,
        recognizedText,
        accuracyScore,
        errorType
      })
    });
  }

  return mapped;
}

export async function assessPronunciationWithAzure(input: {
  audioBuffer: Buffer;
  referenceText: string;
  locale: string;
}): Promise<PronunciationAssessmentResult> {
  const { key, region } = getAzureSpeechEnv();
  const endpoint = `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${encodeURIComponent(input.locale)}&format=detailed`;
  const pronunciationConfig = Buffer.from(
    JSON.stringify({
      ReferenceText: input.referenceText,
      GradingSystem: "HundredMark",
      Granularity: "Word",
      Dimension: "Comprehensive",
      EnableMiscue: true
    }),
    "utf8"
  ).toString("base64");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": key,
      "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000",
      Accept: "application/json",
      "Pronunciation-Assessment": pronunciationConfig
    },
    body: new Uint8Array(input.audioBuffer)
  });

  const responseBody = await response.text();
  if (!response.ok) {
    throw new Error(
      `Azure pronunciation request failed (${response.status}): ${responseBody.slice(0, 240)}`
    );
  }

  const parsed = JSON.parse(responseBody) as AzureRecognitionResponse;
  const bestResult = parsed.NBest?.[0];
  const pronunciation = bestResult?.PronunciationAssessment;
  const words = mapWords(input.referenceText, bestResult?.Words);

  return {
    words,
    overallScore: toNumber(pronunciation?.PronScore),
    accuracyScore: toNumber(pronunciation?.AccuracyScore),
    fluencyScore: toNumber(pronunciation?.FluencyScore),
    completenessScore: toNumber(pronunciation?.CompletenessScore),
    prosodyScore: toNumber(pronunciation?.ProsodyScore)
  };
}
