# CLAUD.md

## Purpose

This is the quick-entry document for contributors and AI agents.
Use it to understand the current product direction, then follow `/doc` for implementation details.

## Product Summary

Kids Echo Reading is a tablet-first PWA for child echo reading.

- Parent/admin registers books and page images.
- Parent/admin writes and confirms page text.
- AI reads the page with pre-generated TTS audio.
- Child records reading and receives pronunciation feedback.

## Current Stack

- Frontend: `Next.js + TypeScript`
- Deployment: `Vercel`
- Database and file storage: `Supabase`
- TTS: `Microsoft Edge Read Aloud` via `node-edge-tts` (page-level generation)
- Pronunciation assessment: `Azure Speech Pronunciation Assessment`
- OCR: not in current MVP flow

## Core Flow Rules (Authoritative)

1. Text lifecycle per page
- Empty text -> `input_status=empty`
- Temporary save -> `input_status=draft`
- Confirm -> `input_status=ready`

2. TTS generation gate
- TTS generation is allowed only when:
  - `book_pages.input_status = ready`
  - `book_pages.confirmed_text` is non-empty

3. TTS asset replacement
- New TTS generation creates a new ready asset first.
- Previous ready assets for the same page are demoted/removed.
- Goal: one active `ready` TTS asset per page.

4. Provider policy
- Provider selection is env-driven via `TTS_PROVIDER`.
- Allowed provider values: `edge`, `google`, `azure`.
- Current runtime implementation is `edge` only.

## Read Order

1. `/doc/INDEX.md`
2. `/doc/architecture.md`
3. `/doc/process-flows.md`
4. `/doc/data-model.md`
5. `/doc/deployment.md`

## Working Rules

- If implementation and docs conflict, align code to docs or update docs together.
- Check MVP scope first before adding new behavior.
- Never add ad-hoc DB states or storage paths without document updates.
- Update `/doc` immediately when changing critical architecture or state transitions.

## Git Ops Rule

- Standard flow: `git add -A` -> `git commit -m "..."` -> `git push origin <branch>`.
- If commit/push fails with lock/permission errors (for example `.git/index.lock: Permission denied`), retry with elevated permission in the agent runtime.
- Warnings about global git ignore access (for example `unable to access .../.config/git/ignore`) are non-blocking unless commit/push exits with failure.
- Reference: `./doc/git-operations.md` and `./.codex/skills/git-commit-push/SKILL.md`.

## UI Source Of Truth

- `./doc/ui/child-reading-cx-spec.md`
- `./doc/ui/child-reading-state-machine.md`
- `./doc/ui/child-reading-decision-log.md`

When UI behavior conflicts with code, align implementation to these UI docs first and update related docs together.
