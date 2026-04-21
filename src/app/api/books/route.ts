import { NextResponse } from "next/server";
import type { Book } from "@/features/books/domain/Book";
import { createServerSupabaseClient } from "@/server/supabase/server";

type BookRow = {
  id: string;
  title: string;
  author: string | null;
  status: Book["status"];
  page_view_mode: Book["pageViewMode"];
  created_at: string;
};

function mapBookRow(row: BookRow): Book {
  return {
    id: row.id,
    title: row.title,
    author: row.author ?? undefined,
    status: row.status,
    pageViewMode: row.page_view_mode,
    createdAt: row.created_at
  };
}

export async function GET() {
  try {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("books")
      .select("id,title,author,status,page_view_mode,created_at")
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as BookRow[];
    return NextResponse.json({
      books: rows.map(mapBookRow)
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { title?: string; author?: string };
    const title = payload.title?.trim();
    if (!title) {
      return NextResponse.json({ error: "Book title is required." }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("books")
      .insert({
        title,
        author: payload.author?.trim() || null,
        status: "draft",
        page_view_mode: "single"
      })
      .select("id,title,author,status,page_view_mode,created_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      book: mapBookRow(data as BookRow)
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
