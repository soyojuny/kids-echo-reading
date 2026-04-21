import { NextResponse } from "next/server";
import {
  getParentDefaultTtsProfileId,
  listTtsProfiles,
  setParentDefaultTtsProfile
} from "@/server/supabase/tts";

export async function GET() {
  try {
    const [profiles, defaultProfileId] = await Promise.all([
      listTtsProfiles(),
      getParentDefaultTtsProfileId()
    ]);

    return NextResponse.json({
      profiles,
      defaultProfileId
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const payload = (await request.json()) as { defaultProfileId?: string };
    const defaultProfileId = payload.defaultProfileId?.trim();
    if (!defaultProfileId) {
      return NextResponse.json({ error: "defaultProfileId is required." }, { status: 400 });
    }

    await setParentDefaultTtsProfile(defaultProfileId);
    const [profiles, resolvedDefaultProfileId] = await Promise.all([
      listTtsProfiles(),
      getParentDefaultTtsProfileId()
    ]);

    return NextResponse.json({
      profiles,
      defaultProfileId: resolvedDefaultProfileId
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

