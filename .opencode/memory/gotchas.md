# Gotchas
- scripts/smoke.ts hardcodes an absolute Chromium path and /tmp/opencode/shots: edit before use.
- web/scss/app.scss is orphaned (not linked by index.html).
- web/css/ is generated and gitignored: build SCSS once on a fresh checkout or the app is unstyled.
- src/http/server.ts ignores DB_PATH (fixed by T1); MCP and seed scripts honor it. Keep them in sync.
- Electrobun docs on the web and old tutorials may describe v1: this repo's snapshot is v2.x. See guides/migrating-to-v2.mdx.
- study.undo() is global (reverts the most recent review of any card); a single-user assumption.
- changefeed.subscribe() starts at current MAX(id): a new SSE stream never replays older changes.
