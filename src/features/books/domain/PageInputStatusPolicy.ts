import type { InputStatus } from "@/features/books/domain/BookPage";

export class PageInputStatusPolicy {
  static resolve(input: { text: string; isConfirmed: boolean }): InputStatus {
    const normalized = input.text.trim();
    if (!normalized) {
      return "empty";
    }

    return input.isConfirmed ? "ready" : "draft";
  }
}
