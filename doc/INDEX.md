# Document Index

## Purpose

This index is the source-of-truth map for implementation docs.
All architecture, data, and deployment changes must be reflected here.

## Source Of Truth

- Product scope and phase plan: [`../plan.md`](../plan.md)
- Quick contributor guide: [`../CLAUD.md`](../CLAUD.md)
- System architecture: [`architecture.md`](./architecture.md)
- Process and state flows: [`process-flows.md`](./process-flows.md)
- Data model and invariants: [`data-model.md`](./data-model.md)
- Deployment and runtime policy: [`deployment.md`](./deployment.md)
- Project structure conventions: [`project-structure.md`](./project-structure.md)
- Development workflow: [`development-workflow.md`](./development-workflow.md)
- Supabase setup: [`supabase-setup-guide.md`](./supabase-setup-guide.md)

## Reading Guide

### Build a feature
1. `architecture.md`
2. `process-flows.md`
3. `data-model.md`
4. `project-structure.md`
5. `deployment.md`

### Change DB or API contracts
1. `data-model.md`
2. `architecture.md`
3. `project-structure.md`

### Change deployment/runtime behavior
1. `deployment.md`
2. `architecture.md`
3. `supabase-setup-guide.md`

## Project Invariants

- Manual text input/confirmation is the current content-authoring baseline.
- TTS generation is page-level and pre-generated (not streaming-first).
- TTS generation is only allowed when page text is confirmed (`input_status=ready`).
- TTS provider selection is env-driven via `TTS_PROVIDER` (`edge|google|azure`), with current runtime implementation on `edge`.
- Pronunciation assessment uses Azure.
- Primary persistence is Supabase Postgres + Supabase Storage.
- Deployment baseline is Vercel.

## Required Doc Sections

Every core document should include:

- `Purpose`
- `Scope`
- `Invariants`
- `Acceptance Criteria`
- `Out Of Scope`

## Change Policy

- If architecture changes, update `architecture.md`.
- If table/state/storage changes, update `data-model.md`.
- If env/runtime/deployment changes, update `deployment.md`.
- If product direction changes, update `plan.md` and `CLAUD.md`.

## UI Docs

- Child reading UX baseline: [`ui/child-reading-cx-spec.md`](./ui/child-reading-cx-spec.md)
- Reading state transitions: [`ui/child-reading-state-machine.md`](./ui/child-reading-state-machine.md)
- UX decision history: [`ui/child-reading-decision-log.md`](./ui/child-reading-decision-log.md)
