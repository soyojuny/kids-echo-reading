"use client";

import type { Book } from "@/features/books/domain/Book";

type BookSelectorProps = {
  books: Book[];
  selectedBookId?: string;
  onSelect: (bookId: string) => void;
};

export function BookSelector({ books, selectedBookId, onSelect }: BookSelectorProps) {
  return (
    <article className="panel">
      <h2>작업 중인 책</h2>
      {!books.length && <p className="muted">먼저 책을 생성하세요.</p>}
      {books.length > 0 && (
        <select
          value={selectedBookId ?? ""}
          onChange={(event) => onSelect(event.target.value)}
          style={{ width: "100%", marginTop: "0.6rem", padding: "0.6rem" }}
        >
          {books.map((book) => (
            <option key={book.id} value={book.id}>
              {book.title}
            </option>
          ))}
        </select>
      )}
    </article>
  );
}
