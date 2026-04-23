# Project Structure

## Purpose

이 문서는 Next.js 프로젝트의 디렉토리 구조와 구현 규약을 정의한다.  
목표는 스파게티 구조를 피하고, 기능을 객체지향적 책임 분리 하에 개발하도록 강제하는 것이다.

## Scope

포함:

- 추천 디렉토리 트리
- 계층별 책임
- 객체지향 설계 규칙
- 금지사항

제외:

- 코드 스타일 세부 lint 규칙
- 테스트 프레임워크 선택

## Target Structure

```text
src/
  app/
    (admin)/
      books/
      settings/
    (reader)/
      library/
      session/
    api/
      books/
      tts/
      assessment/
    layout.tsx
    page.tsx

  features/
    books/
      components/
      application/
      domain/
      infrastructure/
      types/
    reading/
      components/
      application/
      domain/
      infrastructure/
      types/
    tts/
      components/
      application/
      domain/
      infrastructure/
      types/
    assessment/
      components/
      application/
      domain/
      infrastructure/
      types/

  server/
    supabase/
    google/
    azure/
    core/

  shared/
    components/
    ui/
    hooks/
    utils/
    constants/

  styles/
  types/
```

## Layer Responsibilities

## `app/`

역할:

- 라우트 정의
- 페이지 조립
- 서버 액션 또는 API 진입점 연결

규칙:

- 비즈니스 로직을 직접 두지 않는다
- 외부 API 호출을 직접 두지 않는다
- 화면 조립과 요청 연결만 담당한다

## `features/*/components`

역할:

- 기능 단위 UI 컴포넌트

규칙:

- 렌더링과 사용자 상호작용만 담당한다
- DB, Storage, Edge TTS, Azure 호출 금지
- 복잡한 규칙 판단은 `application` 또는 `domain`으로 넘긴다

## `features/*/application`

역할:

- use case
- 서비스 조합
- 요청/응답 orchestration

예:

- `CreateBookUseCase`
- `GeneratePageTtsUseCase`
- `AssessReadingUseCase`

규칙:

- 각 기능의 진입점은 application layer에 둔다
- 컴포넌트나 API는 use case를 호출해야 한다

## `features/*/domain`

역할:

- 엔티티
- 값 객체
- 정책
- 상태 전이 규칙

예:

- `Book`
- `BookPage`
- `TtsProfile`
- `WordAssessment`
- `ReadingResultPolicy`

규칙:

- 도메인 규칙은 domain layer에만 둔다
- 상태값 판단 로직을 UI에 두지 않는다

## `features/*/infrastructure`

역할:

- repository 구현
- external client adapter
- storage access

예:

- `SupabaseBookRepository`
- `EdgeTtsClient`
- `AzurePronunciationClient`

규칙:

- 외부 시스템 상세는 infrastructure에 숨긴다
- application은 interface 또는 추상화에 의존해야 한다

## `server/`

역할:

- 서버 공용 클라이언트
- 인증된 서비스 접근 유틸
- env 검증

규칙:

- `Supabase`, `Edge TTS`, `Azure` 연결 로직은 공통화한다
- 비밀키 처리 코드는 서버 경계 안에만 둔다

## Object-Oriented Development Rules

- UI는 함수형 컴포넌트로 작성한다
- 비즈니스 로직은 객체와 use case로 분리한다
- 큰 기능을 단일 파일에 몰아넣지 않는다
- 각 객체는 한 가지 책임만 가져야 한다
- 외부 서비스 연동은 client class 또는 repository class로 캡슐화한다

## Recommended Class Types

- Entity
- Value Object
- Policy
- Use Case
- Repository
- Gateway Client
- Mapper

## Naming Rules

- Use case: `VerbNounUseCase`
- Repository: `NounRepository`
- Infrastructure implementation: `ProviderNounRepository` 또는 `ProviderClient`
- Domain entity: 단순 명사
- Policy: `NounPolicy` 또는 `NounEvaluator`

## Dependency Rules

- `app` -> `features/application`
- `features/application` -> `features/domain`
- `features/application` -> `features/infrastructure`
- `features/infrastructure` -> `server`
- `shared`는 공용 유틸만 제공

금지:

- `components` -> `infrastructure` 직접 참조
- `app` -> `server` 직접 참조로 로직 구현
- feature 간 무분별한 순환 참조

## Anti-Spaghetti Rules

- `page.tsx` 하나에 업로드, 저장, TTS, 평가 로직을 모두 넣지 않는다
- `route.ts` 하나에 모든 조건문과 DB 접근을 몰아넣지 않는다
- 한 파일이 UI, 비즈니스 로직, 외부 API 호출을 동시에 가지면 분리한다
- 상태 전이를 문자열 비교 if 문 덩어리로 반복하지 않는다

## Required Split Guidelines

- 페이지 업로드 로직은 `books` feature로 한정한다
- TTS 생성 로직은 `tts` feature로 한정한다
- 발음 평가 로직은 `assessment` feature로 한정한다
- 읽기 세션 UI 조합은 `reading` feature가 담당한다

## Minimum Quality Bar

- 기능 추가 시 최소한 `component`, `use case`, `repository/client` 경계가 보여야 한다
- 상태값과 엔터티는 문서 정의와 일치해야 한다
- 외부 서비스 provider 교체가 가능한 구조여야 한다
- 중요한 로직은 테스트 가능한 단위로 분리되어야 한다
- 기능 개발/수정 후 `typecheck`와 `build` 검증을 통과해야 한다

## Invariants

- 단일 거대 파일 구현을 금지한다
- 비즈니스 로직은 UI 계층 밖으로 분리한다
- 외부 서비스 호출은 infrastructure를 통해서만 수행한다
- 객체지향 규칙은 domain/application/infrastructure 계층에서 적용한다

## Acceptance Criteria

- 개발자가 새 기능을 추가할 때 어디에 코드를 둘지 바로 판단할 수 있어야 한다
- 주요 기능이 feature 단위로 나뉘어야 한다
- 코드 리뷰 시 스파게티 구조 여부를 이 문서 기준으로 판별할 수 있어야 한다

## Out Of Scope

- 모든 로직을 class만으로 작성하는 것
- React UI를 억지로 class component로 바꾸는 것
- 과도한 추상화로 작은 기능까지 복잡하게 만드는 것
