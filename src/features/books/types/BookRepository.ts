import type { Book } from "@/features/books/domain/Book";

export interface BookRepository {
  create(input: { title: string; author?: string }): Promise<Book>;
  list(): Promise<Book[]>;
}
