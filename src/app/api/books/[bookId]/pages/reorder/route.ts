import { NextResponse } from "next/server";
import { fetchBookPages } from "@/server/supabase/bookPages";
import { createServerSupabaseClient } from "@/server/supabase/server";

type RouteParams = {
  params: Promise<{ bookId: string }>;
};

type ReorderDirection = "up" | "down";

export async function PATCH(request: Request, context: RouteParams) {
  try {
    const { bookId } = await context.params;
    const body = (await request.json()) as { pageId?: string; direction?: ReorderDirection };
    if (!body.pageId || !body.direction) {
      return NextResponse.json({ error: "pageId and direction are required." }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const { data: rows, error: readError } = await supabase
      .from("book_pages")
      .select("id,page_number")
      .eq("book_id", bookId)
      .order("page_number", { ascending: true });

    if (readError) {
      return NextResponse.json({ error: readError.message }, { status: 500 });
    }

    const pages = rows ?? [];
    const currentIndex = pages.findIndex((row) => row.id === body.pageId);
    if (currentIndex < 0) {
      return NextResponse.json({ error: "Page not found." }, { status: 404 });
    }

    const targetIndex = body.direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= pages.length) {
      const stablePages = await fetchBookPages(bookId);
      return NextResponse.json({ pages: stablePages });
    }

    const current = pages[currentIndex];
    const target = pages[targetIndex];
    const tempPageNumber = (pages.reduce((max, row) => Math.max(max, row.page_number), 0) || 0) + 1000;

    const swapSteps = [
      supabase.from("book_pages").update({ page_number: tempPageNumber }).eq("id", current.id),
      supabase.from("book_pages").update({ page_number: current.page_number }).eq("id", target.id),
      supabase.from("book_pages").update({ page_number: target.page_number }).eq("id", current.id)
    ];

    for (const step of swapSteps) {
      const { error } = await step;
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    const updatedPages = await fetchBookPages(bookId);
    return NextResponse.json({ pages: updatedPages });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
