# Git Operations

## Purpose

Define the standard commit/push flow and permission-error recovery steps.
This is the source of truth for git operation handling in this repository.

## Scope

Included:

- Standard commit and push sequence
- Permission/lock error diagnosis
- Recovery steps for agent runtime environments

Excluded:

- Branch strategy policy
- PR review policy

## Standard Flow

1. Check changes:
   - `git status --short`
2. Stage:
   - `git add -A`
3. Commit:
   - `git commit -m "<message>"`
4. Push:
   - `git push origin <current-branch>`

## Permission Error Recovery

Target errors:

- `fatal: Unable to create '.git/index.lock': Permission denied`
- Push denied due runtime permission boundary

Recovery sequence:

1. Confirm active branch:
   - `git branch --show-current`
2. Retry failed command with elevated permission in agent runtime.
3. If `.git/index.lock` exists after a failed attempt, verify no running git process, then remove stale lock:
   - `Remove-Item -LiteralPath .git/index.lock -Force`
4. Re-run commit/push.

Notes:

- Warning-only messages such as `unable to access .../.config/git/ignore` do not require recovery if command exit code is success.
- Do not use destructive git reset commands for permission recovery.

## Invariants

- Commit and push must finish with success exit codes.
- Permission failures must be handled by retry/elevation first, not by reverting unrelated changes.
- Recovery must not delete tracked content except stale lock file when confirmed.

## Acceptance Criteria

- Contributors can follow one documented flow for commit/push.
- Repeated index lock permission failures have explicit recovery steps.
- The same rule is reflected in `CLAUD.md` and repo skill docs.

## Out Of Scope

- Interactive rebase workflow
- Force-push policy design
