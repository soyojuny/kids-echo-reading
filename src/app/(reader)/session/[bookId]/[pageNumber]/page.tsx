type SessionParams = {
  bookId: string;
  pageNumber: string;
};

type SessionPageProps = {
  params: SessionParams | Promise<SessionParams>;
};

export default async function ReaderSessionPage({ params }: SessionPageProps) {
  const { bookId, pageNumber } = await Promise.resolve(params);

  return (
    <main className="container">
      <section className="panel">
        <h1>읽기 세션</h1>
        <p>Book: {bookId}</p>
        <p>Page: {pageNumber}</p>
        <p className="muted">
          Phase 3~4에서 하이라이트/녹음/평가를 연결합니다. 현재는 라우트 및 화면 구조만 준비했습니다.
        </p>
      </section>
    </main>
  );
}
