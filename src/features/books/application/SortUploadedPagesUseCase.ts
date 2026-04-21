import type { EditableBookPage } from "@/features/books/types/EditableBookPage";

const filenameCollator = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base"
});

export class SortUploadedPagesUseCase {
  execute(pages: EditableBookPage[]): EditableBookPage[] {
    return [...pages]
      .sort((a, b) => filenameCollator.compare(a.fileName, b.fileName))
      .map((page, index) => ({
        ...page,
        pageNumber: index + 1
      }));
  }
}
