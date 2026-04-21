import type { Book } from "@/features/books/domain/Book";
import type { BookRepository } from "@/features/books/types/BookRepository";

export class CreateBookUseCase {
  constructor(private readonly bookRepository: BookRepository) {}

  async execute(input: { title: string; author?: string }): Promise<Book> {
    const normalizedTitle = input.title.trim();
    if (!normalizedTitle) {
      throw new Error("Book title is required.");
    }

    return this.bookRepository.create({
      title: normalizedTitle,
      author: input.author?.trim() || undefined
    });
  }
}
