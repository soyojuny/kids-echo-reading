export function splitSentences(text: string): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return [];
  }

  const matched = normalized
    .match(/[^.!?。！？\n]+[.!?。！？]?/g)
    ?.map((sentence) => sentence.trim())
    .filter(Boolean);
  return matched && matched.length > 0 ? matched : [normalized];
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
