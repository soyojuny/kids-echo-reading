import type { EditableBookPage } from "@/features/books/types/EditableBookPage";

export class ReorderPageUseCase {
  execute(input: {
    pages: EditableBookPage[];
    pageId: string;
    direction: "up" | "down";
  }): EditableBookPage[] {
    const currentIndex = input.pages.findIndex((page) => page.id === input.pageId);
    if (currentIndex < 0) {
      return input.pages;
    }

    const targetIndex = input.direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= input.pages.length) {
      return input.pages;
    }

    const next = [...input.pages];
    [next[currentIndex], next[targetIndex]] = [next[targetIndex], next[currentIndex]];

    return next.map((page, index) => ({
      ...page,
      pageNumber: index + 1
    }));
  }
}
