import type { PageTtsTimingJson } from "@/features/tts/types/PageTtsAsset";
import type { SentencePauseLevel } from "@/features/tts/types/TtsProfile";
import { synthesizeEdgePageTts } from "@/server/tts/edgeSynthesis";
import { synthesizeFallbackPageTts } from "@/server/tts/fallbackSynthesis";

export type TtsProvider = "fallback" | "edge";

type SynthesizePageTtsInput = {
  text: string;
  voiceName: string;
  speakingRate: number;
  sentencePauseLevel: SentencePauseLevel;
};

type SynthesizePageTtsResult = {
  audioBuffer: Buffer;
  durationMs: number;
  timing: PageTtsTimingJson;
  provider: TtsProvider;
  contentType: "audio/wav" | "audio/mpeg";
  extension: "wav" | "mp3";
};

function readConfiguredProvider(): TtsProvider {
  const raw = process.env.TTS_PROVIDER?.trim().toLowerCase();
  if (raw === "edge") {
    return "edge";
  }
  return "fallback";
}

function shouldUseEdgeOnCurrentRuntime(): boolean {
  const isVercel = process.env.VERCEL === "1";
  const allowServerlessEdge = process.env.EDGE_TTS_ALLOW_SERVERLESS === "true";

  if (isVercel && !allowServerlessEdge) {
    return false;
  }
  return true;
}

export async function synthesizePageTts(input: SynthesizePageTtsInput): Promise<SynthesizePageTtsResult> {
  const configuredProvider = readConfiguredProvider();

  if (configuredProvider === "edge" && shouldUseEdgeOnCurrentRuntime()) {
    try {
      const edgeResult = await synthesizeEdgePageTts({
        text: input.text,
        voiceName: input.voiceName,
        speakingRate: input.speakingRate,
        sentencePauseLevel: input.sentencePauseLevel
      });

      return {
        ...edgeResult,
        provider: "edge",
        contentType: "audio/mpeg",
        extension: "mp3"
      };
    } catch (error) {
      console.error("Edge TTS failed and fallback synthesis will be used.", error);
    }
  } else if (configuredProvider === "edge") {
    console.warn("Edge TTS is disabled in this runtime. Falling back to local synthesis.");
  }

  const fallbackResult = synthesizeFallbackPageTts({
    text: input.text,
    speakingRate: input.speakingRate,
    sentencePauseLevel: input.sentencePauseLevel
  });
  return {
    ...fallbackResult,
    provider: "fallback",
    contentType: "audio/wav",
    extension: "wav"
  };
}
