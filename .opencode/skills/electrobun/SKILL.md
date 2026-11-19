---
name: electrobun
description: Use the local Electrobun v2 docs snapshot correctly before writing any Electrobun code. Load this skill for desktop/ shell or native-feature work.
---

# Using the local Electrobun docs

Local snapshot: .opencode/memory/electrobun-docs/ (see INDEX.md for the upstream commit hash).

## Reading order

1. Read INDEX.md first. It lists every .mdx page with its path, title and description.
2. Read guides/migrating-to-v2.mdx before anything else that is code-related. Older tutorials and model memory of v1 are likely wrong for this v2.x snapshot.
3. Read only the page(s) you need: apis/<topic>.mdx or guides/<topic>.mdx. Do not bulk-load the docs into context.
4. ONLY tasks explicitly marked "read ALL.md" may load ALL.md in full (Phase 1 spike). Normal sessions must not.

## Rules

- Do not guess Electrobun APIs from memory. If the docs don't cover it, say so and stop.
- The snapshot is a point-in-time copy; prefer it over web searches and older tutorials.
- Electrobun is desktop-only (Win/macOS/Linux); never import it from web/.
