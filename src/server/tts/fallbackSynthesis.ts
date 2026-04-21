import type { PageTtsTimingJson } from "@/features/tts/types/PageTtsAsset";
import type { SentencePauseLevel } from "@/features/tts/types/TtsProfile";
import type { WordTiming } from "@/shared/types/WordTiming";

type FallbackSynthesisInput = {
  text: string;
  speakingRate: number;
  sentencePauseLevel: SentencePauseLevel;
};

type FallbackSynthesisResult = {
  audioBuffer: Buffer;
  durationMs: number;
  timing: PageTtsTimingJson;
};

const SAMPLE_RATE = 16_000;
const BYTES_PER_SAMPLE = 2;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function pauseFactor(level: SentencePauseLevel): number {
  if (level === "short") {
    return 0.12;
  }
  if (level === "long") {
    return 0.35;
  }
  return 0.22;
}

function buildWordTimings(
  text: string,
  speakingRate: number,
  sentencePauseLevel: SentencePauseLevel
): PageTtsTimingJson {
  const words = text
    .trim()
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);

  if (!words.length) {
    return {
      wordTimings: [],
      totalDurationMs: 600
    };
  }

  const normalizedRate = clamp(speakingRate || 0.9, 0.6, 1.4);
  const baseWordMs = 340 / normalizedRate;
  const gapFactor = pauseFactor(sentencePauseLevel);

  const wordTimings: WordTiming[] = [];
  let cursorMs = 0;

  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    const punctuationBoost = /[.,!?]$/.test(word) ? 100 : 0;
    const wordMs = clamp(Math.round(baseWordMs + Math.min(word.length, 12) * 22), 180, 1200);
    const gapMs = Math.round(wordMs * gapFactor + punctuationBoost);

    const startMs = cursorMs;
    const endMs = startMs + wordMs;
    wordTimings.push({
      index,
      text: word,
      startMs,
      endMs
    });
    cursorMs = endMs + gapMs;
  }

  return {
    wordTimings,
    totalDurationMs: Math.max(cursorMs + 150, 600)
  };
}

function encodePcm16MonoWav(pcm: Int16Array, sampleRate: number): Buffer {
  const dataSize = pcm.length * BYTES_PER_SAMPLE;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * BYTES_PER_SAMPLE, 28);
  buffer.writeUInt16LE(BYTES_PER_SAMPLE, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < pcm.length; i += 1) {
    buffer.writeInt16LE(pcm[i], 44 + i * BYTES_PER_SAMPLE);
  }

  return buffer;
}

export function synthesizeFallbackPageTts(input: FallbackSynthesisInput): FallbackSynthesisResult {
  const timing = buildWordTimings(input.text, input.speakingRate, input.sentencePauseLevel);
  const totalSamples = Math.max(1, Math.ceil((timing.totalDurationMs / 1000) * SAMPLE_RATE));
  const pcm = new Int16Array(totalSamples);

  for (const word of timing.wordTimings) {
    const startSample = Math.floor((word.startMs / 1000) * SAMPLE_RATE);
    const endSample = Math.min(totalSamples, Math.floor((word.endMs / 1000) * SAMPLE_RATE));
    const frequency = 220 + (word.index % 7) * 38;
    const fadeSamples = Math.max(1, Math.floor(SAMPLE_RATE * 0.02));

    for (let sample = startSample; sample < endSample; sample += 1) {
      const local = sample - startSample;
      const length = Math.max(1, endSample - startSample);
      const t = local / SAMPLE_RATE;
      const raw = Math.sin(2 * Math.PI * frequency * t) * 0.24;

      const fadeIn = clamp(local / fadeSamples, 0, 1);
      const fadeOut = clamp((length - local) / fadeSamples, 0, 1);
      const envelope = Math.min(fadeIn, fadeOut);
      const value = raw * envelope;

      const mixed = pcm[sample] + Math.round(value * 32767);
      pcm[sample] = clamp(mixed, -32768, 32767);
    }
  }

  return {
    audioBuffer: encodePcm16MonoWav(pcm, SAMPLE_RATE),
    durationMs: timing.totalDurationMs,
    timing
  };
}

