# Kids Echo Reading Development Schedule

Last Updated: `2026-04-23`
Source Of Truth: `plan.md`, `CLAUD.md`, `doc/INDEX.md`

## Overall Phase Plan

| Phase | Goal | Status | Target Output |
| --- | --- | --- | --- |
| Phase 1 | 기본 프로젝트 셋업 | In Progress | Next.js + Supabase + PWA 골격, 로그인 없는 관리자 시작 화면 |
| Phase 2 | 책 업로드와 수동 텍스트 입력 | In Progress | 책 생성, 다중 업로드, 순서 정렬, 페이지 편집기 |
| Phase 3 | TTS와 하이라이트 | In Progress | TTS 프리셋, 오디오 생성, 하이라이트 |
| Phase 4 | 아동 읽기 CX 정렬 (문서/데모 기준) | In Progress | 문장 루프 상태머신, 페이지 복습, 최종 추천 복습, 방향별 1/2페이지 |
| Phase 5 | 따라읽기 평가 연동 | In Progress | 녹음 업로드, Azure 평가, 단어별 결과 |
| Phase 6 | 태블릿 UX/PWA 강화 | In Progress | 설치성/캐시/이어보기 강화 |
| Phase 7 | 입력 자동화 확장 | Pending | OCR 초안 생성 + 검수 UI |

## Detailed Task Board

### Phase 1. 기본 프로젝트 셋업

- [x] `2026-04-21` 기준 문서 정독 완료 (`plan.md`, `CLAUD.md`, `/doc/*`)
- [x] `2026-04-21` Next.js + TypeScript 프로젝트 골격 생성
- [x] `2026-04-21` `doc/project-structure.md` 기준 디렉토리 구조 생성
- [x] `2026-04-21` Supabase 서버/클라이언트 연결 유틸 추가
- [x] `2026-04-21` PWA 매니페스트/서비스 워커 기본 구성
- [x] `2026-04-21` 로그인 없는 관리자 시작 화면 구성
- [x] `2026-04-21` 의존성 설치 및 로컬 빌드 검증
- [ ] Vercel 프로젝트 연결 및 배포 확인

### Phase 2. 책 업로드와 수동 텍스트 입력

- [x] `2026-04-21` 책 생성 화면(로컬 in-memory) 구현
- [x] `2026-04-21` 다중 페이지 업로드 구현
- [x] `2026-04-21` 파일명 기반 자동 정렬 구현
- [x] `2026-04-21` 페이지 순서 변경(위/아래 이동) 구현
- [x] `2026-04-21` 페이지별 텍스트 편집 및 확정 상태 구현
- [x] `2026-04-21` 전체 텍스트 붙여넣기 분배 도구 구현
- [x] `2026-04-21` Supabase 테이블 연동으로 in-memory 저장소 대체(API 기반)
- [x] `2026-04-21` 업로드 파일을 Storage(`book-pages`)에 저장하도록 API 연결
- [x] `2026-04-21` `book_pages`, `page_text_versions` 실제 DB 저장/조회 연결

### Phase 3. TTS와 하이라이트

- [x] `2026-04-21` 부모 공통 TTS 프리셋 모델/화면
- [x] `2026-04-21` 페이지 텍스트 확정 후 TTS 생성 API
- [x] `2026-04-21` TTS 오디오 저장 및 메타데이터 저장
- [x] `2026-04-21` 읽기 화면 재생 + 문장/단어 하이라이트

### Phase 4. 아동 읽기 CX 정렬 (문서/데모 기준)

- [x] `2026-04-22` 읽기 상태머신(`idle/ai_playing/child_recording/retry/page_review/final_review`) UI 반영
- [x] `2026-04-22` 문장 단위 자동 이동(2초), 페이지 자동 이동(5초) 타이머 반영
- [x] `2026-04-22` 남은 단어 재시도 패널 및 페이지 복습 플로우 반영
- [x] `2026-04-22` 마지막 페이지 AI 추천 복습 화면 반영(점수 중심 화면 미사용)
- [x] `2026-04-22` 방향별 기본 보기(가로 2페이지/세로 1페이지) + 수동 토글 우선 반영

### Phase 5. 따라읽기 평가

- [x] `2026-04-22` 녹음 수집 UI/업로드
- [x] `2026-04-22` Azure Pronunciation Assessment 호출
- [x] `2026-04-22` 결과 매핑 및 저장
- [x] `2026-04-22` 단어별 피드백 UI

### Phase 6. 태블릿 UX/PWA 강화

- [x] `2026-04-23` landscape/portrait 기본 정책 반영(매니페스트 orientation 완화 + 리더 기본 정책 유지)
- [x] `2026-04-23` 홈 화면 설치성 점검(설치 프롬프트 UI 노출 및 설치 트리거 처리)
- [x] `2026-04-23` 현재/다음 페이지 자산 프리캐시(서비스워커 message + 캐시 전략)
- [x] `2026-04-23` 마지막 읽던 책 이어보기(localStorage 저장 + 라이브러리 이어읽기 CTA)

### Phase 7. 입력 자동화 확장

- [ ] OCR 자동 초안 생성
- [ ] OCR 결과 검수 플로우
- [ ] 선택적 고급 OCR 확장 설계

## Completion Log

- `2026-04-21`: 전체 개발 스케줄 파일 생성
- `2026-04-21`: 구현 기준 문서 읽기 및 단계별 범위 확정
- `2026-04-21`: Phase 1 코드 골격(Next.js 구조, PWA, Supabase 유틸, 기본 관리자/리더 화면) 구현
- `2026-04-21`: Phase 2 관리자 입력 UI(생성/업로드/정렬/순서변경/페이지편집/일괄분배) 1차 구현
- `2026-04-21`: 로컬 검증 수행(`npm install`, `npm run typecheck`, `npm run build` 통과)
- `2026-04-21`: `/doc`에 개발 검증 워크플로우 및 Supabase 설정 가이드 추가
- `2026-04-21`: Phase 2 Supabase 실연동(API route handlers, Storage 업로드, DB CRUD) 적용
- `2026-04-21`: 변경 후 `npm run verify` 재실행 통과
- `2026-04-21`: Phase 2 Supabase 연동 변경사항 커밋/원격 반영
- `2026-04-21`: Phase 3 TTS 프리셋/생성 API/오디오 저장/리더 하이라이트 1차 구현
- `2026-04-22`: Phase 4 아동 읽기 CX 정렬(문장 루프 상태머신, 페이지 복습, 최종 추천 복습, 방향별 1/2페이지) 1차 구현
- `2026-04-22`: Phase 5 따라읽기 평가 연동(녹음 업로드, Azure 평가 API, reading_attempts/word_assessments 저장, 단어 피드백 UI) 1차 구현
- `2026-04-23`: Phase 6 태블릿 UX/PWA 강화 1차 구현(설치 프롬프트, 자산 프리캐시, 이어읽기, 터치 타깃 확대)
