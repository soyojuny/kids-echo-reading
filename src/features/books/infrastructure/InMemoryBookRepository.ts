import type { Book } from "@/features/books/domain/Book";
import type { BookRepository } from "@/features/books/types/BookRepository";

export class InMemoryBookRepository implements BookRepository {
  private readonly books = new Map<string, Book>();

  async create(input: { title: string; author?: string }): Promise<Book> {
    const id = crypto.randomUUID();
    const created: Book = {
      id,
      title: input.title,
      author: input.author,
      status: "draft",
      pageViewMode: "single",
      createdAt: new Date().toISOString()
    };
    this.books.set(id, created);
    return created;
  }

  async list(): Promise<Book[]> {
    return [...this.books.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
}
