"use client";

import { useState } from "react";
import type { Book } from "@/features/books/domain/Book";

type BookCreateFormProps = {
  onCreate: (input: {
    title: string;
    author?: string;
    category: Book["category"];
    readingLevel: Book["readingLevel"];
  }) => Promise<void> | void;
};

export function BookCreateForm({ onCreate }: BookCreateFormProps) {
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [category, setCategory] = useState<Book["category"]>("daily");
  const [readingLevel, setReadingLevel] = useState<Book["readingLevel"]>(1);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onCreate({
      title,
      author: author || undefined,
      category,
      readingLevel
    });
    setTitle("");
    setAuthor("");
    setCategory("daily");
    setReadingLevel(1);
  };

  return (
    <article className="panel">
      <h2>책 생성</h2>
      <form onSubmit={handleSubmit}>
        <label htmlFor="book-title">책 제목</label>
        <input
          id="book-title"
          style={{ display: "block", width: "100%", margin: "0.5rem 0 1rem", padding: "0.6rem" }}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="예: The Very Hungry Caterpillar"
          required
        />

        <label htmlFor="book-author">저자</label>
        <input
          id="book-author"
          style={{ display: "block", width: "100%", margin: "0.5rem 0 1rem", padding: "0.6rem" }}
          value={author}
          onChange={(event) => setAuthor(event.target.value)}
          placeholder="선택 입력"
        />

        <label htmlFor="book-category">카테고리</label>
        <select
          id="book-category"
          style={{ display: "block", width: "100%", margin: "0.5rem 0 1rem", padding: "0.6rem" }}
          value={category}
          onChange={(event) => setCategory(event.target.value as Book["category"])}
        >
          <option value="animal">동물</option>
          <option value="adventure">모험</option>
          <option value="daily">생활</option>
          <option value="science">과학</option>
          <option value="emotion">감정</option>
        </select>

        <label htmlFor="book-level">읽기 레벨</label>
        <select
          id="book-level"
          style={{ display: "block", width: "100%", margin: "0.5rem 0 1rem", padding: "0.6rem" }}
          value={readingLevel}
          onChange={(event) => setReadingLevel(Number(event.target.value) as Book["readingLevel"])}
        >
          <option value={1}>1</option>
          <option value={2}>2</option>
          <option value={3}>3</option>
        </select>

        <button type="submit">책 추가</button>
      </form>
    </article>
  );
}
