import type { InputStatus } from "@/features/books/domain/BookPage";

export interface EditableBookPage {
  id: string;
  fileName: string;
  imageUrl: string;
  pageNumber: number;
  confirmedText: string;
  isConfirmed: boolean;
  inputStatus: InputStatus;
}
