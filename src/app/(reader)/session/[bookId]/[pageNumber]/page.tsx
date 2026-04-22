import Link from "next/link";
import { ReaderSessionPlayer } from "@/features/reading/components/ReaderSessionPlayer";
import { fetchReaderSessionPage } from "@/server/supabase/readerSession";

type SessionParams = {
  bookId: string;
  pageNumber: string;
};

type SessionPageProps = {
  params: Promise<SessionParams>;
};

export default async function ReaderSessionPage({ params }: SessionPageProps) {
  const { bookId, pageNumber } = await params;
  const parsedPageNumber = Number(pageNumber);

  if (!Number.isFinite(parsedPageNumber) || parsedPageNumber <= 0) {
    return (
      <main className="container">
        <section className="panel">
          <h1>읽기 세션</h1>
          <p>잘못된 페이지 번호입니다.</p>
          <Link href="/library">책 목록으로 이동</Link>
        </section>
      </main>
    );
  }

  const sessionPage = await fetchReaderSessionPage(bookId, parsedPageNumber);
  if (!sessionPage) {
    return (
      <main className="container">
        <section className="panel">
          <h1>읽기 세션</h1>
          <p>요청한 페이지를 찾을 수 없습니다.</p>
          <Link href="/library">책 목록으로 이동</Link>
        </section>
      </main>
    );
  }

  return (
    <ReaderSessionPlayer
      bookTitle={sessionPage.bookTitle}
      bookId={sessionPage.bookId}
      pageNumber={sessionPage.pageNumber}
      totalPages={sessionPage.totalPages}
      imageUrl={sessionPage.imageUrl}
      nextPageImageUrl={sessionPage.nextPageImageUrl}
      confirmedText={sessionPage.confirmedText}
      audioUrl={sessionPage.audioUrl}
      wordTimings={sessionPage.wordTimings}
      previousPageNumber={sessionPage.previousPageNumber}
      nextPageNumber={sessionPage.nextPageNumber}
    />
  );
}
