"use client";

import { useState } from "react";

type BulkTextPasteToolProps = {
  disabled?: boolean;
  onDistribute: (bulkText: string) => void;
};

export function BulkTextPasteTool({ disabled, onDistribute }: BulkTextPasteToolProps) {
  const [bulkText, setBulkText] = useState("");

  return (
    <article className="panel">
      <h2>전체 텍스트 붙여넣기</h2>
      <p className="muted">
        `Page 1`, `Page 2` 구분자 또는 빈 줄 블록 기준으로 페이지별 텍스트를 자동 분배합니다.
      </p>
      <textarea
        value={bulkText}
        onChange={(event) => setBulkText(event.target.value)}
        disabled={disabled}
        placeholder={"Page 1\nFirst page text...\n\nPage 2\nSecond page text..."}
        style={{ marginTop: "0.75rem", width: "100%", minHeight: "180px", padding: "0.6rem" }}
      />
      <button
        type="button"
        disabled={disabled || !bulkText.trim()}
        onClick={() => onDistribute(bulkText)}
        style={{ marginTop: "0.6rem" }}
      >
        페이지별로 분배
      </button>
    </article>
  );
}
