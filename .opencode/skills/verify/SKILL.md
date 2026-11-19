---
name: verify
description: Prove a task is done by running bun test and bun run typecheck and pasting the real output. Use before marking any task complete or committing.
---

# Verify

A task is done only when its acceptance checks pass AND the repo-wide checks pass.

## Required commands

- `bun test`
- `bun run typecheck`

## Rules

- Paste the real output of both commands. Never claim a pass without output.
- Never mark a task done, update progress.md to green, or commit unless both pass.
- If either fails, fix it or report the failure honestly; do not hide or summarize away errors.
- This is a Bun-only repo: do not substitute Node commands or a linter that isn't configured.
- No linter/formatter is configured; strict tsc + tests are the only automated checks.
