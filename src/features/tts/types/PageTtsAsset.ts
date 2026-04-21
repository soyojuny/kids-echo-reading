import type { WordTiming } from "@/shared/types/WordTiming";

export type PageTtsAssetStatus = "pending" | "ready" | "failed";

export interface PageTtsTimingJson {
  wordTimings: WordTiming[];
  totalDurationMs: number;
}

export interface PageTtsAsset {
  id: string;
  pageId: string;
  textVersionId: string;
  ttsProfileId: string;
  audioPath: string;
  audioUrl?: string;
  durationMs?: number;
  timing: PageTtsTimingJson;
  status: PageTtsAssetStatus;
  createdAt: string;
}

