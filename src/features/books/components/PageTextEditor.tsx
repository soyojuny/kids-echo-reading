"use client";

import type { EditableBookPage } from "@/features/books/types/EditableBookPage";

type PageTextEditorProps = {
  page?: EditableBookPage;
  onChangeText: (text: string) => void;
  onSaveDraft: () => void;
  onToggleConfirm: () => void;
  onGenerateTts: () => void;
  disabled?: boolean;
};

export function PageTextEditor({
  page,
  onChangeText,
  onSaveDraft,
  onToggleConfirm,
  onGenerateTts,
  disabled
}: PageTextEditorProps) {
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
        disabled={disabled}
        placeholder="이 페이지 텍스트를 입력하세요."
        style={{ marginTop: "0.75rem", width: "100%", minHeight: "160px", padding: "0.6rem" }}
      />
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.6rem", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={onSaveDraft}
          disabled={disabled || page.confirmedText.trim().length === 0}
        >
          텍스트 임시 저장
        </button>
        <button type="button" onClick={onToggleConfirm} disabled={disabled}>
          {page.isConfirmed ? "텍스트 확정 해제" : "텍스트 확정"}
        </button>
        <button
          type="button"
          onClick={onGenerateTts}
          disabled={disabled || page.inputStatus !== "ready" || page.confirmedText.trim().length === 0}
        >
          이 페이지 TTS 생성
        </button>
      </div>
      <p className="muted" style={{ marginTop: "0.6rem" }}>
        TTS 생성은 `텍스트 확정(ready)` 상태에서만 가능합니다.
      </p>
    </article>
  );
}
