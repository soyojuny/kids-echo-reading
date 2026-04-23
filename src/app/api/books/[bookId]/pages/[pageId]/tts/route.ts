import { NextResponse } from "next/server";
import type { PageTtsAsset } from "@/features/tts/types/PageTtsAsset";
import { normalizePageText } from "@/server/supabase/bookPages";
import { createServerSupabaseClient } from "@/server/supabase/server";
import { resolveTtsProfileForPage } from "@/server/supabase/tts";
import { synthesizePageTts } from "@/server/tts/synthesis";

export const runtime = "nodejs";
export const maxDuration = 60;

type RouteParams = {
  params: Promise<{ bookId: string; pageId: string }>;
};

type PageRow = {
  id: string;
  confirmed_text: string | null;
  input_status: "empty" | "draft" | "ready";
};

type CurrentTextVersionRow = {
  id: string;
};

type TtsAssetRow = {
  id: string;
  page_id: string;
  text_version_id: string;
  tts_profile_id: string;
  audio_path: string;
  duration_ms: number | null;
  timing_json: unknown;
  status: "pending" | "ready" | "failed";
  created_at: string;
};

type ExistingTtsAssetRow = {
  id: string;
  audio_path: string;
};

function asObject(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function mapAsset(row: TtsAssetRow, audioUrl?: string): PageTtsAsset {
  const timing = asObject(row.timing_json);
  const totalDuration =
    timing && typeof timing.totalDurationMs === "number" ? timing.totalDurationMs : row.duration_ms ?? 0;
  const wordTimings = timing && Array.isArray(timing.wordTimings) ? timing.wordTimings : [];

  return {
    id: row.id,
    pageId: row.page_id,
    textVersionId: row.text_version_id,
    ttsProfileId: row.tts_profile_id,
    audioPath: row.audio_path,
    audioUrl,
    durationMs: row.duration_ms ?? undefined,
    timing: {
      totalDurationMs: totalDuration,
      wordTimings: wordTimings as PageTtsAsset["timing"]["wordTimings"]
    },
    status: row.status,
    createdAt: row.created_at
  };
}

export async function GET(_: Request, context: RouteParams) {
  try {
    const { bookId, pageId } = await context.params;
    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from("page_tts_assets")
      .select(
        "id,page_id,text_version_id,tts_profile_id,audio_path,duration_ms,timing_json,status,created_at"
      )
      .eq("page_id", pageId)
      .eq("status", "ready")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ asset: null });
    }

    const row = data as TtsAssetRow;
    const { data: signed } = await supabase.storage.from("book-audio").createSignedUrl(row.audio_path, 60 * 60);
    const asset = mapAsset(row, signed?.signedUrl);
    return NextResponse.json({ bookId, pageId, asset });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request, context: RouteParams) {
  try {
    const { bookId, pageId } = await context.params;
    const payload = (await request.json().catch(() => ({}))) as {
      ttsProfileId?: string;
    };

    const supabase = createServerSupabaseClient();
    const { data: pageData, error: pageError } = await supabase
      .from("book_pages")
      .select("id,confirmed_text,input_status")
      .eq("id", pageId)
      .eq("book_id", bookId)
      .maybeSingle();

    if (pageError) {
      return NextResponse.json({ error: pageError.message }, { status: 500 });
    }

    if (!pageData) {
      return NextResponse.json({ error: "Page not found." }, { status: 404 });
    }

    const page = pageData as PageRow;
    const confirmedText = page.confirmed_text?.trim() ?? "";
    if (!confirmedText || page.input_status !== "ready") {
      return NextResponse.json(
        { error: "페이지 텍스트가 확정(ready) 상태여야 TTS를 생성할 수 있습니다." },
        { status: 400 }
      );
    }

    const ttsProfile = await resolveTtsProfileForPage({
      bookId,
      pageId,
      requestedProfileId: payload.ttsProfileId?.trim() || undefined
    });

    const { data: existingAssetData, error: existingAssetError } = await supabase
      .from("page_tts_assets")
      .select("id,audio_path")
      .eq("page_id", pageId)
      .eq("status", "ready");

    if (existingAssetError) {
      return NextResponse.json({ error: existingAssetError.message }, { status: 500 });
    }

    const existingAssets = (existingAssetData ?? []) as ExistingTtsAssetRow[];

    const { data: textVersionData, error: textVersionError } = await supabase
      .from("page_text_versions")
      .select("id")
      .eq("page_id", pageId)
      .eq("is_current", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (textVersionError) {
      return NextResponse.json({ error: textVersionError.message }, { status: 500 });
    }

    let textVersionId = (textVersionData as CurrentTextVersionRow | null)?.id;
    if (!textVersionId) {
      const { data: createdTextVersion, error: createVersionError } = await supabase
        .from("page_text_versions")
        .insert({
          page_id: pageId,
          source_type: "manual",
          raw_text: confirmedText,
          normalized_text: normalizePageText(confirmedText),
          is_current: true
        })
        .select("id")
        .single();

      if (createVersionError) {
        return NextResponse.json({ error: createVersionError.message }, { status: 500 });
      }

      textVersionId = (createdTextVersion as CurrentTextVersionRow).id;
    }

    const synthesized = await synthesizePageTts({
      text: confirmedText,
      voiceName: ttsProfile.voiceName,
      speakingRate: ttsProfile.speakingRate,
      sentencePauseLevel: ttsProfile.sentencePauseLevel
    });

    const audioPath = `${bookId}/${pageId}/${Date.now()}-${crypto.randomUUID()}.${synthesized.extension}`;
    const { error: uploadError } = await supabase.storage
      .from("book-audio")
      .upload(audioPath, synthesized.audioBuffer, {
        contentType: synthesized.contentType,
        upsert: false
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: assetData, error: createAssetError } = await supabase
      .from("page_tts_assets")
      .insert({
        page_id: pageId,
        text_version_id: textVersionId,
        tts_profile_id: ttsProfile.id,
        audio_path: audioPath,
        duration_ms: synthesized.durationMs,
        timing_json: synthesized.timing,
        status: "ready"
      })
      .select(
        "id,page_id,text_version_id,tts_profile_id,audio_path,duration_ms,timing_json,status,created_at"
      )
      .single();

    if (createAssetError) {
      await supabase.storage.from("book-audio").remove([audioPath]).catch(() => undefined);
      return NextResponse.json({ error: createAssetError.message }, { status: 500 });
    }

    const row = assetData as TtsAssetRow;

    const staleAssetIds = existingAssets.map((asset) => asset.id);
    const staleAudioPaths = existingAssets.map((asset) => asset.audio_path).filter(Boolean);

    if (staleAssetIds.length > 0) {
      const { error: markStaleError } = await supabase
        .from("page_tts_assets")
        .update({ status: "failed" })
        .in("id", staleAssetIds);

      if (markStaleError) {
        try {
          await supabase.from("page_tts_assets").delete().eq("id", row.id);
        } catch {
          // best-effort rollback
        }
        try {
          await supabase.storage.from("book-audio").remove([audioPath]);
        } catch {
          // best-effort rollback
        }
        return NextResponse.json(
          { error: `Failed to replace previous TTS assets: ${markStaleError.message}` },
          { status: 500 }
        );
      }
    }

    if (staleAudioPaths.length > 0) {
      const { error: removeStorageError } = await supabase.storage.from("book-audio").remove(staleAudioPaths);
      if (removeStorageError) {
        console.warn("Failed to remove stale TTS audio files.", removeStorageError);
      }
    }

    if (staleAssetIds.length > 0) {
      const { error: deleteAssetError } = await supabase.from("page_tts_assets").delete().in("id", staleAssetIds);
      if (deleteAssetError) {
        console.warn("Failed to remove stale TTS asset rows.", deleteAssetError);
      }
    }

    const { data: signedAudio } = await supabase.storage.from("book-audio").createSignedUrl(audioPath, 60 * 60);

    return NextResponse.json({
      pageId,
      bookId,
      profile: {
        id: ttsProfile.id,
        name: ttsProfile.name,
        speakingRate: ttsProfile.speakingRate
      },
      provider: synthesized.provider,
      asset: mapAsset(row, signedAudio?.signedUrl)
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
