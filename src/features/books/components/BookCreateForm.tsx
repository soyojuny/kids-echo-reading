"use client";

import { useState } from "react";

type BookCreateFormProps = {
  onCreate: (input: { title: string; author?: string }) => Promise<void> | void;
};

export function BookCreateForm({ onCreate }: BookCreateFormProps) {
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onCreate({ title, author: author || undefined });
    setTitle("");
    setAuthor("");
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

        <button type="submit">책 추가</button>
      </form>
    </article>
  );
}
