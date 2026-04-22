import type { WordTiming } from "@/shared/types/WordTiming";
import { createServerSupabaseClient } from "@/server/supabase/server";

type ReaderPageRow = {
  id: string;
  page_number: number;
  image_path: string;
  confirmed_text: string | null;
};

type ReaderPageImageRow = {
  image_path: string;
};

type ReaderBookRow = {
  id: string;
  title: string;
};

type PageTtsAssetRow = {
  audio_path: string;
  timing_json: unknown;
};

export type ReaderSessionPageData = {
  bookId: string;
  bookTitle: string;
  pageId: string;
  pageNumber: number;
  totalPages: number;
  imageUrl: string;
  nextPageImageUrl?: string;
  confirmedText: string;
  audioUrl?: string;
  wordTimings: WordTiming[];
  previousPageNumber?: number;
  nextPageNumber?: number;
};

function asObject(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function extractWordTimings(timingJson: unknown): WordTiming[] {
  const timingObject = asObject(timingJson);
  if (!timingObject) {
    return [];
  }

  const rawTimings = timingObject.wordTimings;
  if (!Array.isArray(rawTimings)) {
    return [];
  }

  const timings: WordTiming[] = [];
  for (const item of rawTimings) {
    const row = asObject(item);
    if (!row) {
      continue;
    }

    const index = toNumber(row.index);
    const text = typeof row.text === "string" ? row.text : undefined;
    const startMs = toNumber(row.startMs);
    const endMs = toNumber(row.endMs);

    if (
      typeof index === "number" &&
      typeof text === "string" &&
      typeof startMs === "number" &&
      typeof endMs === "number"
    ) {
      timings.push({ index, text, startMs, endMs });
    }
  }

  return timings.sort((a, b) => a.index - b.index);
}

export async function fetchReaderSessionPage(
  bookId: string,
  pageNumber: number
): Promise<ReaderSessionPageData | null> {
  const supabase = createServerSupabaseClient();

  const { data: bookData, error: bookError } = await supabase
    .from("books")
    .select("id,title")
    .eq("id", bookId)
    .maybeSingle();

  if (bookError) {
    throw new Error(bookError.message);
  }

  if (!bookData) {
    return null;
  }

  const book = bookData as ReaderBookRow;
  const { data: pageData, error: pageError } = await supabase
    .from("book_pages")
    .select("id,page_number,image_path,confirmed_text")
    .eq("book_id", bookId)
    .eq("page_number", pageNumber)
    .maybeSingle();

  if (pageError) {
    throw new Error(pageError.message);
  }

  if (!pageData) {
    return null;
  }

  const page = pageData as ReaderPageRow;

  const { count, error: countError } = await supabase
    .from("book_pages")
    .select("id", { count: "exact", head: true })
    .eq("book_id", bookId);

  if (countError) {
    throw new Error(countError.message);
  }

  const { data: imageSigned, error: imageSignError } = await supabase.storage
    .from("book-pages")
    .createSignedUrl(page.image_path, 60 * 60);

  if (imageSignError) {
    throw new Error(imageSignError.message);
  }

  const { data: ttsAssetData, error: ttsAssetError } = await supabase
    .from("page_tts_assets")
    .select("audio_path,timing_json")
    .eq("page_id", page.id)
    .eq("status", "ready")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (ttsAssetError) {
    throw new Error(ttsAssetError.message);
  }

  const ttsAsset = ttsAssetData as PageTtsAssetRow | null;
  let audioUrl: string | undefined;
  let wordTimings: WordTiming[] = [];

  if (ttsAsset?.audio_path) {
    const { data: signedAudio } = await supabase.storage
      .from("book-audio")
      .createSignedUrl(ttsAsset.audio_path, 60 * 60);

    audioUrl = signedAudio?.signedUrl;
    wordTimings = extractWordTimings(ttsAsset.timing_json);
  }

  const totalPages = count ?? 0;
  const nextPageNumber = totalPages > page.page_number ? page.page_number + 1 : undefined;
  let nextPageImageUrl: string | undefined;

  if (nextPageNumber) {
    const { data: nextPageData, error: nextPageError } = await supabase
      .from("book_pages")
      .select("image_path")
      .eq("book_id", bookId)
      .eq("page_number", nextPageNumber)
      .maybeSingle();

    if (nextPageError) {
      throw new Error(nextPageError.message);
    }

    const nextPagePath = (nextPageData as ReaderPageImageRow | null)?.image_path;
    if (nextPagePath) {
      const { data: nextImageSigned } = await supabase.storage
        .from("book-pages")
        .createSignedUrl(nextPagePath, 60 * 60);
      nextPageImageUrl = nextImageSigned?.signedUrl;
    }
  }

  return {
    bookId: book.id,
    bookTitle: book.title,
    pageId: page.id,
    pageNumber: page.page_number,
    totalPages,
    imageUrl: imageSigned.signedUrl,
    nextPageImageUrl,
    confirmedText: page.confirmed_text ?? "",
    audioUrl,
    wordTimings,
    previousPageNumber: page.page_number > 1 ? page.page_number - 1 : undefined,
    nextPageNumber
  };
}
