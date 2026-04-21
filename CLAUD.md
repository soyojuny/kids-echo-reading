# CLAUD.md

## Purpose

이 문서는 이 저장소를 처음 읽는 사람이나 AI를 위한 짧은 진입 문서다.  
상세 설계는 `/doc` 하위 문서를 읽고, 이 문서는 전체 구조와 반드시 지켜야 할 방향만 요약한다.

## Product Summary

이 프로젝트는 태블릿 중심 PWA 형태의 아이 영어 따라읽기 프로그램이다.

- 책 등록은 관리자(부모)가 수동으로 한다
- 페이지 이미지를 등록하고 텍스트를 입력한다
- AI가 페이지를 읽어 주고 단어 단위로 하이라이트한다
- 아이가 따라 읽으면 발음 평가 결과를 단어 단위로 보여 준다

## Current Stack

- Frontend: `Next.js + TypeScript`
- Deployment: `Vercel`
- Database and file storage: `Supabase`
- TTS: `Google Cloud Text-to-Speech Neural2`
- Pronunciation assessment: `Azure Speech Pronunciation Assessment`
- OCR: 현재 핵심 흐름 아님, 이후 확장 기능

## Non-Negotiables

- MVP에서는 OCR보다 수동 입력을 우선한다
- 이미지는 여러 장 일괄 업로드, 텍스트는 페이지 단위 검수를 기본으로 한다
- TTS는 실시간 기본 호출이 아니라 사전 생성 후 저장한다
- 부모 공통 TTS 프리셋을 기본값으로 하고 책별 override는 선택적으로만 허용한다
- 읽기 평가는 `Azure Pronunciation Assessment`를 기준 엔진으로 사용한다
- UI는 태블릿 `landscape` 우선, PWA 설치/캐시를 고려한다

## Read Order

구현 전에는 아래 순서로 문서를 읽는다.

1. `/doc/INDEX.md`
2. `/doc/architecture.md`
3. `/doc/data-model.md`
4. `/doc/deployment.md`

## Working Rules

- 구현이 문서와 충돌하면 먼저 문서를 확인하고, 문서가 맞지 않으면 문서를 같이 수정한다
- 새 기능은 MVP 범위인지 먼저 확인한다
- 상태값, 테이블, 스토리지 경로를 임의로 추가하지 않는다
- 중요한 구조 변경은 관련 `/doc` 문서를 함께 갱신한다

## Immediate Build Order

1. 기본 앱 셋업: Next.js, Supabase, PWA
2. 관리자 책 등록: 다중 이미지 업로드, 페이지 정렬, 페이지별 텍스트 입력
3. TTS 프리셋과 페이지 오디오 생성/저장
4. 아이 읽기 화면: 이미지, 텍스트, 하이라이트
5. 녹음과 Azure 발음 평가 결과 표시

## UI Source Of Truth (Added)

- Child reading UX baseline:
  - `./doc/ui/child-reading-cx-spec.md`
- State transitions for implementation:
  - `./doc/ui/child-reading-state-machine.md`
- Decision history:
  - `./doc/ui/child-reading-decision-log.md`

When UI behavior conflicts with code, align implementation to these UI docs first and update related docs together.
