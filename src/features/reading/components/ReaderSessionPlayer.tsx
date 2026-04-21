"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import type { WordTiming } from "@/shared/types/WordTiming";

type ReaderSessionPlayerProps = {
  bookTitle: string;
  bookId: string;
  pageNumber: number;
  totalPages: number;
  imageUrl: string;
  confirmedText: string;
  audioUrl?: string;
  wordTimings: WordTiming[];
  previousPageNumber?: number;
  nextPageNumber?: number;
};

function resolveActiveWordIndex(wordTimings: WordTiming[], currentMs: number): number {
  return wordTimings.findIndex((word) => currentMs >= word.startMs && currentMs < word.endMs);
}

export function ReaderSessionPlayer({
  bookTitle,
  bookId,
  pageNumber,
  totalPages,
  imageUrl,
  confirmedText,
  audioUrl,
  wordTimings,
  previousPageNumber,
  nextPageNumber
}: ReaderSessionPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentMs, setCurrentMs] = useState(0);

  const activeWordIndex = useMemo(
    () => resolveActiveWordIndex(wordTimings, currentMs),
    [wordTimings, currentMs]
  );

  const fallbackWords = useMemo(
    () =>
      confirmedText
        .trim()
        .split(/\s+/)
        .map((word) => word.trim())
        .filter(Boolean),
    [confirmedText]
  );

  return (
    <main className="container">
      <section className="panel">
        <h1>읽기 세션</h1>
        <p>
          책: <strong>{bookTitle}</strong>
        </p>
        <p>
          페이지: {pageNumber} / {totalPages || "?"}
        </p>
      </section>

      <section className="grid two" style={{ marginTop: "1rem" }}>
        <article className="panel">
          <h2>페이지 이미지</h2>
          <img
            src={imageUrl}
            alt={`book page ${pageNumber}`}
            style={{ width: "100%", maxHeight: "520px", objectFit: "contain", borderRadius: "10px" }}
          />
        </article>

        <article className="panel">
          <h2>오디오 재생</h2>
          {audioUrl ? (
            <audio
              ref={audioRef}
              controls
              src={audioUrl}
              onTimeUpdate={() => setCurrentMs((audioRef.current?.currentTime ?? 0) * 1000)}
              onEnded={() => setCurrentMs(0)}
              style={{ width: "100%" }}
            />
          ) : (
            <p className="muted">이 페이지는 아직 TTS가 생성되지 않았습니다.</p>
          )}

          <h2 style={{ marginTop: "1rem" }}>하이라이트 텍스트</h2>
          <div
            style={{
              lineHeight: 2.1,
              border: "1px solid #d4e1f7",
              borderRadius: "12px",
              padding: "0.75rem",
              minHeight: "160px"
            }}
          >
            {wordTimings.length > 0 &&
              wordTimings.map((word) => (
                <span
                  key={`${word.index}-${word.text}`}
                  style={{
                    display: "inline-block",
                    marginRight: "0.35rem",
                    padding: "0.15rem 0.35rem",
                    borderRadius: "8px",
                    background: word.index === activeWordIndex ? "#ffe89a" : "transparent",
                    transition: "background-color 0.12s ease"
                  }}
                >
                  {word.text}
                </span>
              ))}

            {wordTimings.length === 0 &&
              fallbackWords.map((word, index) => (
                <span key={`${index}-${word}`} style={{ marginRight: "0.35rem" }}>
                  {word}
                </span>
              ))}

            {wordTimings.length === 0 && fallbackWords.length === 0 && (
              <p className="muted">확정된 텍스트가 없습니다.</p>
            )}
          </div>

          <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem", flexWrap: "wrap" }}>
            {previousPageNumber ? (
              <Link href={`/session/${bookId}/${previousPageNumber}`}>이전 페이지</Link>
            ) : (
              <span className="muted">첫 페이지</span>
            )}
            {nextPageNumber ? (
              <Link href={`/session/${bookId}/${nextPageNumber}`}>다음 페이지</Link>
            ) : (
              <span className="muted">마지막 페이지</span>
            )}
            <Link href="/library">책 목록으로</Link>
          </div>
        </article>
      </section>
    </main>
  );
}

