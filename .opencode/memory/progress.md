# Progress
Goal: desktop app (Win/macOS/Linux) via Electrobun wrapping the existing server; web UI shared; local-first kept.
Task format: Files / Done when / Don't. One task per session. Commit per green task.

## Phase 0: prerequisites
- [x] T0: write test/boundaries.test.ts (fails on deep cross-box imports, on `electrobun` imported outside desktop/, and on Electrobun imports from web/). Done when: bun test + typecheck pass and a deliberately bad import makes it fail (revert the bad import).
- [ ] T1: src/http/server.ts honors DB_PATH (same default as MCP/seed). Files: src/http/server.ts only. Done when: starting with DB_PATH=/tmp/x.db creates that file and not data/ministudy.db; tests pass. Don't: touch boxes/.
- [ ] T2: PORT and allowed Host/Origin set configurable at runtime (programmatic start function, not only env). Files: src/http/*. Done when: tests pass, a non-3000 port works, scripts/smoke.ts untouched. Don't: loosen the loopback guard.
- [ ] T3: production build of web/ (bundle TS + vendor deps, compile SCSS) into a gitignored dist dir; server can serve it. Done when: `bun run build:web` output loads in a browser with no node_modules. Don't: change dev flow (bun run dev unchanged).
- [ ] T4: web/api.ts accepts a configurable base URL (default same-origin). Files: web/api.ts, web/api.mock.ts if needed. Done when: tests pass, ?mock=1 still works.
## Phase 1: Electrobun spike (read ALL.md allowed)
- [ ] T10: scaffold desktop/ from the official template, window opens a blank page; document commands in AGENTS.md.
- [ ] T11: desktop/boxes/paths + server-host: start the HTTP app in-process on a free port, DB in user-data dir. Done when: window shows the real app with data persisting across restarts.
- [ ] T12: security baseline: navigation locked to our origin, no remote content with native RPC access, per-launch API token, minimal RPC surface.
- [ ] T13: packaged build runs on this OS and one other (record findings in gotchas.md, especially Linux WebKitGTK rendering).
- [ ] T14: decide and implement how a packaged install exposes MCP on the same DB (see Open questions in decisions.md); write the decision first, then the task breakdown.
## Phase 2: native features (each a box + platform.ts method + browser fallback)
- [ ] tray + due-count badge, notifications, deep links (ministudy://review/3 sets the hash route), global shortcut, "copy MCP config" button.
## Phase 3: packaging, code signing/notarization, auto-update (read guides/code-signing.mdx, apis/updater.mdx first)
## Phase 4: hosting (blocked on the Open question in decisions.md)
