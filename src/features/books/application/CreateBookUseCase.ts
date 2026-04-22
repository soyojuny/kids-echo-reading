import type { Book } from "@/features/books/domain/Book";
import type { BookRepository } from "@/features/books/types/BookRepository";

export class CreateBookUseCase {
  constructor(private readonly bookRepository: BookRepository) {}

  async execute(input: {
    title: string;
    author?: string;
    category: Book["category"];
    readingLevel: Book["readingLevel"];
  }): Promise<Book> {
    const normalizedTitle = input.title.trim();
    if (!normalizedTitle) {
      throw new Error("Book title is required.");
    }

    if (!Number.isInteger(input.readingLevel) || input.readingLevel < 1 || input.readingLevel > 3) {
      throw new Error("Reading level must be an integer between 1 and 3.");
    }

    return this.bookRepository.create({
      title: normalizedTitle,
      author: input.author?.trim() || undefined,
      category: input.category,
      readingLevel: input.readingLevel
    });
  }
}
