import { NextResponse } from "next/server";
import { PageInputStatusPolicy } from "@/features/books/domain/PageInputStatusPolicy";
import { fetchBookPages, normalizePageText } from "@/server/supabase/bookPages";
import { createServerSupabaseClient } from "@/server/supabase/server";

type RouteParams = {
  params: Promise<{ bookId: string }>;
};

type UpdateInput = {
  pageId: string;
  confirmedText: string;
  isConfirmed: boolean;
  sourceType?: "manual" | "bulk_paste";
};

export async function POST(request: Request, context: RouteParams) {
  try {
    const { bookId } = await context.params;
    const payload = (await request.json()) as { updates?: UpdateInput[] };
    const updates = payload.updates ?? [];
    if (!updates.length) {
      return NextResponse.json({ error: "updates are required." }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    for (const update of updates) {
      const inputStatus = PageInputStatusPolicy.resolve({
        text: update.confirmedText,
        isConfirmed: update.isConfirmed
      });

      const { error: updatePageError } = await supabase
        .from("book_pages")
        .update({
          confirmed_text: update.confirmedText,
          input_status: inputStatus
        })
        .eq("id", update.pageId)
        .eq("book_id", bookId);

      if (updatePageError) {
        return NextResponse.json({ error: updatePageError.message }, { status: 500 });
      }

      if (update.confirmedText.trim()) {
        const { error: clearCurrentError } = await supabase
          .from("page_text_versions")
          .update({ is_current: false })
          .eq("page_id", update.pageId)
          .eq("is_current", true);

        if (clearCurrentError) {
          return NextResponse.json({ error: clearCurrentError.message }, { status: 500 });
        }

        const { error: createVersionError } = await supabase.from("page_text_versions").insert({
          page_id: update.pageId,
          source_type: update.sourceType ?? "bulk_paste",
          raw_text: update.confirmedText,
          normalized_text: normalizePageText(update.confirmedText),
          is_current: true
        });

        if (createVersionError) {
          return NextResponse.json({ error: createVersionError.message }, { status: 500 });
        }
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
