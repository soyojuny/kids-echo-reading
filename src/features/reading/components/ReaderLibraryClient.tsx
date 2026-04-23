"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import styles from "@/features/reading/components/ChildReadingUi.module.css";

type ReaderLibraryBook = {
  id: string;
  title: string;
  author?: string;
  category: "animal" | "adventure" | "daily" | "science" | "emotion";
  readingLevel: number;
  createdAt: string;
};

type ReaderLibraryClientProps = {
  books: ReaderLibraryBook[];
  errorMessage?: string;
};

type LastSessionSnapshot = {
  bookId: string;
  bookTitle: string;
  pageNumber: number;
  totalPages: number;
  updatedAt: number;
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
};

const LAST_SESSION_STORAGE_KEY = "kids-echo-reading-last-session";

const CATEGORY_LABELS: Record<ReaderLibraryBook["category"], string> = {
  animal: "동물",
  adventure: "모험",
  daily: "생활",
  science: "과학",
  emotion: "감정"
};

const CATEGORY_OPTIONS = ["animal", "adventure", "daily", "science", "emotion"] as const;

function loadLastSessionSnapshot(): LastSessionSnapshot | null {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.localStorage.getItem(LAST_SESSION_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const bookId = typeof parsed.bookId === "string" ? parsed.bookId : "";
    const bookTitle = typeof parsed.bookTitle === "string" ? parsed.bookTitle : "";
    const pageNumber = Number(parsed.pageNumber);
    const totalPages = Number(parsed.totalPages);
    const updatedAt = Number(parsed.updatedAt);

    if (!bookId || !bookTitle || !Number.isFinite(pageNumber) || pageNumber <= 0) {
      return null;
    }

    return {
      bookId,
      bookTitle,
      pageNumber: Math.floor(pageNumber),
      totalPages: Number.isFinite(totalPages) && totalPages > 0 ? Math.floor(totalPages) : 1,
      updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now()
    };
  } catch {
    return null;
  }
}

function pickIndex(seed: string, size: number): number {
  const total = seed.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return total % size;
}

function toMeta(book: ReaderLibraryBook) {
  const categoryLabel = CATEGORY_LABELS[book.category];
  const level = String(book.readingLevel);
  const coverIndex = (pickIndex(`${book.id}-cover`, 3) + 1).toString();
  const createdDate = new Date(book.createdAt).toLocaleDateString("ko-KR");
  return {
    category: book.category,
    level,
    coverClass: coverIndex === "1" ? styles.cover1 : coverIndex === "2" ? styles.cover2 : styles.cover3,
    subtitle: `${categoryLabel} · 레벨 ${level} · ${createdDate}`
  };
}

export function ReaderLibraryClient({ books, errorMessage }: ReaderLibraryClientProps) {
  const [keyword, setKeyword] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<"all" | (typeof CATEGORY_OPTIONS)[number]>("all");
  const [lastSession, setLastSession] = useState<LastSessionSnapshot | null>(null);
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);

  const booksWithMeta = useMemo(
    () =>
      books.map((book) => ({
        ...book,
        meta: toMeta(book)
      })),
    [books]
  );

  const filteredBooks = useMemo(
    () =>
      booksWithMeta.filter((book) => {
        const byKeyword = keyword.trim().length === 0 || book.title.includes(keyword.trim());
        const byCategory = selectedCategory === "all" || book.meta.category === selectedCategory;
        return byKeyword && byCategory;
      }),
    [booksWithMeta, keyword, selectedCategory]
  );

  const resumeTarget = useMemo(() => {
    if (!lastSession) {
      return null;
    }

    const matchedBook = booksWithMeta.find((book) => book.id === lastSession.bookId);
    if (!matchedBook) {
      return null;
    }

    return {
      book: matchedBook,
      pageNumber: Math.max(1, Math.min(lastSession.pageNumber, lastSession.totalPages))
    };
  }, [booksWithMeta, lastSession]);

  useEffect(() => {
    setLastSession(loadLastSessionSnapshot());
  }, []);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

    if (standalone) {
      return;
    }

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPromptEvent(event as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    };
  }, []);

  async function handleInstallClick() {
    if (!installPromptEvent) {
      return;
    }
    await installPromptEvent.prompt();
    try {
      await installPromptEvent.userChoice;
    } catch {
      // Ignore dismissal or unsupported behavior.
    }
    setInstallPromptEvent(null);
  }

  return (
    <main className={styles.appRoot}>
      <div className={styles.app}>
        <header className={styles.topbar}>
          <div>
            <h1 className={styles.title}>리딩 놀이터</h1>
            <p className={styles.subtitle}>아동용 읽기 연습 CX 화면</p>
          </div>
          <div className={styles.topbarActions}>
            <span className={styles.chip}>오늘 목표 3페이지</span>
            {installPromptEvent && (
              <button
                type="button"
                className={`${styles.btn} ${styles.btnSoft} ${styles.installButton}`}
                onClick={() => {
                  void handleInstallClick();
                }}
              >
                홈 화면에 설치
              </button>
            )}
          </div>
        </header>

        {resumeTarget && (
          <section className={`${styles.card} ${styles.resumeCard}`}>
            <h2 className={styles.resumeTitle}>마지막 읽기 이어보기</h2>
            <p className={styles.subtitle}>
              {resumeTarget.book.title} · {resumeTarget.pageNumber}페이지에서 이어서 시작할 수 있어요.
            </p>
            <div className={styles.resumeActions}>
              <Link
                className={`${styles.btn} ${styles.btnSoft}`}
                href={`/session/${resumeTarget.book.id}/${resumeTarget.pageNumber}`}
              >
                이어 읽기
              </Link>
              <Link className={`${styles.btn} ${styles.btnSoft}`} href={`/session/${resumeTarget.book.id}/1`}>
                처음부터
              </Link>
            </div>
          </section>
        )}

        <section className={styles.card}>
          <h2>오늘 읽을 책 고르기</h2>
          <p className={styles.subtitle}>카테고리와 제목 검색으로 책을 찾을 수 있어요.</p>

          <div className={styles.catalogTools}>
            <input
              className={styles.search}
              type="search"
              placeholder="책 제목 검색"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
            <div className={styles.categoryRow}>
              <button
                type="button"
                className={`${styles.categoryButton} ${
                  selectedCategory === "all" ? styles.categoryButtonActive : ""
                }`}
                onClick={() => setSelectedCategory("all")}
              >
                전체
              </button>
              {CATEGORY_OPTIONS.map((category) => (
                <button
                  key={category}
                  type="button"
                  className={`${styles.categoryButton} ${
                    selectedCategory === category ? styles.categoryButtonActive : ""
                  }`}
                  onClick={() => setSelectedCategory(category)}
                >
                  {CATEGORY_LABELS[category]}
                </button>
              ))}
            </div>
          </div>

          {errorMessage && <div className={styles.errorBox}>책 목록 조회 실패: {errorMessage}</div>}

          {!errorMessage && books.length === 0 && (
            <div className={styles.emptyBox}>
              등록된 책이 없습니다. <Link href="/books">관리자 화면</Link>에서 책을 먼저 등록해 주세요.
            </div>
          )}

          {!errorMessage && books.length > 0 && filteredBooks.length === 0 && (
            <div className={styles.emptyBox}>검색 결과가 없습니다.</div>
          )}

          {!errorMessage && filteredBooks.length > 0 && (
            <div className={styles.bookGrid}>
              {filteredBooks.map((book) => (
                <Link key={book.id} href={`/session/${book.id}/1`} className={styles.bookCard}>
                  <div className={`${styles.cover} ${book.meta.coverClass}`} />
                  <h3>{book.title}</h3>
                  <p className={styles.bookMeta}>{book.meta.subtitle}</p>
                  {book.author && <p className={styles.bookMeta}>저자: {book.author}</p>}
                </Link>
              ))}
            </div>
          )}
        </section>

        <nav className={styles.footerNav}>
          <span className={`${styles.footerNavItem} ${styles.footerNavActive}`}>1. 책 고르기</span>
          <span className={styles.footerNavItem}>2. 읽기 연습</span>
          <span className={styles.footerNavItem}>3. 결과 보기</span>
        </nav>
      </div>
    </main>
  );
}
