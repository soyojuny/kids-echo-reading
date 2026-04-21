export class DistributeBulkTextUseCase {
  execute(input: { pageCount: number; bulkText: string }): string[] {
    const pageCount = Math.max(0, input.pageCount);
    if (pageCount === 0) {
      return [];
    }

    const normalized = input.bulkText.replace(/\r\n/g, "\n").trim();
    if (!normalized) {
      return Array.from({ length: pageCount }, () => "");
    }

    const byMarker = this.splitByPageMarker(normalized, pageCount);
    if (byMarker.some((text) => text)) {
      return byMarker;
    }

    return this.splitByBlankLines(normalized, pageCount);
  }

  private splitByPageMarker(text: string, pageCount: number): string[] {
    const result = Array.from({ length: pageCount }, () => "");
    const markerPattern = /(?:^|\n)\s*Page\s+(\d+)\s*[:.-]?\s*/gi;
    const matches = [...text.matchAll(markerPattern)];
    if (!matches.length) {
      return result;
    }

    for (let index = 0; index < matches.length; index += 1) {
      const match = matches[index];
      const pageNumber = Number(match[1]);
      if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pageCount) {
        continue;
      }

      const start = (match.index ?? 0) + match[0].length;
      const end = index + 1 < matches.length ? matches[index + 1].index ?? text.length : text.length;
      result[pageNumber - 1] = text.slice(start, end).trim();
    }

    return result;
  }

  private splitByBlankLines(text: string, pageCount: number): string[] {
    const blocks = text
      .split(/\n\s*\n+/)
      .map((block) => block.trim())
      .filter(Boolean);

    const result = Array.from({ length: pageCount }, () => "");
    if (!blocks.length) {
      return result;
    }

    blocks.forEach((block, index) => {
      const cappedIndex = Math.min(index, pageCount - 1);
      result[cappedIndex] = result[cappedIndex]
        ? `${result[cappedIndex]}\n\n${block}`
        : block;
    });

    return result;
  }
}
