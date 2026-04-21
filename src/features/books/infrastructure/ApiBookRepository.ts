import type { Book } from "@/features/books/domain/Book";
import type { BookRepository } from "@/features/books/types/BookRepository";

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

export class ApiBookRepository implements BookRepository {
  async create(input: { title: string; author?: string }): Promise<Book> {
    const response = await fetch("/api/books", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    });

    const payload = await parseJsonResponse<{ book: Book }>(response);
    return payload.book;
  }

  async list(): Promise<Book[]> {
    const response = await fetch("/api/books");
    const payload = await parseJsonResponse<{ books: Book[] }>(response);
    return payload.books;
  }
}
