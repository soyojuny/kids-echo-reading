export type BookStatus = "draft" | "ready" | "archived";
export type PageViewMode = "single" | "spread";

export interface Book {
  id: string;
  title: string;
  author?: string;
  status: BookStatus;
  pageViewMode: PageViewMode;
  createdAt: string;
}
