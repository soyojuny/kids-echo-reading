# Deployment

## Purpose

이 문서는 배포 구조, 런타임 경계, 환경변수, 운영 규칙을 정의한다.  
로컬 개발과 운영 배포 모두 이 문서를 기준으로 맞춘다.

## Scope

포함:

- Vercel 배포
- Supabase 연결
- Google TTS와 Azure Speech 연동
- PWA 운영 고려사항

제외:

- 비용 세부 산정표
- 모니터링 툴 상세 구성

## Deployment Targets

### App Hosting

- 플랫폼: `Vercel`
- 앱 형태: `Next.js` 웹앱 + `PWA`

### Database And Storage

- 플랫폼: `Supabase`
- 사용 구성:
  - `Postgres`
  - `Storage`
  - 필요 시 `Auth`

### External Services

- `Google Cloud Text-to-Speech` (optional)
- `Microsoft Edge Read Aloud TTS` via `node-edge-tts`
- `Azure Speech Pronunciation Assessment`

## Runtime Boundaries

### Browser

브라우저는 아래 역할만 가진다.

- UI 렌더링
- 오디오 재생
- 녹음 수집
- PWA 캐시 사용

브라우저는 외부 클라우드 비밀키를 직접 가지지 않는다.

### Server

서버는 아래 역할을 가진다.

- Supabase와 통신
- Google TTS 호출
- Azure 발음 평가 호출
- 업로드 파일 검증
- 오디오와 평가 결과 저장

## Environment Variables

필수 env 예시:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TTS_PROVIDER` (`fallback` or `edge`)
- `EDGE_TTS_OUTPUT_FORMAT` (optional)
- `EDGE_TTS_TIMEOUT_MS` (optional)
- `GOOGLE_CLOUD_PROJECT_ID`
- `GOOGLE_CLOUD_CLIENT_EMAIL`
- `GOOGLE_CLOUD_PRIVATE_KEY`
- `AZURE_SPEECH_KEY`
- `AZURE_SPEECH_REGION`

원칙:

- 공개 키와 비밀 키를 분리한다
- Google과 Azure 자격증명은 서버에서만 사용한다
- 로컬과 운영 환경은 동일한 키 이름을 사용한다

## PWA Rules

- 설치 가능해야 한다
- 홈 화면 아이콘과 매니페스트를 제공한다
- 현재 책, 현재 페이지, 다음 페이지 자산을 우선 캐시한다
- TTS 오디오는 `cache-first`
- 평가 결과 저장은 `network-first`

## Asset Strategy

- 페이지 이미지는 `book-pages` 버킷에 저장한다
- 정식 TTS 오디오는 `book-audio` 버킷에 저장한다
- 아이 녹음은 `reading-recordings`에 임시 저장 후 삭제 가능해야 한다
- 향후 저장소 부족 시 `Cloudflare R2`를 보조 스토리지로 검토한다

## Deployment Flow

1. 코드가 `Vercel`에 배포된다
2. 서버 환경변수가 주입된다
3. 앱이 `Supabase`와 연결된다
4. 관리자 기능이 이미지 업로드와 데이터 저장을 수행한다
5. TTS 생성 API가 Google TTS를 호출한다
6. 읽기 평가 API가 Azure Speech를 호출한다

## Operational Rules

- TTS 생성은 텍스트 확정 이후에만 수행한다
- 텍스트나 TTS 프로필이 변경되면 해당 페이지 자산만 무효화한다
- 녹음 파일은 기본적으로 장기 보관하지 않는다
- OCR은 현재 배포 핵심 기능이 아니므로 배포 성공 조건에 넣지 않는다

## Acceptance Criteria

- 운영 배포에서 관리자 책 등록부터 읽기 평가까지 한 흐름이 작동해야 한다
- 클라이언트 코드에 비밀 키가 포함되지 않아야 한다
- PWA 설치와 기본 캐시가 동작해야 한다
- TTS와 발음 평가 호출이 서버 경유로만 실행되어야 한다

## Out Of Scope

- 멀티 리전 배포
- 큐 시스템 도입
- 배치 OCR 운영 자동화
