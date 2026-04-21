import type { TtsProfile } from "@/features/tts/types/TtsProfile";
import { createServerSupabaseClient } from "@/server/supabase/server";

type TtsProfileRow = {
  id: string;
  name: string;
  voice_name: string;
  speaking_rate: number | string;
  style_name: string | null;
  sentence_pause_level: "short" | "medium" | "long";
  preview_sample_text: string | null;
  is_default: boolean;
  created_at: string;
};

type ParentSettingsRow = {
  id: string;
  default_tts_profile_id: string | null;
};

const SEEDED_PROFILES = [
  {
    name: "또박또박 따라읽기",
    voice_name: "en-US-Neural2-F",
    speaking_rate: 0.9,
    style_name: "calm",
    sentence_pause_level: "medium",
    preview_sample_text: "Hello, I am ready to read with you.",
    is_default: true
  },
  {
    name: "이야기 모드",
    voice_name: "en-US-Neural2-J",
    speaking_rate: 0.96,
    style_name: "lively",
    sentence_pause_level: "short",
    preview_sample_text: "Once upon a time, there was a tiny caterpillar.",
    is_default: false
  },
  {
    name: "천천히 연습",
    voice_name: "en-US-Neural2-F",
    speaking_rate: 0.82,
    style_name: "calm",
    sentence_pause_level: "long",
    preview_sample_text: "Let us read this sentence slowly, one word at a time.",
    is_default: false
  }
] as const;

function mapProfile(row: TtsProfileRow): TtsProfile {
  const speakingRate =
    typeof row.speaking_rate === "number" ? row.speaking_rate : Number(row.speaking_rate);

  return {
    id: row.id,
    name: row.name,
    voiceName: row.voice_name,
    speakingRate: Number.isFinite(speakingRate) ? speakingRate : 0.9,
    styleName: row.style_name ?? undefined,
    sentencePauseLevel: row.sentence_pause_level,
    previewSampleText: row.preview_sample_text ?? undefined,
    isDefault: row.is_default,
    createdAt: row.created_at
  };
}

async function ensureSeededProfiles() {
  const supabase = createServerSupabaseClient();
  const { data: existing, error: readError } = await supabase.from("tts_profiles").select("id").limit(1);
  if (readError) {
    throw new Error(readError.message);
  }

  if ((existing ?? []).length > 0) {
    return;
  }

  const { error: insertError } = await supabase.from("tts_profiles").insert(SEEDED_PROFILES);
  if (insertError) {
    throw new Error(insertError.message);
  }
}

export async function listTtsProfiles(): Promise<TtsProfile[]> {
  await ensureSeededProfiles();
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("tts_profiles")
    .select(
      "id,name,voice_name,speaking_rate,style_name,sentence_pause_level,preview_sample_text,is_default,created_at"
    )
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as TtsProfileRow[]).map(mapProfile);
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
  await ensureSeededProfiles();
  const supabase = createServerSupabaseClient();

  if (input.isDefault) {
    const { error: clearDefaultError } = await supabase
      .from("tts_profiles")
      .update({ is_default: false })
      .eq("is_default", true);

    if (clearDefaultError) {
      throw new Error(clearDefaultError.message);
    }
  }

  const { data, error } = await supabase
    .from("tts_profiles")
    .insert({
      name: input.name,
      voice_name: input.voiceName,
      speaking_rate: input.speakingRate,
      style_name: input.styleName?.trim() || null,
      sentence_pause_level: input.sentencePauseLevel,
      preview_sample_text: input.previewSampleText?.trim() || null,
      is_default: Boolean(input.isDefault)
    })
    .select(
      "id,name,voice_name,speaking_rate,style_name,sentence_pause_level,preview_sample_text,is_default,created_at"
    )
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const created = mapProfile(data as TtsProfileRow);
  if (created.isDefault) {
    await setParentDefaultTtsProfile(created.id);
  }
  return created;
}

async function getTtsProfileById(profileId: string): Promise<TtsProfile | undefined> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("tts_profiles")
    .select(
      "id,name,voice_name,speaking_rate,style_name,sentence_pause_level,preview_sample_text,is_default,created_at"
    )
    .eq("id", profileId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return undefined;
  }

  return mapProfile(data as TtsProfileRow);
}

export async function getParentDefaultTtsProfileId(): Promise<string> {
  await ensureSeededProfiles();
  const supabase = createServerSupabaseClient();

  const { data: settingsRow, error: settingsError } = await supabase
    .from("parent_settings")
    .select("id,default_tts_profile_id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (settingsError) {
    throw new Error(settingsError.message);
  }

  const settings = settingsRow as ParentSettingsRow | null;
  if (settings?.default_tts_profile_id) {
    return settings.default_tts_profile_id;
  }

  const profiles = await listTtsProfiles();
  const fallback = profiles.find((profile) => profile.isDefault) ?? profiles[0];
  if (!fallback) {
    throw new Error("No TTS profile is available.");
  }

  if (settings?.id) {
    const { error: updateError } = await supabase
      .from("parent_settings")
      .update({ default_tts_profile_id: fallback.id })
      .eq("id", settings.id);
    if (updateError) {
      throw new Error(updateError.message);
    }
  } else {
    const { error: insertError } = await supabase
      .from("parent_settings")
      .insert({ default_tts_profile_id: fallback.id });
    if (insertError) {
      throw new Error(insertError.message);
    }
  }

  return fallback.id;
}

export async function setParentDefaultTtsProfile(profileId: string): Promise<void> {
  await ensureSeededProfiles();
  const supabase = createServerSupabaseClient();

  const profile = await getTtsProfileById(profileId);
  if (!profile) {
    throw new Error("TTS profile not found.");
  }

  const { error: clearDefaultError } = await supabase
    .from("tts_profiles")
    .update({ is_default: false })
    .eq("is_default", true);
  if (clearDefaultError) {
    throw new Error(clearDefaultError.message);
  }

  const { error: setDefaultError } = await supabase
    .from("tts_profiles")
    .update({ is_default: true })
    .eq("id", profileId);
  if (setDefaultError) {
    throw new Error(setDefaultError.message);
  }

  const { data: settingsRow, error: settingsError } = await supabase
    .from("parent_settings")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (settingsError) {
    throw new Error(settingsError.message);
  }

  const settings = settingsRow as { id: string } | null;
  if (settings?.id) {
    const { error: updateError } = await supabase
      .from("parent_settings")
      .update({ default_tts_profile_id: profileId })
      .eq("id", settings.id);
    if (updateError) {
      throw new Error(updateError.message);
    }
    return;
  }

  const { error: insertError } = await supabase
    .from("parent_settings")
    .insert({ default_tts_profile_id: profileId });
  if (insertError) {
    throw new Error(insertError.message);
  }
}

export async function resolveTtsProfileForPage(input: {
  bookId: string;
  pageId: string;
  requestedProfileId?: string;
}): Promise<TtsProfile> {
  await ensureSeededProfiles();

  if (input.requestedProfileId) {
    const requested = await getTtsProfileById(input.requestedProfileId);
    if (!requested) {
      throw new Error("Requested TTS profile does not exist.");
    }
    return requested;
  }

  const supabase = createServerSupabaseClient();
  const { data: pageRow, error: pageError } = await supabase
    .from("book_pages")
    .select("tts_profile_override_id")
    .eq("id", input.pageId)
    .eq("book_id", input.bookId)
    .maybeSingle();

  if (pageError) {
    throw new Error(pageError.message);
  }

  const pageOverrideId = (pageRow as { tts_profile_override_id: string | null } | null)
    ?.tts_profile_override_id;
  if (pageOverrideId) {
    const override = await getTtsProfileById(pageOverrideId);
    if (override) {
      return override;
    }
  }

  const { data: bookRow, error: bookError } = await supabase
    .from("books")
    .select("default_tts_profile_id")
    .eq("id", input.bookId)
    .maybeSingle();

  if (bookError) {
    throw new Error(bookError.message);
  }

  const bookDefaultId = (bookRow as { default_tts_profile_id: string | null } | null)
    ?.default_tts_profile_id;
  if (bookDefaultId) {
    const bookDefault = await getTtsProfileById(bookDefaultId);
    if (bookDefault) {
      return bookDefault;
    }
  }

  const parentDefaultId = await getParentDefaultTtsProfileId();
  const parentDefault = await getTtsProfileById(parentDefaultId);
  if (parentDefault) {
    return parentDefault;
  }

  const profiles = await listTtsProfiles();
  const fallback = profiles[0];
  if (!fallback) {
    throw new Error("No TTS profile is available.");
  }
  return fallback;
}

