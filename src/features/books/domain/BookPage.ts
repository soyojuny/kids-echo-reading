export type InputStatus = "empty" | "draft" | "ready";

export interface BookPage {
  id: string;
  bookId: string;
  pageNumber: number;
  imagePath: string;
  confirmedText: string;
  inputStatus: InputStatus;
  createdAt: string;
}
