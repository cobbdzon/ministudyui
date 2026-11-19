# Decisions
## Settled (do not revisit; if you disagree, write it under Open questions and stop)
- Electrobun with a Bun main process, no sidecar. Core stays Bun (src/boxes unchanged).
- Desktop first, in local mode. Hosting deferred to Phase 4.
- All native access only via web/platform.ts (browser fallback required).
- Desktop and platform features are boxes with injected ports; wiring only in the composition root.
- Do not restyle existing views.
- Rationale for deferring hosting: the app is single-user by design (loopback Host/Origin guard, ui_context single row id=1, global undo(), global change feed, stdio MCP on one local DB). Multi-user needs auth, per-user data, per-user feed/context, and MCP over authenticated HTTP.
## Open questions
- Hosted = single-user self-host (behind auth) or multi-user accounts?
- Desktop UI: bundled build vs loading the hosted URL (default: bundled, local mode).
- How does a packaged install expose MCP? `bun src/mcp/stdio.ts` needs Bun + source on the user's machine. Options: ship a bundled bun binary + script path, or add an authenticated local HTTP MCP endpoint. Must keep DB_PATH identical to the app's DB.
