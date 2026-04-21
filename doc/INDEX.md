# Document Index

## Purpose

이 폴더는 구현용 설계 문서의 원본이다.  
AI나 개발자는 작업 전에 이 문서를 기준으로 판단해야 한다.

문서의 목표는 설명이 아니라 **구현 기준선**을 제공하는 것이다.

## Source Of Truth

- 제품의 큰 방향: [`../plan.md`](../plan.md)
- 구현용 요약: [`../CLAUD.md`](../CLAUD.md)
- 시스템 구조와 흐름: [`architecture.md`](./architecture.md)
- 프로세스 흐름도: [`process-flows.md`](./process-flows.md)
- DB, 스토리지, 상태값: [`data-model.md`](./data-model.md)
- 배포, 환경변수, 런타임 경계: [`deployment.md`](./deployment.md)
- 프로젝트 구조와 규약: [`project-structure.md`](./project-structure.md)

## Reading Guide

### 새 기능을 만들 때

1. `architecture.md`
2. `process-flows.md`
3. `data-model.md`
4. `project-structure.md`
5. `deployment.md`

### DB나 API를 바꿀 때

1. `data-model.md`
2. `architecture.md`
3. `project-structure.md`

### 인프라, 배포, 환경변수를 바꿀 때

1. `deployment.md`
2. `architecture.md`

### 프로젝트 구조나 구현 위치를 정할 때

1. `project-structure.md`
2. `architecture.md`

## Project Invariants

- 책 등록의 기본 흐름은 수동 입력이다
- OCR은 현재 확장 기능이며 핵심 플로우가 아니다
- TTS 기본 엔진은 `Google Neural2`다
- TTS는 페이지 텍스트 확정 후 생성하여 저장한다
- 발음 평가는 `Azure Pronunciation Assessment`를 사용한다
- 저장소의 기본 데이터 소스는 `Supabase Postgres`와 `Supabase Storage`다
- 배포 기준 플랫폼은 `Vercel`이다
- UI 우선순위는 태블릿 `landscape`와 PWA 설치성이다

## Required Doc Sections

각 문서는 아래 항목을 기준으로 유지한다.

- `Purpose`
- `Scope`
- `Invariants`
- `Acceptance Criteria`
- `Out Of Scope`

## Change Policy

- 아키텍처를 바꾸면 `architecture.md`를 갱신한다
- 테이블/상태값/스토리지를 바꾸면 `data-model.md`를 갱신한다
- 배포 구조나 env를 바꾸면 `deployment.md`를 갱신한다
- 제품 큰 방향을 바꾸면 `plan.md`와 `CLAUD.md`도 함께 점검한다

## UI Docs (Added)

- Child reading UX baseline: [`ui/child-reading-cx-spec.md`](./ui/child-reading-cx-spec.md)
- Reading state transitions: [`ui/child-reading-state-machine.md`](./ui/child-reading-state-machine.md)
- UX decision history: [`ui/child-reading-decision-log.md`](./ui/child-reading-decision-log.md)
