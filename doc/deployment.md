# Deployment

## Purpose

Define deployment/runtime boundaries and required environment configuration.
This document is the source of truth for production parity.

## Scope

Included:

- Vercel runtime
- Supabase connectivity
- Edge TTS runtime requirements
- Azure assessment runtime requirements

Excluded:

- Cost management policy
- Full observability playbook

## Deployment Targets

### App Hosting

- Platform: `Vercel`
- Runtime: `Next.js` Node runtime for server APIs

### Database and Storage

- Platform: `Supabase`
- Services: `Postgres`, `Storage`

### External Services

- `node-edge-tts` runtime synthesis
- `Azure Speech Pronunciation Assessment`

## Runtime Boundaries

### Browser

- UI rendering and interactions
- Audio playback and recording capture
- PWA cache usage

### Server

- Supabase DB/Storage operations
- TTS synthesis orchestration and upload
- Assessment orchestration
- Secret/env access

## Environment Variables

Required:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TTS_PROVIDER` (`edge` | `google` | `azure`)
- `EDGE_TTS_OUTPUT_FORMAT` (optional)
- `EDGE_TTS_TIMEOUT_MS` (optional)
- `EDGE_TTS_HARD_TIMEOUT_MS` (optional)
- `AZURE_SPEECH_KEY`
- `AZURE_SPEECH_REGION`

Notes:

- Client code must never access server-only secrets.
- Current runtime implementation supports `edge` only.
- Configuring `google` or `azure` currently returns a clear not-implemented runtime error.

## PWA Rules

- Installable PWA behavior must remain valid.
- Reader-critical assets should be pre-cached where appropriate.
- TTS audio uses cache-first strategy.
- Assessment responses remain network-first.

## Asset Strategy

- Page images: `book-pages`
- Generated page TTS audio: `book-audio`
- Reading recordings: `reading-recordings`

## Deployment Flow

1. Deploy app on Vercel.
2. Inject environment variables.
3. Verify Supabase connectivity.
4. Verify admin authoring and TTS generation.
5. Verify reader assessment flow.

## Operational Rules

- TTS generation runs only after page text is confirmed.
- Re-generation replaces previous ready TTS assets for the page.
- Recording files are not stored as long-term archive by default.
- OCR is not required for deployment readiness.

## Invariants

- Runtime/provider policy must match architecture docs.
- Storage bucket names must match `doc/data-model.md`.
- Runtime misconfiguration should return actionable API errors.

## Acceptance Criteria

- Production deployment supports admin authoring -> TTS generation -> reader playback -> assessment.
- No server secret leaks to client bundles.
- PWA install and core caching behavior works.

## Out Of Scope

- Multi-region failover
- Full incident-response runbooks
