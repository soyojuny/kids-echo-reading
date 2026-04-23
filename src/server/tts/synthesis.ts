import type { PageTtsTimingJson } from "@/features/tts/types/PageTtsAsset";
import type { SentencePauseLevel } from "@/features/tts/types/TtsProfile";
import { synthesizeEdgePageTts } from "@/server/tts/edgeSynthesis";

export type TtsProvider = "edge" | "google" | "azure";

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
  if (!raw) {
    return "edge";
  }

  if (raw === "edge" || raw === "google" || raw === "azure") {
    return raw as TtsProvider;
  }

  throw new Error(
    'Unsupported TTS provider configuration. Set TTS_PROVIDER to one of: "edge", "google", "azure".'
  );
}

function assertImplementedProvider(provider: TtsProvider): asserts provider is "edge" {
  if (provider === "edge") {
    return;
  }

  throw new Error(`TTS provider "${provider}" is configured but not implemented in this runtime yet.`);
}

export async function synthesizePageTts(input: SynthesizePageTtsInput): Promise<SynthesizePageTtsResult> {
  const provider = readConfiguredProvider();
  assertImplementedProvider(provider);

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
}
