"use client";

import type { EditableBookPage } from "@/features/books/types/EditableBookPage";

type PageTextEditorProps = {
  page?: EditableBookPage;
  onChangeText: (text: string) => void;
  onToggleConfirm: () => void;
};

export function PageTextEditor({ page, onChangeText, onToggleConfirm }: PageTextEditorProps) {
  if (!page) {
    return (
      <article className="panel">
        <h2>페이지 텍스트 편집</h2>
        <p className="muted">왼쪽 목록에서 편집할 페이지를 선택하세요.</p>
      </article>
    );
  }

  return (
    <article className="panel">
      <h2>페이지 텍스트 편집</h2>
      <p className="muted">
        p.{page.pageNumber} / {page.fileName}
      </p>
      <img
        src={page.imageUrl}
        alt={`page ${page.pageNumber}`}
        style={{ width: "100%", maxHeight: "280px", objectFit: "contain", borderRadius: "10px" }}
      />
      <textarea
        value={page.confirmedText}
        onChange={(event) => onChangeText(event.target.value)}
        placeholder="이 페이지 텍스트를 입력하세요."
        style={{ marginTop: "0.75rem", width: "100%", minHeight: "160px", padding: "0.6rem" }}
      />
      <button type="button" onClick={onToggleConfirm} style={{ marginTop: "0.6rem" }}>
        {page.isConfirmed ? "텍스트 확정 해제" : "텍스트 확정"}
      </button>
    </article>
  );
}
