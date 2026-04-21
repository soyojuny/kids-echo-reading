"use client";

import type { EditableBookPage } from "@/features/books/types/EditableBookPage";

type PageOrderListProps = {
  pages: EditableBookPage[];
  selectedPageId?: string;
  onSelectPage: (pageId: string) => void;
  onMovePage: (pageId: string, direction: "up" | "down") => void;
};

const statusLabel: Record<EditableBookPage["inputStatus"], string> = {
  empty: "미입력",
  draft: "작성중",
  ready: "완료"
};

export function PageOrderList({ pages, selectedPageId, onSelectPage, onMovePage }: PageOrderListProps) {
  return (
    <article className="panel">
      <h2>페이지 순서</h2>
      {!pages.length && <p className="muted">업로드된 페이지가 없습니다.</p>}
      {pages.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: "0.75rem 0 0", display: "grid", gap: "0.5rem" }}>
          {pages.map((page) => (
            <li
              key={page.id}
              style={{
                border: page.id === selectedPageId ? "2px solid #2a7cf7" : "1px solid #d4e1f7",
                borderRadius: "12px",
                padding: "0.5rem"
              }}
            >
              <button
                type="button"
                onClick={() => onSelectPage(page.id)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  border: "none",
                  background: "transparent",
                  padding: "0.25rem"
                }}
              >
                <strong>p.{page.pageNumber}</strong> {page.fileName}
                <span className="muted" style={{ marginLeft: "0.5rem" }}>
                  {statusLabel[page.inputStatus]}
                </span>
              </button>
              <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.5rem" }}>
                <button type="button" onClick={() => onMovePage(page.id, "up")}>
                  위로
                </button>
                <button type="button" onClick={() => onMovePage(page.id, "down")}>
                  아래로
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
