export function splitSentences(text: string): string[] {
  const normalized = text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\f\v]+/g, " ")
    .trim();
  if (!normalized) {
    return [];
  }

  const lines = normalized
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return [];
  }

  const sentences = lines.flatMap((line) => {
    const matched = line
      .match(/[^.!?。！？]+[.!?。！？]?/g)
      ?.map((sentence) => sentence.trim())
      .filter(Boolean);
    return matched && matched.length > 0 ? matched : [line];
  });

  return sentences;
}

export function tokenizeSentence(sentence: string): string[] {
  return sentence
    .trim()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

export function tokenizeBySentence(text: string): string[][] {
  return splitSentences(text).map((sentence) => tokenizeSentence(sentence));
}

export function normalizeToken(token: string): string {
  return token
    .toLowerCase()
    .replace(/[^\p{L}\p{N}'-]+/gu, "")
    .trim();
}
