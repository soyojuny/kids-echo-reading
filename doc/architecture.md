# Architecture

## Purpose

Define major components, responsibilities, and end-to-end flow contracts.
Implementation must follow these boundaries and rules.

## Scope

Included:

- Admin authoring flow (page text draft/confirm)
- Page-level TTS generation and replacement lifecycle
- Reader playback and highlight flow
- Pronunciation assessment integration
- PWA/tablet delivery constraints

Excluded:

- OCR automation details
- Parent analytics dashboards
- Gamification layers

## System Overview

### Client (Next.js PWA)

Responsibilities:

- Admin UI for book/page authoring
- Reader UI for playback/highlight/recording
- Local interaction and rendering

### Application Server (Node runtime)

Responsibilities:

- API orchestration
- Supabase data and storage integration
- TTS generation orchestration
- Assessment orchestration

### Data Layer

- `Supabase Postgres` for relational state
- `Supabase Storage` for images/audio/recordings

### External AI Services

- Edge TTS (`node-edge-tts`) for page audio + timing metadata
- Azure Pronunciation Assessment for reading evaluation

## Primary Flows

## 1. Admin Text Authoring

1. Admin uploads page images.
2. Admin edits page text.
3. Admin saves temporary text (`input_status=draft`) or confirms text (`input_status=ready`).
4. System writes a new `page_text_versions` current row when text is saved.

## 2. Page TTS Generation

1. Generation request is accepted only if:
   - `input_status=ready`
   - `confirmed_text` is non-empty
2. System resolves TTS profile (request override -> page override -> book default -> parent default).
3. System synthesizes Edge TTS for full page text.
4. System uploads audio to `book-audio`.
5. System inserts `page_tts_assets(status=ready)` with timing metadata.
6. System removes prior ready assets for that page to keep one active ready asset.

## 3. Reader Playback Session

1. Reader opens page.
2. System loads page image/text and latest ready TTS asset.
3. Reader plays saved audio.
4. UI highlights text using stored word timing metadata.
5. Child records reading.
6. Recording is uploaded for assessment.

## 4. Pronunciation Assessment

1. Server reads confirmed text/current token context.
2. Server calls Azure assessment.
3. Server maps output to internal word states.
4. Server stores `reading_attempts` and `word_assessments`.

## Runtime Rules

- Provider selection is env-driven via `TTS_PROVIDER`.
- Allowed provider values: `edge`, `google`, `azure`.
- Current runtime implementation is `edge` only.

## Invariants

- Unconfirmed page text cannot generate TTS.
- TTS asset must always reference `text_version_id` and `tts_profile_id`.
- A page should have one active `ready` TTS asset at a time.
- Reader playback only uses `ready` assets.
- Highlight timing and audio are derived from the same generated TTS asset.

## Acceptance Criteria

- Admin can complete authoring up to confirmed text and successful page TTS generation.
- Reader can load and play page audio with text highlight from stored timings.
- Re-generating TTS replaces prior ready asset for the same page.
- Runtime/config errors surface actionable API errors.

## Out Of Scope

- OCR as mandatory ingestion path
- Real-time streaming TTS baseline
- Browser-native STT as assessment engine
