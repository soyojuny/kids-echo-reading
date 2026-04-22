import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { EdgeTTS } from "node-edge-tts";
import type { PageTtsTimingJson } from "@/features/tts/types/PageTtsAsset";
import type { SentencePauseLevel } from "@/features/tts/types/TtsProfile";
import { estimateFallbackTiming } from "@/server/tts/fallbackSynthesis";

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
  start: number;
  end: number;
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

export async function synthesizeEdgePageTts(input: EdgeSynthesisInput): Promise<EdgeSynthesisResult> {
  const tempDir = await mkdtemp(path.join(tmpdir(), "edge-tts-"));
  const audioPath = path.join(tempDir, "page.mp3");
  const subtitlePath = `${audioPath}.json`;

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
    await tts.ttsPromise(input.text, audioPath);
    const audioBuffer = await readFile(audioPath);
    const estimatedTiming = estimateFallbackTiming(
      input.text,
      input.speakingRate,
      input.sentencePauseLevel
    );

    const subtitleDuration = parseSubtitleDurationMs(
      await readFile(subtitlePath, "utf8").catch(() => "")
    );
    const durationMs = Math.max(estimatedTiming.totalDurationMs, subtitleDuration ?? 0);

    return {
      audioBuffer,
      durationMs,
      timing: {
        ...estimatedTiming,
        totalDurationMs: durationMs
      }
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
