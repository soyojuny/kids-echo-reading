"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CreateBookUseCase } from "@/features/books/application/CreateBookUseCase";
import { DistributeBulkTextUseCase } from "@/features/books/application/DistributeBulkTextUseCase";
import { BookCreateForm } from "@/features/books/components/BookCreateForm";
import { BookSelector } from "@/features/books/components/BookSelector";
import { BulkTextPasteTool } from "@/features/books/components/BulkTextPasteTool";
import { PageOrderList } from "@/features/books/components/PageOrderList";
import { PageTextEditor } from "@/features/books/components/PageTextEditor";
import { PageUploadPanel } from "@/features/books/components/PageUploadPanel";
import { PageInputStatusPolicy } from "@/features/books/domain/PageInputStatusPolicy";
import { ApiBookRepository } from "@/features/books/infrastructure/ApiBookRepository";
import {
  bulkSavePageTexts,
  generatePageTts,
  listBookPages,
  reorderBookPage,
  savePageText,
  uploadBookPages
} from "@/features/books/infrastructure/booksApi";
import type { Book } from "@/features/books/domain/Book";
import type { EditableBookPage } from "@/features/books/types/EditableBookPage";

function updatePageText(page: EditableBookPage, text: string): EditableBookPage {
  const textChanged = page.confirmedText !== text;
  const nextConfirmed = textChanged ? false : page.isConfirmed;
  return {
    ...page,
    confirmedText: text,
    isConfirmed: nextConfirmed,
    inputStatus: PageInputStatusPolicy.resolve({ text, isConfirmed: nextConfirmed })
  };
}

export default function AdminBooksPage() {
  const bookRepositoryRef = useRef(new ApiBookRepository());
  const createBookUseCaseRef = useRef(new CreateBookUseCase(bookRepositoryRef.current));
  const distributeBulkTextUseCaseRef = useRef(new DistributeBulkTextUseCase());

  const [books, setBooks] = useState<Book[]>([]);
  const [selectedBookId, setSelectedBookId] = useState<string>();
  const [selectedPageId, setSelectedPageId] = useState<string>();
  const [pages, setPages] = useState<EditableBookPage[]>([]);
  const [usedBulkDistribute, setUsedBulkDistribute] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>();
  const [isLoadingBooks, setIsLoadingBooks] = useState(false);
  const [isLoadingPages, setIsLoadingPages] = useState(false);
  const [isMutating, setIsMutating] = useState(false);

  const selectedPage = useMemo(
    () => pages.find((page) => page.id === selectedPageId),
    [pages, selectedPageId]
  );

  useEffect(() => {
    let isMounted = true;
    const loadBooks = async () => {
      setIsLoadingBooks(true);
      try {
        const listedBooks = await bookRepositoryRef.current.list();
        if (!isMounted) {
          return;
        }

        setBooks(listedBooks);
        if (listedBooks.length) {
          setSelectedBookId((current) => current ?? listedBooks[0].id);
        }
      } catch (error) {
        if (isMounted) {
          setStatusMessage(error instanceof Error ? error.message : "책 목록을 불러오지 못했습니다.");
        }
      } finally {
        if (isMounted) {
          setIsLoadingBooks(false);
        }
      }
    };

    loadBooks();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedBookId) {
      setPages([]);
      setSelectedPageId(undefined);
      return;
    }

    let isMounted = true;
    const loadPages = async () => {
      setIsLoadingPages(true);
      try {
        const nextPages = await listBookPages(selectedBookId);
        if (!isMounted) {
          return;
        }

        setPages(nextPages);
        setSelectedPageId(nextPages[0]?.id);
      } catch (error) {
        if (isMounted) {
          setStatusMessage(error instanceof Error ? error.message : "페이지 목록을 불러오지 못했습니다.");
        }
      } finally {
        if (isMounted) {
          setIsLoadingPages(false);
        }
      }
    };

    setUsedBulkDistribute(false);
    loadPages();

    return () => {
      isMounted = false;
    };
  }, [selectedBookId]);

  useEffect(() => {
    if (!pages.length) {
      setSelectedPageId(undefined);
      return;
    }

    if (!selectedPageId || !pages.some((page) => page.id === selectedPageId)) {
      setSelectedPageId(pages[0].id);
    }
  }, [pages, selectedPageId]);

  const handleCreateBook = async (input: {
    title: string;
    author?: string;
    category: Book["category"];
    readingLevel: Book["readingLevel"];
  }) => {
    setIsMutating(true);
    setStatusMessage(undefined);
    try {
      const created = await createBookUseCaseRef.current.execute(input);
      setBooks((previous) => [...previous, created]);
      setSelectedBookId(created.id);
      setStatusMessage("책이 생성되었습니다.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "책 생성에 실패했습니다.");
    } finally {
      setIsMutating(false);
    }
  };

  const handleUpload = async (files: File[]) => {
    if (!selectedBookId) {
      return;
    }

    setIsMutating(true);
    setStatusMessage(undefined);
    try {
      const updatedPages = await uploadBookPages(selectedBookId, files);
      setPages(updatedPages);
      setSelectedPageId((current) => current ?? updatedPages[0]?.id);
      setStatusMessage(`${files.length}개 페이지가 업로드되었습니다.`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "페이지 업로드에 실패했습니다.");
    } finally {
      setIsMutating(false);
    }
  };

  const handleMovePage = async (pageId: string, direction: "up" | "down") => {
    if (!selectedBookId) {
      return;
    }

    setIsMutating(true);
    setStatusMessage(undefined);
    try {
      const updatedPages = await reorderBookPage({
        bookId: selectedBookId,
        pageId,
        direction
      });
      setPages(updatedPages);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "페이지 순서 변경에 실패했습니다.");
    } finally {
      setIsMutating(false);
    }
  };

  const handleChangeText = (text: string) => {
    if (!selectedPageId) {
      return;
    }

    setPages((current) =>
      current.map((page) => (page.id === selectedPageId ? updatePageText(page, text) : page))
    );
  };

  const handleToggleConfirm = async () => {
    if (!selectedBookId || !selectedPageId) {
      return;
    }

    const page = pages.find((item) => item.id === selectedPageId);
    if (!page) {
      return;
    }

    const hasText = page.confirmedText.trim().length > 0;
    const nextConfirmed = hasText ? !page.isConfirmed : false;

    setIsMutating(true);
    setStatusMessage(undefined);
    try {
      const updatedPages = await savePageText({
        bookId: selectedBookId,
        pageId: page.id,
        confirmedText: page.confirmedText,
        isConfirmed: nextConfirmed,
        sourceType: "manual"
      });
      setPages(updatedPages);
      setStatusMessage(nextConfirmed ? "텍스트를 확정했습니다." : "텍스트 확정을 해제했습니다.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "텍스트 저장에 실패했습니다.");
    } finally {
      setIsMutating(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!selectedBookId || !selectedPageId) {
      return;
    }

    const page = pages.find((item) => item.id === selectedPageId);
    if (!page) {
      return;
    }

    if (!page.confirmedText.trim()) {
      setStatusMessage("저장할 텍스트가 없습니다.");
      return;
    }

    setIsMutating(true);
    setStatusMessage(undefined);
    try {
      const updatedPages = await savePageText({
        bookId: selectedBookId,
        pageId: page.id,
        confirmedText: page.confirmedText,
        isConfirmed: false,
        sourceType: "manual"
      });
      setPages(updatedPages);
      setStatusMessage("텍스트를 임시 저장했습니다.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "텍스트 임시 저장에 실패했습니다.");
    } finally {
      setIsMutating(false);
    }
  };

  const handleDistributeBulkText = async (bulkText: string) => {
    if (!selectedBookId || !pages.length) {
      return;
    }

    const distributed = distributeBulkTextUseCaseRef.current.execute({
      pageCount: pages.length,
      bulkText
    });

    const updates = pages
      .map((page, index) => {
        const distributedText = distributed[index]?.trim();
        if (!distributedText) {
          return null;
        }

        return {
          pageId: page.id,
          confirmedText: distributedText,
          isConfirmed: false,
          sourceType: "bulk_paste" as const
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    if (!updates.length) {
      setStatusMessage("분배 가능한 텍스트를 찾지 못했습니다.");
      return;
    }

    setIsMutating(true);
    setStatusMessage(undefined);
    try {
      const updatedPages = await bulkSavePageTexts({
        bookId: selectedBookId,
        updates
      });
      setPages(updatedPages);
      setUsedBulkDistribute(true);
      setStatusMessage(`${updates.length}개 페이지 텍스트를 분배 저장했습니다.`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "일괄 텍스트 저장에 실패했습니다.");
    } finally {
      setIsMutating(false);
    }
  };

  const handleGenerateTts = async () => {
    if (!selectedBookId || !selectedPageId) {
      return;
    }

    setIsMutating(true);
    setStatusMessage(undefined);
    try {
      const asset = await generatePageTts({
        bookId: selectedBookId,
        pageId: selectedPageId
      });
      setStatusMessage(`TTS 생성 완료 (${Math.round((asset.durationMs ?? 0) / 1000)}초)`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "TTS 생성에 실패했습니다.");
    } finally {
      setIsMutating(false);
    }
  };

  const phaseTwoProgress = useMemo(
    () => [
      { label: "책 생성 화면", done: books.length > 0 },
      { label: "다중 페이지 업로드", done: pages.length > 0 },
      { label: "파일명 기반 자동 정렬", done: pages.length > 1 },
      { label: "페이지 순서 변경", done: pages.length > 1 },
      { label: "페이지별 텍스트 편집", done: pages.some((page) => page.confirmedText.trim().length > 0) },
      { label: "전체 텍스트 붙여넣기 분배", done: usedBulkDistribute }
    ],
    [books.length, pages, usedBulkDistribute]
  );

  return (
    <main className="container">
      <section className="panel">
        <h1>관리자 책 등록 (Phase 2)</h1>
        <p className="muted">Supabase DB/Storage 기반 실연동 상태</p>
        {(isLoadingBooks || isLoadingPages || isMutating) && <p className="muted">작업 중...</p>}
        {statusMessage && <p>{statusMessage}</p>}
      </section>

      <section className="grid two" style={{ marginTop: "1rem" }}>
        <BookCreateForm onCreate={handleCreateBook} />
        <BookSelector books={books} selectedBookId={selectedBookId} onSelect={setSelectedBookId} />
      </section>

      <section className="grid two" style={{ marginTop: "1rem" }}>
        <PageUploadPanel
          disabled={!selectedBookId || isLoadingBooks || isLoadingPages || isMutating}
          onUpload={handleUpload}
        />
        <BulkTextPasteTool
          disabled={!selectedBookId || pages.length === 0 || isMutating}
          onDistribute={handleDistributeBulkText}
        />
      </section>

      <section className="grid two" style={{ marginTop: "1rem" }}>
        <PageOrderList
          pages={pages}
          selectedPageId={selectedPageId}
          onSelectPage={setSelectedPageId}
          onMovePage={handleMovePage}
        />
        <PageTextEditor
          page={selectedPage}
          onChangeText={handleChangeText}
          onSaveDraft={handleSaveDraft}
          onToggleConfirm={handleToggleConfirm}
          onGenerateTts={handleGenerateTts}
          disabled={isMutating}
        />
      </section>

      <section className="panel" style={{ marginTop: "1rem" }}>
        <h2>Phase 2 진행 상태</h2>
        <ul>
          {phaseTwoProgress.map((item) => (
            <li key={item.label}>
              {item.done ? "[x]" : "[ ]"} {item.label}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
