---
name: commit-style
description: Match this repo's commit style — short lowercase imperative subjects, optional (feat)/(fix) prefix, no body or trailers. Use before every commit.
---

# Commit style

Verified from `git log main -n 40`:

- Short, lowercase, imperative, one-line subjects.
- Optional parenthetical prefix: (feat), (fix), or (feat/fix).
- No Conventional-Commit colon, no scope, no emoji, no body, no trailers, no Co-Authored-By.

Real examples from main:

- (feat) add shuffle questions for every attempt for quizzes
- (fix) show undo last button before card answer reveal
- add AGENTS.md

## Rules

- Match this style exactly for every commit.
- No body, no trailers.
- One task per commit.
- Stage explicit paths — never `git add -A` or `git add .`.
- Never commit to main; work on a task branch.
