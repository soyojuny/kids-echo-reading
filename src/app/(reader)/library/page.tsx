import Link from "next/link";

const demoBooks = [
  { id: "demo-book-1", title: "Demo Book 1", page: 1 },
  { id: "demo-book-2", title: "Demo Book 2", page: 1 }
];

export default function ReaderLibraryPage() {
  return (
    <main className="container">
      <section className="panel">
        <h1>아이 책 선택</h1>
        <p className="muted">Phase 1에서는 세션 진입 라우트만 준비합니다.</p>
      </section>
      <section className="grid two" style={{ marginTop: "1rem" }}>
        {demoBooks.map((book) => (
          <article key={book.id} className="panel">
            <h2>{book.title}</h2>
            <Link href={`/session/${book.id}/${book.page}`}>읽기 시작</Link>
          </article>
        ))}
      </section>
    </main>
  );
}
