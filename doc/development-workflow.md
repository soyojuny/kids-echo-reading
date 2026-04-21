# Development Workflow

## Purpose

이 문서는 개발 후 검증(테스트/빌드) 루틴을 고정해, 기능 추가 이후 품질 저하를 막는 기준을 정의한다.

## Scope

포함:

- 로컬 개발 시 기본 검증 순서
- 커밋 전 필수 검증 명령
- 실패 시 처리 규칙

제외:

- E2E/통합 테스트 도구 상세 선택
- CI/CD 파이프라인 상세 YAML

## Required Local Verification Steps

모든 기능 개발/수정 후 아래 순서를 반드시 실행한다.

1. `npm run typecheck`
2. `npm run build`

또는 단일 명령:

- `npm run verify`

Windows PowerShell에서 `npm` 정책 이슈가 있으면 `npm.cmd`를 사용한다.

예:

- `npm.cmd run verify`

## Failure Handling Rule

- `typecheck` 또는 `build`가 실패하면 원인 수정 후 다시 검증한다.
- 검증이 통과하기 전에는 완료 처리(스케줄 체크, 배포, 최종 커밋)를 하지 않는다.
- 검증 실패 원인은 작업 기록 또는 커밋 메시지/PR 설명에 남긴다.

## Invariants

- 개발 완료 기준에는 반드시 로컬 검증 통과가 포함된다.
- 코드 변경 후 검증 없이 다음 phase 작업으로 넘어가지 않는다.
- 최소 기준 검증은 `typecheck + build`다.

## Acceptance Criteria

- 신규 기능 작업마다 `npm run verify` 또는 동등한 검증 실행 기록이 남아야 한다.
- 빌드 실패 상태 코드는 커밋/배포 전 수정되어야 한다.
- 문서와 실제 팀 작업 방식이 일치해야 한다.

## Out Of Scope

- 테스트 커버리지 수치 목표 강제
- 특정 테스트 프레임워크(Jest/Vitest/Playwright) 강제
