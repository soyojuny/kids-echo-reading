export type BookStatus = "draft" | "ready" | "archived";
export type PageViewMode = "single" | "spread";
export type BookCategory = "animal" | "adventure" | "daily" | "science" | "emotion";

export interface Book {
  id: string;
  title: string;
  author?: string;
  category: BookCategory;
  readingLevel: number;
  status: BookStatus;
  pageViewMode: PageViewMode;
  createdAt: string;
}
