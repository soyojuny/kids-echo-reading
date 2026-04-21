import Link from "next/link";

export default function HomePage() {
  return (
    <main className="container">
      <section className="panel">
        <h1>Kids Echo Reading</h1>
        <p className="muted">문서 기준에 맞춰 Phase 1 기본 앱 골격이 생성되었습니다.</p>
        <div className="grid two">
          <Link className="panel" href="/books">
            <h2>관리자 시작 화면</h2>
            <p className="muted">책 등록, 페이지 입력, TTS 생성 준비</p>
          </Link>
          <Link className="panel" href="/library">
            <h2>아이 읽기 시작 화면</h2>
            <p className="muted">책 선택 및 읽기 세션 진입</p>
          </Link>
        </div>
      </section>
    </main>
  );
}
