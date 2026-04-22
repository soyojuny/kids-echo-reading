import { NextResponse } from "next/server";
import type {
  SentenceAssessmentResponse,
  SentenceAssessmentWord,
  WordAssessmentState
} from "@/features/assessment/types/AssessmentTypes";
import { assessPronunciationWithAzure } from "@/server/azure/pronunciation";
import { normalizePageText } from "@/server/supabase/bookPages";
import { createServerSupabaseClient } from "@/server/supabase/server";
import { normalizeToken, tokenizeBySentence } from "@/shared/utils/textSegmentation";

export const runtime = "nodejs";
export const maxDuration = 60;

type RouteParams = {
  params: Promise<{ bookId: string; pageId: string }>;
};

type PageRow = {
  id: string;
  confirmed_text: string | null;
};

type SessionRow = {
  id: string;
};

type TextVersionRow = {
  id: string;
};

type PageTokenRow = {
  id: string;
  token_order: number;
  display_text: string;
  normalized_text: string | null;
  sentence_index: number;
};

type ReadingAttemptRow = {
  id: string;
};

function toSafeSentenceIndex(raw: unknown, sentenceCount: number): number {
  const parsed = typeof raw === "string" ? Number(raw) : typeof raw === "number" ? raw : 0;
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  if (sentenceCount <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(sentenceCount - 1, Math.floor(parsed)));
}

function pickLocale(raw: unknown): string {
  if (typeof raw !== "string") {
    return "en-US";
  }
  const trimmed = raw.trim();
  return trimmed || "en-US";
}

async function resolveSessionId(input: {
  bookId: string;
  requestedSessionId?: string;
}): Promise<string> {
  const supabase = createServerSupabaseClient();
  const candidate = input.requestedSessionId?.trim();

  if (candidate) {
    const { data, error } = await supabase
      .from("reading_sessions")
      .select("id")
      .eq("id", candidate)
      .eq("book_id", input.bookId)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }
    if (data) {
      return (data as SessionRow).id;
    }
  }

  const { data, error } = await supabase
    .from("reading_sessions")
    .insert({
      book_id: input.bookId,
      status: "active"
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return (data as SessionRow).id;
}

async function resolveCurrentTextVersionId(input: {
  pageId: string;
  confirmedText: string;
}): Promise<string> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("page_text_versions")
    .select("id")
    .eq("page_id", input.pageId)
    .eq("is_current", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const existing = (data as TextVersionRow | null)?.id;
  if (existing) {
    return existing;
  }

  const { data: created, error: createError } = await supabase
    .from("page_text_versions")
    .insert({
      page_id: input.pageId,
      source_type: "manual",
      raw_text: input.confirmedText,
      normalized_text: normalizePageText(input.confirmedText),
      is_current: true
    })
    .select("id")
    .single();

  if (createError) {
    throw new Error(createError.message);
  }

  return (created as TextVersionRow).id;
}

async function resolvePageTokens(input: {
  pageId: string;
  textVersionId: string;
  confirmedText: string;
}): Promise<PageTokenRow[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("page_tokens")
    .select("id,token_order,display_text,normalized_text,sentence_index")
    .eq("page_id", input.pageId)
    .eq("text_version_id", input.textVersionId)
    .order("token_order", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const existingRows = (data ?? []) as PageTokenRow[];
  if (existingRows.length > 0) {
    return existingRows;
  }

  const tokenRows = tokenizeBySentence(input.confirmedText)
    .flatMap((tokens, sentenceIndex) =>
      tokens.map((token, tokenIndex) => ({
        page_id: input.pageId,
        text_version_id: input.textVersionId,
        token_order: tokenIndex,
        display_text: token,
        normalized_text: normalizeToken(token),
        sentence_index: sentenceIndex
      }))
    )
    .map((row, index) => ({
      ...row,
      token_order: index
    }));

  if (tokenRows.length === 0) {
    return [];
  }

  const { data: createdRows, error: createError } = await supabase
    .from("page_tokens")
    .insert(tokenRows)
    .select("id,token_order,display_text,normalized_text,sentence_index")
    .order("token_order", { ascending: true });

  if (createError) {
    throw new Error(createError.message);
  }

  return (createdRows ?? []) as PageTokenRow[];
}

function toFeedback(words: SentenceAssessmentWord[]) {
  const goodWords = words.filter((word) => word.state === "correct").length;
  const retryWords = [
    ...new Set(
      words
        .filter((word) => word.state !== "correct")
        .map((word) => word.referenceWord.trim())
        .filter(Boolean)
    )
  ];

  if (words.length === 0) {
    return {
      message: "평가 가능한 단어가 없습니다.",
      goodWords,
      retryWords
    };
  }

  if (retryWords.length === 0) {
    return {
      message: "잘 읽었어요! 이 문장은 모두 통과예요.",
      goodWords,
      retryWords
    };
  }

  return {
    message: `${goodWords}/${words.length}개 단어를 정확히 읽었어요. 남은 단어를 다시 읽어보자.`,
    goodWords,
    retryWords
  };
}

function normalizeState(state: WordAssessmentState): WordAssessmentState {
  if (state === "correct" || state === "partial" || state === "missed" || state === "inserted") {
    return state;
  }
  return "wrong";
}

export async function POST(request: Request, context: RouteParams) {
  try {
    const { bookId, pageId } = await context.params;
    const formData = await request.formData();
    const audio = formData.get("audio");
    if (!(audio instanceof File)) {
      return NextResponse.json({ error: "audio file is required." }, { status: 400 });
    }

    const locale = pickLocale(formData.get("locale"));
    const requestedSentenceText = String(formData.get("sentenceText") ?? "").trim();
    const requestedSessionId = String(formData.get("sessionId") ?? "").trim() || undefined;

    const supabase = createServerSupabaseClient();
    const { data: pageData, error: pageError } = await supabase
      .from("book_pages")
      .select("id,confirmed_text")
      .eq("id", pageId)
      .eq("book_id", bookId)
      .maybeSingle();

    if (pageError) {
      return NextResponse.json({ error: pageError.message }, { status: 500 });
    }
    if (!pageData) {
      return NextResponse.json({ error: "Page not found." }, { status: 404 });
    }

    const page = pageData as PageRow;
    const confirmedText = page.confirmed_text?.trim() ?? "";
    if (!confirmedText) {
      return NextResponse.json({ error: "Confirmed page text is required before assessment." }, { status: 400 });
    }

    const sentenceMatrix = tokenizeBySentence(confirmedText);
    const safeSentenceIndex = toSafeSentenceIndex(formData.get("sentenceIndex"), sentenceMatrix.length);
    const fallbackSentence = sentenceMatrix[safeSentenceIndex]?.join(" ") ?? "";
    const sentenceText = requestedSentenceText || fallbackSentence;
    if (!sentenceText) {
      return NextResponse.json({ error: "Sentence text is empty." }, { status: 400 });
    }

    const sessionId = await resolveSessionId({
      bookId,
      requestedSessionId
    });

    const audioBuffer = Buffer.from(await audio.arrayBuffer());
    const extension = audio.type.includes("wav") ? "wav" : "webm";
    const recordingPath = `${bookId}/${pageId}/${sessionId}/${Date.now()}-${crypto.randomUUID()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from("reading-recordings")
      .upload(recordingPath, audioBuffer, {
        contentType: audio.type || "application/octet-stream",
        upsert: false
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    let azureResult;
    try {
      azureResult = await assessPronunciationWithAzure({
        audioBuffer,
        referenceText: sentenceText,
        locale
      });
    } catch (error) {
      await supabase.from("reading_attempts").insert({
        session_id: sessionId,
        page_id: pageId,
        recording_path: recordingPath,
        status: "failed"
      });

      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Pronunciation assessment failed."
        },
        { status: 502 }
      );
    }

    const { data: attemptData, error: attemptError } = await supabase
      .from("reading_attempts")
      .insert({
        session_id: sessionId,
        page_id: pageId,
        recording_path: recordingPath,
        overall_score: azureResult.overallScore ?? null,
        accuracy_score: azureResult.accuracyScore ?? null,
        fluency_score: azureResult.fluencyScore ?? null,
        completeness_score: azureResult.completenessScore ?? null,
        prosody_score: azureResult.prosodyScore ?? null,
        status: "assessed"
      })
      .select("id")
      .single();

    if (attemptError) {
      return NextResponse.json({ error: attemptError.message }, { status: 500 });
    }

    const attemptId = (attemptData as ReadingAttemptRow).id;
    const textVersionId = await resolveCurrentTextVersionId({
      pageId,
      confirmedText
    });
    const pageTokens = await resolvePageTokens({
      pageId,
      textVersionId,
      confirmedText
    });

    const sentenceStartOffset = sentenceMatrix
      .slice(0, safeSentenceIndex)
      .reduce((sum, tokens) => sum + tokens.length, 0);
    const currentSentenceLength = sentenceMatrix[safeSentenceIndex]?.length ?? 0;

    const mappedWords: SentenceAssessmentWord[] = azureResult.words.map((word) => {
      const token =
        word.index >= 0 && word.index < currentSentenceLength
          ? pageTokens[sentenceStartOffset + word.index]
          : undefined;
      return {
        index: word.index,
        referenceWord: word.referenceWord,
        state: normalizeState(word.state),
        accuracyScore: word.accuracyScore,
        errorType: word.errorType,
        recognizedText: word.recognizedText,
        tokenId: token?.id
      };
    });

    if (mappedWords.length > 0) {
      const { error: wordInsertError } = await supabase.from("word_assessments").insert(
        mappedWords.map((word) => ({
          attempt_id: attemptId,
          token_id: word.tokenId ?? null,
          result_state: normalizeState(word.state),
          accuracy_score: word.accuracyScore ?? null,
          error_type: word.errorType ?? null,
          recognized_text: word.recognizedText ?? null
        }))
      );

      if (wordInsertError) {
        return NextResponse.json({ error: wordInsertError.message }, { status: 500 });
      }
    }

    const feedback = toFeedback(mappedWords);
    const responsePayload: SentenceAssessmentResponse = {
      provider: "azure",
      sessionId,
      attemptId,
      sentenceIndex: safeSentenceIndex,
      sentenceText,
      score: {
        overallScore: azureResult.overallScore,
        accuracyScore: azureResult.accuracyScore,
        fluencyScore: azureResult.fluencyScore,
        completenessScore: azureResult.completenessScore,
        prosodyScore: azureResult.prosodyScore
      },
      words: mappedWords,
      feedback
    };

    return NextResponse.json(responsePayload);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
