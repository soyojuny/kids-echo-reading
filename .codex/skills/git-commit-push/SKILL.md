# Git Commit Push Skill

## Use When

- User asks: "commit and push"
- Git commit/push fails with permission or lock errors

## Goal

Complete staging, commit, and push safely with a deterministic recovery path.

## Procedure

1. Inspect state
- `git status --short`
- `git branch --show-current`

2. Stage all intended changes
- `git add -A`

3. Commit
- `git commit -m "<message>"`

4. Push
- `git push origin <branch>`

## Recovery Rules

If commit or push fails with permission boundary or index lock:

1. Retry command with elevated permission in the agent runtime.
2. If `.git/index.lock` remains, ensure no active git process then remove stale lock:
- `Remove-Item -LiteralPath .git/index.lock -Force`
3. Retry failed command.

## Safety Rules

- Never run `git reset --hard` for permission recovery.
- Never revert unrelated user changes.
- Treat `unable to access .../.config/git/ignore` warnings as non-blocking when exit code is success.
