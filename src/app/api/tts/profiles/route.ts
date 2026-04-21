import { NextResponse } from "next/server";
import { createTtsProfile, listTtsProfiles } from "@/server/supabase/tts";

const PAUSE_LEVELS = new Set(["short", "medium", "long"]);

export async function GET() {
  try {
    const profiles = await listTtsProfiles();
    return NextResponse.json({ profiles });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      name?: string;
      voiceName?: string;
      speakingRate?: number;
      styleName?: string;
      sentencePauseLevel?: "short" | "medium" | "long";
      previewSampleText?: string;
      isDefault?: boolean;
    };

    const name = payload.name?.trim();
    const voiceName = payload.voiceName?.trim();
    const speakingRate = Number(payload.speakingRate ?? 0.9);
    const sentencePauseLevel = payload.sentencePauseLevel ?? "medium";

    if (!name) {
      return NextResponse.json({ error: "name is required." }, { status: 400 });
    }

    if (!voiceName) {
      return NextResponse.json({ error: "voiceName is required." }, { status: 400 });
    }

    if (!Number.isFinite(speakingRate) || speakingRate < 0.6 || speakingRate > 1.4) {
      return NextResponse.json({ error: "speakingRate must be between 0.6 and 1.4." }, { status: 400 });
    }

    if (!PAUSE_LEVELS.has(sentencePauseLevel)) {
      return NextResponse.json({ error: "sentencePauseLevel is invalid." }, { status: 400 });
    }

    const profile = await createTtsProfile({
      name,
      voiceName,
      speakingRate,
      styleName: payload.styleName?.trim() || undefined,
      sentencePauseLevel,
      previewSampleText: payload.previewSampleText?.trim() || undefined,
      isDefault: Boolean(payload.isDefault)
    });

    return NextResponse.json({ profile });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

