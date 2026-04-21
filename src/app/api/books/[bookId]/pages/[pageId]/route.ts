import { NextResponse } from "next/server";
import { PageInputStatusPolicy } from "@/features/books/domain/PageInputStatusPolicy";
import { fetchBookPages, normalizePageText } from "@/server/supabase/bookPages";
import { createServerSupabaseClient } from "@/server/supabase/server";

type RouteParams = {
  params: Promise<{ bookId: string; pageId: string }>;
};

type SourceType = "manual" | "bulk_paste";

export async function PATCH(request: Request, context: RouteParams) {
  try {
    const { bookId, pageId } = await context.params;
    const body = (await request.json()) as {
      confirmedText?: string;
      isConfirmed?: boolean;
      sourceType?: SourceType;
    };

    if (typeof body.confirmedText !== "string" || typeof body.isConfirmed !== "boolean") {
      return NextResponse.json(
        { error: "confirmedText(string) and isConfirmed(boolean) are required." },
        { status: 400 }
      );
    }

    const confirmedText = body.confirmedText;
    const sourceType = body.sourceType ?? "manual";
    const inputStatus = PageInputStatusPolicy.resolve({
      text: confirmedText,
      isConfirmed: body.isConfirmed
    });

    const supabase = createServerSupabaseClient();
    const { error: updatePageError } = await supabase
      .from("book_pages")
      .update({
        confirmed_text: confirmedText,
        input_status: inputStatus
      })
      .eq("id", pageId)
      .eq("book_id", bookId);

    if (updatePageError) {
      return NextResponse.json({ error: updatePageError.message }, { status: 500 });
    }

    if (confirmedText.trim()) {
      const { error: clearCurrentError } = await supabase
        .from("page_text_versions")
        .update({ is_current: false })
        .eq("page_id", pageId)
        .eq("is_current", true);

      if (clearCurrentError) {
        return NextResponse.json({ error: clearCurrentError.message }, { status: 500 });
      }

      const { error: createVersionError } = await supabase.from("page_text_versions").insert({
        page_id: pageId,
        source_type: sourceType,
        raw_text: confirmedText,
        normalized_text: normalizePageText(confirmedText),
        is_current: true
      });

      if (createVersionError) {
        return NextResponse.json({ error: createVersionError.message }, { status: 500 });
      }
    }

    const pages = await fetchBookPages(bookId);
    return NextResponse.json({ pages });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
