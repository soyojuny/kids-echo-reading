# Data Model

## Purpose

이 문서는 DB 테이블, 스토리지 버킷, 상태값, 관계를 정의한다.  
새 필드나 상태값 추가는 이 문서를 기준으로 검토한다.

## Scope

포함:

- 핵심 테이블
- 버킷 구조
- 상태값
- TTS 프리셋 모델
- 읽기 평가 저장 모델

제외:

- SQL 마이그레이션 전문
- RLS 정책 상세

## Storage Buckets

| Bucket | Purpose | Notes |
| --- | --- | --- |
| `book-pages` | 페이지 이미지 저장 | 관리자 업로드 원본 |
| `book-imports` | 업로드 작업 메타데이터 보조 자산 | 선택적 사용 |
| `book-audio` | 페이지 TTS 오디오 저장 | 정식 재생 자산 |
| `reading-recordings` | 아이 녹음 임시 저장 | 짧은 보관, 장기 저장 금지 |
| `book-covers` | 표지 이미지 | 선택적 |

## Core Tables

## `books`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | uuid | PK |
| `title` | text | 필수 |
| `author` | text | 선택 |
| `cover_path` | text | 선택 |
| `default_tts_profile_id` | uuid | 부모 기본값 또는 책 기본값 |
| `page_view_mode` | text | `single` or `spread` |
| `status` | text | `draft`, `ready`, `archived` |
| `created_at` | timestamptz | 필수 |

## `book_pages`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | uuid | PK |
| `book_id` | uuid | FK |
| `page_number` | int | 책 내 순서, 유일 |
| `image_path` | text | 필수 |
| `input_status` | text | `empty`, `draft`, `ready` |
| `confirmed_text` | text | 최종 표시 텍스트 |
| `tts_profile_override_id` | uuid | 선택적 |
| `created_at` | timestamptz | 필수 |

## `book_import_jobs`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | uuid | PK |
| `book_id` | uuid | FK |
| `mode` | text | `bulk_upload`, `bulk_text_paste`, `manual_page_edit` |
| `status` | text | `pending`, `processing`, `completed`, `failed` |
| `page_count` | int | 선택 |
| `created_at` | timestamptz | 필수 |

## `tts_profiles`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | uuid | PK |
| `name` | text | 예: `또박또박 따라읽기` |
| `voice_name` | text | 예: `en-US-Neural2-F` |
| `speaking_rate` | numeric | 예: `0.90` |
| `style_name` | text | 예: `calm`, `lively` |
| `sentence_pause_level` | text | `short`, `medium`, `long` |
| `preview_sample_text` | text | 부모 미리듣기용 |
| `is_default` | boolean | 시스템 기본 여부 |
| `created_at` | timestamptz | 필수 |

## `parent_settings`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | uuid | PK |
| `default_tts_profile_id` | uuid | FK |
| `default_page_view_mode` | text | `single` or `spread` |
| `preferred_reading_mode` | text | 선택 |
| `created_at` | timestamptz | 필수 |

## `page_text_versions`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | uuid | PK |
| `page_id` | uuid | FK |
| `source_type` | text | `manual`, `bulk_paste`, `ocr_draft` |
| `raw_text` | text | 원본 |
| `normalized_text` | text | 평가용 정규화 |
| `is_current` | boolean | 현재 적용 버전 |
| `created_at` | timestamptz | 필수 |

## `page_tokens`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | uuid | PK |
| `page_id` | uuid | FK |
| `text_version_id` | uuid | FK |
| `token_order` | int | 페이지 내 순서 |
| `display_text` | text | 화면 렌더링 텍스트 |
| `normalized_text` | text | 평가용 정규화 토큰 |
| `sentence_index` | int | 문장 그룹 |

## `page_tts_assets`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | uuid | PK |
| `page_id` | uuid | FK |
| `text_version_id` | uuid | FK |
| `tts_profile_id` | uuid | FK |
| `audio_path` | text | Storage 경로 |
| `duration_ms` | int | 선택 |
| `timing_json` | jsonb | mark/timepoint 데이터 |
| `status` | text | `pending`, `ready`, `failed` |
| `created_at` | timestamptz | 필수 |

## `reading_sessions`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | uuid | PK |
| `book_id` | uuid | FK |
| `started_at` | timestamptz | 필수 |
| `ended_at` | timestamptz | 선택 |
| `status` | text | `active`, `completed`, `abandoned` |

## `reading_attempts`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | uuid | PK |
| `session_id` | uuid | FK |
| `page_id` | uuid | FK |
| `recording_path` | text | 임시 저장 가능 |
| `overall_score` | numeric | 선택 |
| `accuracy_score` | numeric | 선택 |
| `fluency_score` | numeric | 선택 |
| `completeness_score` | numeric | 선택 |
| `prosody_score` | numeric | 선택 |
| `status` | text | `uploaded`, `assessed`, `failed` |
| `created_at` | timestamptz | 필수 |

## `word_assessments`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | uuid | PK |
| `attempt_id` | uuid | FK |
| `token_id` | uuid | FK |
| `result_state` | text | `correct`, `partial`, `missed`, `wrong`, `inserted` |
| `accuracy_score` | numeric | 선택 |
| `error_type` | text | Azure 원본 또는 매핑값 |
| `recognized_text` | text | 선택 |

## Relationships

- `books` 1:N `book_pages`
- `book_pages` 1:N `page_text_versions`
- `book_pages` 1:N `page_tokens`
- `book_pages` 1:N `page_tts_assets`
- `reading_sessions` 1:N `reading_attempts`
- `reading_attempts` 1:N `word_assessments`
- `tts_profiles` 1:N `books`, `book_pages`, `page_tts_assets`, `parent_settings`

## Invariants

- `book_pages.page_number`는 같은 책 안에서 중복되면 안 된다
- `book_pages.confirmed_text`가 없으면 `input_status=ready`가 될 수 없다
- 정식 TTS 자산은 반드시 `text_version_id`와 `tts_profile_id`를 가져야 한다
- 읽기 평가는 반드시 특정 `page_id`와 `text_version_id`에 귀속될 수 있어야 한다
- `reading-recordings`는 장기 보관을 기본 전략으로 삼지 않는다

## Acceptance Criteria

- 한 페이지가 이미지, 확정 텍스트, 토큰, TTS 자산을 모두 연결할 수 있어야 한다
- 부모 기본 프리셋과 책별 override를 모두 표현할 수 있어야 한다
- 페이지별 읽기 평가를 단어 단위 결과까지 저장할 수 있어야 한다
- OCR 없이도 모든 핵심 테이블이 동작 가능해야 한다

## Out Of Scope

- 사용자/권한 다중 테넌시 상세 설계
- 분석 대시보드용 집계 테이블
- OCR 전용 파이프라인 세부 테이블

