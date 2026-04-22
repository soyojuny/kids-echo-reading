import { createServerSupabaseClient } from "@/server/supabase/server";
import { ReaderLibraryClient } from "@/features/reading/components/ReaderLibraryClient";

export const dynamic = "force-dynamic";

type ReaderBookRow = {
  id: string;
  title: string;
  author: string | null;
  category: "animal" | "adventure" | "daily" | "science" | "emotion";
  reading_level: number;
  created_at: string;
};

export default async function ReaderLibraryPage() {
  let books: ReaderBookRow[] = [];
  let errorMessage: string | undefined;

  try {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("books")
      .select("id,title,author,category,reading_level,created_at")
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    books = (data ?? []) as ReaderBookRow[];
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "책 목록을 불러오지 못했습니다.";
  }

  return (
    <ReaderLibraryClient
      books={books.map((book) => ({
        id: book.id,
        title: book.title,
        author: book.author ?? undefined,
        category: book.category,
        readingLevel: book.reading_level,
        createdAt: book.created_at
      }))}
      errorMessage={errorMessage}
    />
  );
}
