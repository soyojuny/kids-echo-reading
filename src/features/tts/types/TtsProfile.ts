export type SentencePauseLevel = "short" | "medium" | "long";

export interface TtsProfile {
  id: string;
  name: string;
  voiceName: string;
  speakingRate: number;
  styleName?: string;
  sentencePauseLevel: SentencePauseLevel;
  previewSampleText?: string;
  isDefault: boolean;
  createdAt: string;
}

