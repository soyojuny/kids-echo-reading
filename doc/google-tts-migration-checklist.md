# Google Cloud TTS 전환 체크리스트

## 목적

현재 Phase 3는 fallback WAV 합성으로 동작한다.  
이 문서는 이를 Google Cloud Text-to-Speech로 바꾸기 위해 **사용자가 직접 해야 하는 작업**을 정리한다.

## 사용자 작업 (필수)

1. GCP 프로젝트 준비
- Google Cloud Console에서 프로젝트 생성
- Billing 활성화

2. API 활성화
- `Cloud Text-to-Speech API` 활성화

3. 서비스 계정 생성
- 역할: 최소 `Text-to-Speech User` (또는 동등 권한)
- JSON 키 발급

4. 로컬 환경변수 설정
- 프로젝트 루트 `.env` 또는 `.env.local`에 아래 값 설정
  - `GOOGLE_CLOUD_PROJECT_ID`
  - `GOOGLE_CLOUD_CLIENT_EMAIL`
  - `GOOGLE_CLOUD_PRIVATE_KEY`

5. `GOOGLE_CLOUD_PRIVATE_KEY` 입력 형식 확인
- JSON 키의 private key 전체를 문자열로 넣고 줄바꿈을 `\n` 으로 이스케이프 처리
- 예시:
```bash
GOOGLE_CLOUD_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

6. 서버 재시작
- 환경변수 반영을 위해 개발 서버 재시작

7. 동작 검증
- `/books`에서 페이지 텍스트를 `확정(ready)` 상태로 저장
- `이 페이지 TTS 생성` 클릭
- `/session/[bookId]/[pageNumber]`에서 오디오 재생/하이라이트 확인

## 사용자 작업 (선택)

- Google Cloud에서 TTS 사용량 예산/알림 설정
- 서비스 계정 키 주기적 교체

## 참고

- 현재 코드에서 TTS 생성 API 엔드포인트: `src/app/api/books/[bookId]/pages/[pageId]/tts/route.ts`
- 현재 fallback 합성 구현: `src/server/tts/fallbackSynthesis.ts`

