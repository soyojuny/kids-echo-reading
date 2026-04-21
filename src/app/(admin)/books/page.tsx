"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CreateBookUseCase } from "@/features/books/application/CreateBookUseCase";
import { DistributeBulkTextUseCase } from "@/features/books/application/DistributeBulkTextUseCase";
import { ReorderPageUseCase } from "@/features/books/application/ReorderPageUseCase";
import { SortUploadedPagesUseCase } from "@/features/books/application/SortUploadedPagesUseCase";
import { BookCreateForm } from "@/features/books/components/BookCreateForm";
import { BookSelector } from "@/features/books/components/BookSelector";
import { BulkTextPasteTool } from "@/features/books/components/BulkTextPasteTool";
import { PageOrderList } from "@/features/books/components/PageOrderList";
import { PageTextEditor } from "@/features/books/components/PageTextEditor";
import { PageUploadPanel } from "@/features/books/components/PageUploadPanel";
import { PageInputStatusPolicy } from "@/features/books/domain/PageInputStatusPolicy";
import { InMemoryBookRepository } from "@/features/books/infrastructure/InMemoryBookRepository";
import type { EditableBookPage } from "@/features/books/types/EditableBookPage";

function createEmptyPage(file: File): EditableBookPage {
  return {
    id: crypto.randomUUID(),
    fileName: file.name,
    imageUrl: URL.createObjectURL(file),
    pageNumber: 0,
    confirmedText: "",
    isConfirmed: false,
    inputStatus: "empty"
  };
}

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
  const createBookUseCaseRef = useRef(new CreateBookUseCase(new InMemoryBookRepository()));
  const sortUploadedPagesUseCaseRef = useRef(new SortUploadedPagesUseCase());
  const reorderPageUseCaseRef = useRef(new ReorderPageUseCase());
  const distributeBulkTextUseCaseRef = useRef(new DistributeBulkTextUseCase());
  const objectUrlsRef = useRef(new Set<string>());

  const [books, setBooks] = useState<Awaited<ReturnType<InMemoryBookRepository["list"]>>>([]);
  const [selectedBookId, setSelectedBookId] = useState<string>();
  const [selectedPageId, setSelectedPageId] = useState<string>();
  const [pagesByBookId, setPagesByBookId] = useState<Record<string, EditableBookPage[]>>({});
  const [usedBulkDistribute, setUsedBulkDistribute] = useState(false);

  const selectedPages = useMemo(
    () => (selectedBookId ? pagesByBookId[selectedBookId] ?? [] : []),
    [pagesByBookId, selectedBookId]
  );

  const selectedPage = useMemo(
    () => selectedPages.find((page) => page.id === selectedPageId),
    [selectedPages, selectedPageId]
  );

  useEffect(() => {
    if (!selectedPages.length) {
      setSelectedPageId(undefined);
      return;
    }

    if (!selectedPageId || !selectedPages.some((page) => page.id === selectedPageId)) {
      setSelectedPageId(selectedPages[0].id);
    }
  }, [selectedPages, selectedPageId]);

  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlsRef.current.clear();
    };
  }, []);

  const updateCurrentBookPages = (updater: (pages: EditableBookPage[]) => EditableBookPage[]) => {
    if (!selectedBookId) {
      return;
    }

    setPagesByBookId((previous) => {
      const current = previous[selectedBookId] ?? [];
      const nextPages = updater(current);
      return {
        ...previous,
        [selectedBookId]: nextPages
      };
    });
  };

  const handleCreateBook = async (input: { title: string; author?: string }) => {
    const created = await createBookUseCaseRef.current.execute(input);
    setBooks((previous) => [...previous, created]);
    setPagesByBookId((previous) => ({
      ...previous,
      [created.id]: []
    }));
    setSelectedBookId(created.id);
    setSelectedPageId(undefined);
  };

  const handleUpload = (files: File[]) => {
    if (!selectedBookId) {
      return;
    }

    const nextPages = files.map((file) => {
      const page = createEmptyPage(file);
      objectUrlsRef.current.add(page.imageUrl);
      return page;
    });

    updateCurrentBookPages((current) =>
      sortUploadedPagesUseCaseRef.current.execute([...current, ...nextPages])
    );
  };

  const handleMovePage = (pageId: string, direction: "up" | "down") => {
    updateCurrentBookPages((current) =>
      reorderPageUseCaseRef.current.execute({
        pages: current,
        pageId,
        direction
      })
    );
  };

  const handleChangeText = (text: string) => {
    if (!selectedPageId) {
      return;
    }

    updateCurrentBookPages((current) =>
      current.map((page) => (page.id === selectedPageId ? updatePageText(page, text) : page))
    );
  };

  const handleToggleConfirm = () => {
    if (!selectedPageId) {
      return;
    }

    updateCurrentBookPages((current) =>
      current.map((page) => {
        if (page.id !== selectedPageId) {
          return page;
        }

        const hasText = page.confirmedText.trim().length > 0;
        const nextConfirmed = hasText ? !page.isConfirmed : false;

        return {
          ...page,
          isConfirmed: nextConfirmed,
          inputStatus: PageInputStatusPolicy.resolve({
            text: page.confirmedText,
            isConfirmed: nextConfirmed
          })
        };
      })
    );
  };

  const handleDistributeBulkText = (bulkText: string) => {
    updateCurrentBookPages((current) => {
      const distributed = distributeBulkTextUseCaseRef.current.execute({
        pageCount: current.length,
        bulkText
      });

      return current.map((page, index) => {
        const distributedText = distributed[index]?.trim();
        if (!distributedText) {
          return page;
        }

        return updatePageText(page, distributedText);
      });
    });

    setUsedBulkDistribute(true);
  };

  const phaseTwoProgress = useMemo(
    () => [
      { label: "책 생성 화면", done: books.length > 0 },
      { label: "다중 페이지 업로드", done: selectedPages.length > 0 },
      { label: "파일명 기반 자동 정렬", done: selectedPages.length > 1 },
      { label: "페이지 순서 변경", done: selectedPages.length > 1 },
      {
        label: "페이지별 텍스트 편집",
        done: selectedPages.some((page) => page.confirmedText.trim().length > 0)
      },
      { label: "전체 텍스트 붙여넣기 분배", done: usedBulkDistribute }
    ],
    [books.length, selectedPages, usedBulkDistribute]
  );

  return (
    <main className="container">
      <section className="panel">
        <h1>관리자 책 등록 (Phase 2)</h1>
        <p className="muted">문서 기준: 다중 업로드, 자동 정렬, 순서 조정, 페이지 텍스트 편집, 전체 텍스트 분배</p>
      </section>

      <section className="grid two" style={{ marginTop: "1rem" }}>
        <BookCreateForm onCreate={handleCreateBook} />
        <BookSelector books={books} selectedBookId={selectedBookId} onSelect={setSelectedBookId} />
      </section>

      <section className="grid two" style={{ marginTop: "1rem" }}>
        <PageUploadPanel disabled={!selectedBookId} onUpload={handleUpload} />
        <BulkTextPasteTool disabled={!selectedBookId || selectedPages.length === 0} onDistribute={handleDistributeBulkText} />
      </section>

      <section className="grid two" style={{ marginTop: "1rem" }}>
        <PageOrderList
          pages={selectedPages}
          selectedPageId={selectedPageId}
          onSelectPage={setSelectedPageId}
          onMovePage={handleMovePage}
        />
        <PageTextEditor page={selectedPage} onChangeText={handleChangeText} onToggleConfirm={handleToggleConfirm} />
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
