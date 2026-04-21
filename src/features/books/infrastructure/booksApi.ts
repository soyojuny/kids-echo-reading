import type { EditableBookPage } from "@/features/books/types/EditableBookPage";
import type { PageTtsAsset } from "@/features/tts/types/PageTtsAsset";

type ReorderDirection = "up" | "down";
type SourceType = "manual" | "bulk_paste";

async function parseJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? String(payload.error)
        : `Request failed (${response.status})`;
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export async function listBookPages(bookId: string): Promise<EditableBookPage[]> {
  const response = await fetch(`/api/books/${bookId}/pages`);
  const payload = await parseJsonResponse<{ pages: EditableBookPage[] }>(response);
  return payload.pages;
}

export async function uploadBookPages(bookId: string, files: File[]): Promise<EditableBookPage[]> {
  const formData = new FormData();
  files.forEach((file) => {
    formData.append("files", file, file.name);
  });

  const response = await fetch(`/api/books/${bookId}/pages`, {
    method: "POST",
    body: formData
  });

  const payload = await parseJsonResponse<{ pages: EditableBookPage[] }>(response);
  return payload.pages;
}

export async function reorderBookPage(input: {
  bookId: string;
  pageId: string;
  direction: ReorderDirection;
}): Promise<EditableBookPage[]> {
  const response = await fetch(`/api/books/${input.bookId}/pages/reorder`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pageId: input.pageId,
      direction: input.direction
    })
  });

  const payload = await parseJsonResponse<{ pages: EditableBookPage[] }>(response);
  return payload.pages;
}

export async function savePageText(input: {
  bookId: string;
  pageId: string;
  confirmedText: string;
  isConfirmed: boolean;
  sourceType: SourceType;
}): Promise<EditableBookPage[]> {
  const response = await fetch(`/api/books/${input.bookId}/pages/${input.pageId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      confirmedText: input.confirmedText,
      isConfirmed: input.isConfirmed,
      sourceType: input.sourceType
    })
  });

  const payload = await parseJsonResponse<{ pages: EditableBookPage[] }>(response);
  return payload.pages;
}

export async function bulkSavePageTexts(input: {
  bookId: string;
  updates: Array<{
    pageId: string;
    confirmedText: string;
    isConfirmed: boolean;
    sourceType: SourceType;
  }>;
}): Promise<EditableBookPage[]> {
  const response = await fetch(`/api/books/${input.bookId}/pages/bulk-text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      updates: input.updates
    })
  });

  const payload = await parseJsonResponse<{ pages: EditableBookPage[] }>(response);
  return payload.pages;
}

export async function generatePageTts(input: {
  bookId: string;
  pageId: string;
  ttsProfileId?: string;
}): Promise<PageTtsAsset> {
  const response = await fetch(`/api/books/${input.bookId}/pages/${input.pageId}/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ttsProfileId: input.ttsProfileId
    })
  });

  const payload = await parseJsonResponse<{ asset: PageTtsAsset }>(response);
  return payload.asset;
}
