import type { Book } from "@/features/books/domain/Book";

export interface BookRepository {
  create(input: {
    title: string;
    author?: string;
    category: Book["category"];
    readingLevel: Book["readingLevel"];
  }): Promise<Book>;
  list(): Promise<Book[]>;
}
