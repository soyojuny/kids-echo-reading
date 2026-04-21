import Link from "next/link";
import { createServerSupabaseClient } from "@/server/supabase/server";

type ReaderBookRow = {
  id: string;
  title: string;
  created_at: string;
};

export default async function ReaderLibraryPage() {
  let books: ReaderBookRow[] = [];
  let errorMessage: string | undefined;

  try {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("books")
      .select("id,title,created_at")
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    books = (data ?? []) as ReaderBookRow[];
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "책 목록을 불러오지 못했습니다.";
  }

  return (
    <main className="container">
      <section className="panel">
        <h1>아이 책 선택</h1>
        <p className="muted">Supabase에 저장된 책 목록에서 읽기 세션으로 진입합니다.</p>
      </section>

      {errorMessage && (
        <section className="panel" style={{ marginTop: "1rem" }}>
          <p>책 목록 조회에 실패했습니다: {errorMessage}</p>
        </section>
      )}

      {!errorMessage && books.length === 0 && (
        <section className="panel" style={{ marginTop: "1rem" }}>
          <p className="muted">등록된 책이 없습니다. 관리자 화면에서 먼저 책을 생성하세요.</p>
          <Link href="/books">관리자 책 등록으로 이동</Link>
        </section>
      )}

      {!errorMessage && books.length > 0 && (
        <section className="grid two" style={{ marginTop: "1rem" }}>
          {books.map((book) => (
            <article key={book.id} className="panel">
              <h2>{book.title}</h2>
              <Link href={`/session/${book.id}/1`}>읽기 시작</Link>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
