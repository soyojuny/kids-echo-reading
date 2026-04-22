# Supabase Setup Guide

## Purpose

이 문서는 프로젝트를 실제 Supabase와 연결하기 위해, 사용자(운영자/개발자)가 직접 수행해야 하는 작업을 단계별로 정리한다.

## Scope

포함:

- Supabase 프로젝트 생성
- Storage 버킷 생성
- Phase 2 기준 핵심 테이블 생성
- 로컬/Vercel 환경변수 설정

제외:

- RLS 상세 정책 설계
- 운영 모니터링/백업 전략 상세

## User Task Checklist

아래 항목은 사용자가 직접 수행해야 한다.

1. Supabase 프로젝트 생성
2. API 키/URL 확인
3. Storage 버킷 생성
4. DB 테이블 생성(SQL 실행)
5. 로컬 `.env.local` 설정
6. Vercel 환경변수 설정
7. 앱 검증(`npm run verify`)

## Step 1. Create Supabase Project

1. Supabase 대시보드에서 새 프로젝트 생성
2. Region 선택(가까운 리전 권장)
3. 프로젝트 생성 완료 후 `Project URL`, `anon key`, `service_role key` 확인

필수 값:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Step 2. Create Storage Buckets

Supabase SQL Editor에서 실행:

```sql
insert into storage.buckets (id, name, public)
values
  ('book-pages', 'book-pages', false),
  ('book-imports', 'book-imports', false),
  ('book-audio', 'book-audio', false),
  ('reading-recordings', 'reading-recordings', false),
  ('book-covers', 'book-covers', false)
on conflict (id) do nothing;
```

## Step 3. Create Core Tables (Phase 2 + Next Steps Ready)

Supabase SQL Editor에서 실행:

```sql
create extension if not exists pgcrypto;

create table if not exists public.tts_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  voice_name text not null,
  speaking_rate numeric not null default 0.90,
  style_name text,
  sentence_pause_level text not null default 'medium',
  preview_sample_text text,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.parent_settings (
  id uuid primary key default gen_random_uuid(),
  default_tts_profile_id uuid references public.tts_profiles(id),
  default_page_view_mode text not null default 'single' check (default_page_view_mode in ('single','spread')),
  preferred_reading_mode text,
  created_at timestamptz not null default now()
);

create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  author text,
  category text not null default 'daily' check (category in ('animal','adventure','daily','science','emotion')),
  reading_level int not null default 1 check (reading_level between 1 and 3),
  cover_path text,
  default_tts_profile_id uuid references public.tts_profiles(id),
  page_view_mode text not null default 'single' check (page_view_mode in ('single','spread')),
  status text not null default 'draft' check (status in ('draft','ready','archived')),
  created_at timestamptz not null default now()
);

create table if not exists public.book_pages (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  page_number int not null check (page_number > 0),
  image_path text not null,
  input_status text not null default 'empty' check (input_status in ('empty','draft','ready')),
  confirmed_text text,
  tts_profile_override_id uuid references public.tts_profiles(id),
  created_at timestamptz not null default now(),
  unique (book_id, page_number)
);

create table if not exists public.book_import_jobs (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  mode text not null check (mode in ('bulk_upload','bulk_text_paste','manual_page_edit')),
  status text not null default 'pending' check (status in ('pending','processing','completed','failed')),
  page_count int,
  created_at timestamptz not null default now()
);

create table if not exists public.page_text_versions (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.book_pages(id) on delete cascade,
  source_type text not null check (source_type in ('manual','bulk_paste','ocr_draft')),
  raw_text text not null,
  normalized_text text,
  is_current boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.page_tokens (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.book_pages(id) on delete cascade,
  text_version_id uuid not null references public.page_text_versions(id) on delete cascade,
  token_order int not null check (token_order >= 0),
  display_text text not null,
  normalized_text text,
  sentence_index int not null default 0
);

create table if not exists public.page_tts_assets (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.book_pages(id) on delete cascade,
  text_version_id uuid not null references public.page_text_versions(id) on delete cascade,
  tts_profile_id uuid not null references public.tts_profiles(id),
  audio_path text not null,
  duration_ms int,
  timing_json jsonb,
  status text not null default 'pending' check (status in ('pending','ready','failed')),
  created_at timestamptz not null default now()
);

create table if not exists public.reading_sessions (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  status text not null default 'active' check (status in ('active','completed','abandoned'))
);

create table if not exists public.reading_attempts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.reading_sessions(id) on delete cascade,
  page_id uuid not null references public.book_pages(id) on delete cascade,
  recording_path text,
  overall_score numeric,
  accuracy_score numeric,
  fluency_score numeric,
  completeness_score numeric,
  prosody_score numeric,
  status text not null default 'uploaded' check (status in ('uploaded','assessed','failed')),
  created_at timestamptz not null default now()
);

create table if not exists public.word_assessments (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.reading_attempts(id) on delete cascade,
  token_id uuid references public.page_tokens(id) on delete set null,
  result_state text not null check (result_state in ('correct','partial','missed','wrong','inserted')),
  accuracy_score numeric,
  error_type text,
  recognized_text text
);

create index if not exists idx_book_pages_book_id on public.book_pages(book_id);
create index if not exists idx_books_category on public.books(category);
create index if not exists idx_books_reading_level on public.books(reading_level);
create index if not exists idx_page_text_versions_page_id on public.page_text_versions(page_id);
create index if not exists idx_page_tts_assets_page_id on public.page_tts_assets(page_id);
create index if not exists idx_reading_attempts_session_id on public.reading_attempts(session_id);
create index if not exists idx_word_assessments_attempt_id on public.word_assessments(attempt_id);
```

이미 `books` 테이블을 운영 중인 프로젝트는 아래 마이그레이션 SQL을 추가로 실행:

- `supabase/migrations/20260422_add_books_catalog_fields.sql`

## Step 4. Configure Local Environment

프로젝트 루트에서 `.env.local` 파일 작성:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
GOOGLE_CLOUD_PROJECT_ID=
GOOGLE_CLOUD_CLIENT_EMAIL=
GOOGLE_CLOUD_PRIVATE_KEY=
AZURE_SPEECH_KEY=
AZURE_SPEECH_REGION=
```

주의:

- `SUPABASE_SERVICE_ROLE_KEY`는 서버 전용이다
- `NEXT_PUBLIC_*` 값만 클라이언트 노출 가능하다

## Step 5. Configure Vercel Environment Variables

Vercel 프로젝트 Settings > Environment Variables에 동일 키 이름으로 등록한다.

- Preview/Production 모두 등록 권장
- 로컬과 키 이름은 반드시 동일하게 유지

## Step 6. Verification

아래 명령을 순서대로 실행:

1. `npm run typecheck`
2. `npm run build`

또는:

- `npm run verify`

## Invariants

- Supabase 연결 정보는 문서에 정의한 키 이름을 그대로 사용한다.
- Storage 버킷 이름은 `doc/data-model.md`와 동일해야 한다.
- 스키마/상태값은 `doc/data-model.md`와 불일치하면 안 된다.

## Acceptance Criteria

- 로컬에서 `typecheck`와 `build`가 통과한다.
- Supabase에 핵심 버킷과 테이블이 생성되어 있다.
- 앱에서 환경변수 누락 오류 없이 실행된다.

## Out Of Scope

- RLS 완성 정책
- 운영 데이터 마이그레이션 전략
