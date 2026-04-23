import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { PageTtsTimingJson } from "@/features/tts/types/PageTtsAsset";
import type { SentencePauseLevel } from "@/features/tts/types/TtsProfile";
import type { WordTiming } from "@/shared/types/WordTiming";

// `ws` optional native addons can fail to load in some local runtimes.
// Force pure JS path to avoid `bufferUtil.mask is not a function`.
if (!process.env.WS_NO_BUFFER_UTIL) {
  process.env.WS_NO_BUFFER_UTIL = "1";
}
if (!process.env.WS_NO_UTF_8_VALIDATE) {
  process.env.WS_NO_UTF_8_VALIDATE = "1";
}

type EdgeTtsModule = {
  EdgeTTS: new (config?: {
    voice?: string;
    lang?: string;
    outputFormat?: string;
    saveSubtitles?: boolean;
    proxy?: string;
    rate?: string;
    pitch?: string;
    volume?: string;
    timeout?: number;
  }) => {
    ttsPromise(text: string, audioPath: string): Promise<unknown>;
  };
};

let edgeTtsModulePromise: Promise<EdgeTtsModule> | undefined;

async function loadEdgeTtsModule(): Promise<EdgeTtsModule> {
  if (!edgeTtsModulePromise) {
    edgeTtsModulePromise = import("node-edge-tts") as Promise<EdgeTtsModule>;
  }
  return edgeTtsModulePromise;
}

type EdgeSynthesisInput = {
  text: string;
  voiceName: string;
  speakingRate: number;
  sentencePauseLevel: SentencePauseLevel;
};

type EdgeSynthesisResult = {
  audioBuffer: Buffer;
  durationMs: number;
  timing: PageTtsTimingJson;
};

type SubtitleCue = {
  part: string;
  start: number;
  end: number;
};

type TimedToken = {
  text: string;
  normalized: string;
  startMs: number;
  endMs: number;
};

const LEGACY_VOICE_MAP: Record<string, string> = {
  "en-US-Neural2-F": "en-US-AriaNeural",
  "en-US-Neural2-J": "en-US-GuyNeural"
};

function normalizeEdgeVoiceName(voiceName: string): string {
  const normalized = voiceName.trim();
  return LEGACY_VOICE_MAP[normalized] ?? normalized;
}

function deriveLangFromVoice(voiceName: string): string | undefined {
  const matched = voiceName.match(/^([a-z]{2}-[A-Z]{2})-/);
  return matched?.[1];
}

function toEdgeRateValue(speakingRate: number): string {
  if (!Number.isFinite(speakingRate)) {
    return "default";
  }

  const percent = Math.round((speakingRate - 1) * 100);
  if (percent === 0) {
    return "default";
  }

  const clamped = Math.max(-50, Math.min(percent, 100));
  return `${clamped >= 0 ? "+" : ""}${clamped}%`;
}

function readTimeoutMs(): number {
  const raw = process.env.EDGE_TTS_TIMEOUT_MS?.trim();
  if (!raw) {
    return 20_000;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 20_000;
  }

  return Math.round(parsed);
}

function readHardTimeoutMs(): number {
  const raw = process.env.EDGE_TTS_HARD_TIMEOUT_MS?.trim();
  if (!raw) {
    return 8_000;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 8_000;
  }

  return Math.round(parsed);
}

async function withTimeout<T>(task: Promise<T>, timeoutMs: number): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Edge TTS hard timeout exceeded (${timeoutMs}ms)`));
    }, timeoutMs);

    task
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error: unknown) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function parseSubtitleDurationMs(raw: string): number | undefined {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return undefined;
    }

    const subtitleDuration = parsed.reduce((maxEnd, item) => {
      const cue = item as SubtitleCue;
      if (typeof cue?.end !== "number") {
        return maxEnd;
      }
      return cue.end > maxEnd ? cue.end : maxEnd;
    }, 0);

    return subtitleDuration > 0 ? subtitleDuration : undefined;
  } catch {
    return undefined;
  }
}

function normalizeTokenForMatch(token: string): string {
  return token
    .toLowerCase()
    .replace(/[^\p{L}\p{N}'-]+/gu, "")
    .trim();
}

function tokenizeByWhitespace(text: string): string[] {
  return text
    .trim()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function parseSubtitleCues(raw: string): SubtitleCue[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => {
        if (typeof item !== "object" || item === null) {
          return undefined;
        }
        const row = item as Record<string, unknown>;
        const part = typeof row.part === "string" ? row.part : "";
        const start = typeof row.start === "number" ? row.start : Number(row.start);
        const end = typeof row.end === "number" ? row.end : Number(row.end);

        if (!part.trim() || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
          return undefined;
        }
        return {
          part,
          start: Math.max(0, Math.round(start)),
          end: Math.max(0, Math.round(end))
        } satisfies SubtitleCue;
      })
      .filter((cue): cue is SubtitleCue => Boolean(cue))
      .sort((a, b) => a.start - b.start);
  } catch {
    return [];
  }
}

function expandCuesToTimedTokens(cues: SubtitleCue[]): TimedToken[] {
  const expanded: TimedToken[] = [];
  for (const cue of cues) {
    const cueTokens = tokenizeByWhitespace(cue.part);
    if (cueTokens.length === 0) {
      continue;
    }

    if (cueTokens.length === 1) {
      const normalized = normalizeTokenForMatch(cueTokens[0]);
      expanded.push({
        text: cueTokens[0],
        normalized,
        startMs: cue.start,
        endMs: cue.end
      });
      continue;
    }

    const weighted = cueTokens.map((token) => ({
      token,
      weight: Math.max(1, normalizeTokenForMatch(token).length)
    }));
    const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
    const totalDuration = Math.max(1, cue.end - cue.start);

    let cursor = cue.start;
    weighted.forEach((item, index) => {
      const isLast = index === weighted.length - 1;
      const slice = isLast
        ? cue.end - cursor
        : Math.max(1, Math.round((totalDuration * item.weight) / totalWeight));
      const endMs = isLast ? cue.end : Math.min(cue.end, cursor + slice);
      expanded.push({
        text: item.token,
        normalized: normalizeTokenForMatch(item.token),
        startMs: cursor,
        endMs
      });
      cursor = endMs;
    });
  }
  return expanded;
}

function buildWordTimingsFromSubtitles(text: string, cues: SubtitleCue[]): WordTiming[] | undefined {
  const sourceTokens = tokenizeByWhitespace(text);
  if (sourceTokens.length === 0) {
    return [];
  }

  const timedTokens = expandCuesToTimedTokens(cues);
  if (timedTokens.length === 0) {
    return undefined;
  }

  const wordTimings: WordTiming[] = [];
  let timedCursor = 0;
  let previousEnd = 0;
  let exactMatchCount = 0;

  sourceTokens.forEach((token, index) => {
    const normalizedSource = normalizeTokenForMatch(token);

    let matchIndex = -1;
    if (normalizedSource) {
      const lookaheadEnd = Math.min(timedTokens.length, timedCursor + 8);
      for (let probe = timedCursor; probe < lookaheadEnd; probe += 1) {
        if (timedTokens[probe].normalized === normalizedSource) {
          matchIndex = probe;
          break;
        }
      }
    }

    if (matchIndex >= 0) {
      exactMatchCount += 1;
    }

    const candidateIndex =
      matchIndex >= 0 ? matchIndex : Math.min(timedCursor, Math.max(0, timedTokens.length - 1));
    const candidate = timedTokens[candidateIndex];

    const startMs = Math.max(previousEnd, candidate?.startMs ?? previousEnd);
    const endMs = Math.max(startMs + 60, candidate?.endMs ?? startMs + 220);

    wordTimings.push({
      index,
      text: token,
      startMs,
      endMs
    });

    previousEnd = endMs;
    timedCursor = Math.min(timedTokens.length, candidateIndex + 1);
  });

  const exactMatchRatio = exactMatchCount / sourceTokens.length;
  if (exactMatchRatio < 0.45) {
    return undefined;
  }

  return wordTimings;
}

export async function synthesizeEdgePageTts(input: EdgeSynthesisInput): Promise<EdgeSynthesisResult> {
  const tempDir = await mkdtemp(path.join(tmpdir(), "edge-tts-"));
  const audioPath = path.join(tempDir, "page.mp3");
  const subtitlePath = `${audioPath}.json`;
  const { EdgeTTS } = await loadEdgeTtsModule();

  const voiceName = normalizeEdgeVoiceName(input.voiceName);
  const tts = new EdgeTTS({
    voice: voiceName,
    lang: deriveLangFromVoice(voiceName),
    outputFormat: process.env.EDGE_TTS_OUTPUT_FORMAT || "audio-24khz-48kbitrate-mono-mp3",
    saveSubtitles: true,
    rate: toEdgeRateValue(input.speakingRate),
    timeout: readTimeoutMs()
  });

  try {
    await withTimeout(tts.ttsPromise(input.text, audioPath), readHardTimeoutMs());
    const audioBuffer = await readFile(audioPath);

    const subtitleRaw = await readFile(subtitlePath, "utf8").catch(() => "");
    if (!subtitleRaw.trim()) {
      throw new Error("Edge TTS subtitle metadata is missing.");
    }

    const subtitleCues = parseSubtitleCues(subtitleRaw);
    if (subtitleCues.length === 0) {
      throw new Error("Edge TTS returned empty subtitle metadata.");
    }

    const subtitleDuration = parseSubtitleDurationMs(subtitleRaw);
    const edgeWordTimings = buildWordTimingsFromSubtitles(input.text, subtitleCues);
    if (!edgeWordTimings || edgeWordTimings.length === 0) {
      throw new Error("Failed to map Edge subtitle metadata to word timings.");
    }

    const wordTimings = edgeWordTimings;
    const lastWordEndMs = wordTimings.length > 0 ? wordTimings[wordTimings.length - 1].endMs : 0;
    const durationMs = Math.max(subtitleDuration ?? 0, lastWordEndMs);
    if (durationMs <= 0) {
      throw new Error("Failed to calculate Edge TTS duration from metadata.");
    }

    return {
      audioBuffer,
      durationMs,
      timing: {
        wordTimings,
        totalDurationMs: durationMs
      }
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
