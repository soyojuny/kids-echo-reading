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

type ReaderBookPageRow = {
  book_id: string;
  image_path: string;
  page_number: number;
};

export default async function ReaderLibraryPage() {
  let books: ReaderBookRow[] = [];
  let errorMessage: string | undefined;
  let coverImageUrlByBookId: Record<string, string | undefined> = {};

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

    if (books.length > 0) {
      const bookIds = books.map((book) => book.id);
      const { data: pageData, error: pageError } = await supabase
        .from("book_pages")
        .select("book_id,image_path,page_number")
        .in("book_id", bookIds)
        .order("book_id", { ascending: true })
        .order("page_number", { ascending: true });

      if (!pageError) {
        const firstPageImageByBookId: Record<string, string> = {};
        for (const page of (pageData ?? []) as ReaderBookPageRow[]) {
          if (!firstPageImageByBookId[page.book_id]) {
            firstPageImageByBookId[page.book_id] = page.image_path;
          }
        }

        const signedCoverEntries = await Promise.all(
          Object.entries(firstPageImageByBookId).map(async ([bookId, imagePath]) => {
            const { data: signed } = await supabase.storage
              .from("book-pages")
              .createSignedUrl(imagePath, 60 * 60);
            return [bookId, signed?.signedUrl] as const;
          })
        );
        coverImageUrlByBookId = Object.fromEntries(signedCoverEntries);
      }
    }
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
        createdAt: book.created_at,
        coverImageUrl: coverImageUrlByBookId[book.id]
      }))}
      errorMessage={errorMessage}
    />
  );
}
