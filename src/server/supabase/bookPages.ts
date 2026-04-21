import type { EditableBookPage } from "@/features/books/types/EditableBookPage";
import { createServerSupabaseClient } from "@/server/supabase/server";

type BookPageRow = {
  id: string;
  page_number: number;
  image_path: string;
  input_status: EditableBookPage["inputStatus"];
  confirmed_text: string | null;
};

function extractFileName(path: string): string {
  const segment = path.split("/").at(-1) ?? path;
  return decodeURIComponent(segment);
}

export async function fetchBookPages(bookId: string): Promise<EditableBookPage[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("book_pages")
    .select("id,page_number,image_path,input_status,confirmed_text")
    .eq("book_id", bookId)
    .order("page_number", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as BookPageRow[];
  const mapped = await Promise.all(
    rows.map(async (row) => {
      const { data: signed } = await supabase.storage
        .from("book-pages")
        .createSignedUrl(row.image_path, 60 * 60);

      const isConfirmed = row.input_status === "ready";
      return {
        id: row.id,
        pageNumber: row.page_number,
        fileName: extractFileName(row.image_path),
        imageUrl: signed?.signedUrl ?? "",
        confirmedText: row.confirmed_text ?? "",
        inputStatus: row.input_status,
        isConfirmed
      } satisfies EditableBookPage;
    })
  );

  return mapped;
}

export function normalizePageText(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}
