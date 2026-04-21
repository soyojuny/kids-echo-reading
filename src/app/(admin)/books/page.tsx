const phaseOneChecklist = [
  "책 생성",
  "다중 페이지 업로드",
  "페이지 정렬",
  "페이지별 텍스트 확정",
  "TTS 생성 준비"
];

export default function AdminBooksPage() {
  return (
    <main className="container">
      <section className="panel">
        <h1>관리자 시작 화면</h1>
        <p className="muted">
          로그인 없는 Phase 1 뼈대 화면입니다. 이후 Phase 2에서 실제 업로드/정렬/입력 기능을 연결합니다.
        </p>
      </section>

      <section className="grid two" style={{ marginTop: "1rem" }}>
        <article className="panel">
          <h2>책 등록 준비</h2>
          <ul>
            {phaseOneChecklist.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
        <article className="panel">
          <h2>현재 상태</h2>
          <p className="muted">데이터 저장소 연결 전 상태</p>
          <p>다음 단계: Supabase 연동 후 책 생성/페이지 입력 유스케이스 연결</p>
        </article>
      </section>
    </main>
  );
}
