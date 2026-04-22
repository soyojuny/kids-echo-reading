export type WordAssessmentState = "correct" | "partial" | "missed" | "wrong" | "inserted";

export type SentenceAssessmentScore = {
  overallScore?: number;
  accuracyScore?: number;
  fluencyScore?: number;
  completenessScore?: number;
  prosodyScore?: number;
};

export type SentenceAssessmentWord = {
  index: number;
  referenceWord: string;
  state: WordAssessmentState;
  accuracyScore?: number;
  errorType?: string;
  recognizedText?: string;
  tokenId?: string;
};

export type SentenceAssessmentFeedback = {
  message: string;
  goodWords: number;
  retryWords: string[];
};

export type SentenceAssessmentResponse = {
  provider: "azure";
  sessionId: string;
  attemptId: string;
  sentenceIndex: number;
  sentenceText: string;
  score: SentenceAssessmentScore;
  words: SentenceAssessmentWord[];
  feedback: SentenceAssessmentFeedback;
};
