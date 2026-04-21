import type { TtsProfile } from "@/features/tts/types/TtsProfile";

export type TtsSettingsPayload = {
  profiles: TtsProfile[];
  defaultProfileId?: string;
};

async function parseJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? String(payload.error)
        : `Request failed (${response.status})`;
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export async function fetchTtsSettings(): Promise<TtsSettingsPayload> {
  const response = await fetch("/api/tts/settings");
  return parseJsonResponse<TtsSettingsPayload>(response);
}

export async function createTtsProfile(input: {
  name: string;
  voiceName: string;
  speakingRate: number;
  styleName?: string;
  sentencePauseLevel: "short" | "medium" | "long";
  previewSampleText?: string;
  isDefault?: boolean;
}): Promise<TtsProfile> {
  const response = await fetch("/api/tts/profiles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });

  const payload = await parseJsonResponse<{ profile: TtsProfile }>(response);
  return payload.profile;
}

export async function updateDefaultTtsProfile(defaultProfileId: string): Promise<TtsSettingsPayload> {
  const response = await fetch("/api/tts/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ defaultProfileId })
  });

  return parseJsonResponse<TtsSettingsPayload>(response);
}

