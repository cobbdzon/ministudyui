# AGENTS.md — ministudyui

Read this before exploring. It is a map of the repo so you can go straight to the
file you need instead of re-deriving the architecture each session.

## What this is

A quiet, local-first study app: decks, flashcards, spaced repetition (SRS),
quizzes, attempts, grading, and stats. All data lives in one local SQLite file
(`data/ministudy.db`). It has **three entry points over one shared core**:

| Entry point | File | Role |
| --- | --- | --- |
| HTTP server (Bun) | `src/http/server.ts` | Web UI + JSON API on `127.0.0.1:3000` |
| MCP server (stdio) | `src/mcp/stdio.ts` | Same domain logic exposed as MCP tools |
| Shared core ("boxes") | `src/boxes/*/index.ts` | All business logic + SQLite access |

Both servers are thin adapters that call the **same** box functions. Put domain
logic in a box, never in an HTTP handler or MCP tool registration. (One legacy
exception: `GET /api/attempts/:id` reads `attempts`/`answers` with raw SQL in
`http/app.ts`.)

## Commands (Bun only; Node not required)

```sh
bun install                 # dependencies
bun run seed                # create data/ + migrate schema, NO data (real setup)
bun run seed:demo           # fill with sample decks/cards/quizzes/attempts (no-op if decks exist)
bun run start               # build assets + start HTTP server at http://127.0.0.1:3000
bun run dev                 # watch server + watch/rebuild SCSS
bun run mcp                 # start MCP stdio server (OpenCode normally starts this)
bun test                    # unit/integration tests
bun run typecheck           # tsc --noEmit
bunx sass web/scss:web/css --no-source-map   # one-off CSS build
bun run assets              # render web/og-image.svg -> web/og-image.png
```

MCP server is also wired into this repo via `opencode.json` (`bun src/mcp/stdio.ts`)
and exposed to OpenCode Code Mode as `tools.ministudyui.*`. Prefer those tools
over direct SQL when manipulating study data. For global OpenCode setup
(`~/.config/opencode/opencode.jsonc`), `codemode: false`, and `/mcps` verification,
see README.md.

## Environment

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port; host is fixed to `127.0.0.1`. Used by `http/server.ts` and the host/origin check in `http/app.ts`. Changing it breaks `scripts/smoke.ts`, which hardcodes `http://127.0.0.1:3000`. |
| `DB_PATH` | `<repo>/data/ministudy.db` | Used by the MCP server, `scripts/seed.ts`, and `scripts/seed-demo.ts`; its default resolves relative to the source file, independent of `cwd`. The HTTP server does **not** read it — `src/http/server.ts` always opens `<repo>/data/ministudy.db`. Keep them in sync unless you intend separate stores. |

`.env*` files are gitignored but **nothing loads them** (no dotenv dependency or env-file loading) — use real environment variables; there is no `.env.example`.

## Layout / where to make changes

```
shared/            types.ts (all TS types), schemas.ts (HTTP/import Zod schemas + inferred inputs)
src/boxes/
  store/           SQLite singleton, schema.sql, migrations (user_version 1..4), tx/run/get/all/count
  library/         decks, cards, quizzes, questions, importBundle  ← biggest box
  study/           review queue, review, undo, cardSchedule, stats, deckSummaries
  attempts/        start/restart/answer/submit/gradeAnswer/pending/list
  grader/          gradeAuto (mcq/multi/numeric auto; short/latex -> pending)
  srs/             schedule + preview (SM-2 style intervals)
  context/         current UI context (read/write/current) shared via SQLite
  changefeed/      change log polling + subscribe (SSE backing)
  latex/           validate LaTeX spans with KaTeX
  errors.ts        AppError + asAppError (error codes -> HTTP status)
src/http/
  app.ts           ALL routes (~30) on a Hono app; exports `app` + `AppType`
  server.ts        opens DB, migrates, Bun.serve
  static.ts        serves web/ + shared/ + vendor JS; path-traversal guard; transpiles .ts on the fly
  validate.ts      v() wrapper: zValidator with the app's error envelope
src/mcp/stdio.ts   MCP tool registration (snake_case args -> camelCase box inputs)
web/               browser app, served raw (no bundler); TS transpiled by Bun on request
  app.ts           shell, hash router, theme, shortcuts, live-update batching, boot
  api.ts           the ONLY data interface the UI uses (typed Hono `hc` client + `?mock=1` switch)
  api.mock.ts      in-memory implementation of `Api` for UI work without a server
  context.ts       AppContext / ViewModule / Mount types
  ui.ts, icons.ts, math.ts, messages.ts  shared UI helpers
  import-prompt.ts     IMPORT_PROMPT text copied by the Import view (paste into another AI chat to generate a bundle)
  views/           one module per screen: home, review, deck, quizzes, quiz, attempt, grading, stats, import
  scss/            style sources (tokens, base, components, views, micro-interactions, app)
  css/             GENERATED + gitignored (built from scss)
  katex/, fonts/   vendored assets
scripts/           seed.ts, seed-demo.ts, build-assets.ts, smoke.ts (Playwright screenshots)
test/              bun test suites (see below)
```

## Conventions and gotchas (important)

- **Imports use `.js` extensions** for local TS files (e.g. `import * as store from '../store/index.js'`). tsconfig uses `moduleResolution: "Bundler"`, `strict`, `noEmit`. Shared types import as `../../shared/types.js` from `src/http/*` and `src/mcp/*`, but `../../../shared/types.js` from boxes (`src/boxes/*/index.ts`). **`shared/types.ts` must stay type-only** — web code uses `import type` so Bun erases it; a runtime import would be requested by the no-bundler browser and fail.
- **Naming boundary:** core boxes take **camelCase** params (`confirmName`, `cardId`, `quizId`). HTTP JSON bodies and MCP tool args use **snake_case** (`confirm_name`, `card_id`, `quiz_id`). The adapters map between them — follow this when adding routes/tools.
- **Single DB singleton:** `src/boxes/store/index.ts` holds module-level `db`. Call `store.open(path)` (sets pragmas: WAL, foreign_keys, busy_timeout=5000, synchronous=NORMAL) then `store.migrate()` at startup. Tests call `store.open(':memory:'); store.migrate()` in `beforeEach` (or inline per test in `smoke.test.ts`). On a fresh checkout, run `bun run seed` before `bun run start` **or `bun run mcp`** (neither opens a DB that lacks `data/`; `seed.ts`/`seed-demo.ts` create it), and build CSS once via `bunx sass web/scss:web/css --no-source-map` or use `bun run dev` — `web/css/` is gitignored and `start` builds only brand assets, so otherwise the app loads unstyled.
- **Schema/migrations:** `schema.sql` is the v1 base; incremental migrations are in `store.migrate()` keyed on `PRAGMA user_version` (currently 4). Fresh DBs get later columns/tables from `schema.sql` too, so migrations guard with `IF NOT EXISTS`/column checks. Don't edit applied migration numbers in place — add a new `v < N` block. DB columns are snake_case; timestamps are ISO strings — schema defaults use `strftime('%Y-%m-%dT%H:%M:%fZ','now')`, JS-side writes use `new Date().toISOString()`.
- **DB tables:** `decks`, `cards`, `card_state` (SRS state + `ignored`), `reviews`, `quizzes`, `questions`, `attempts`, `answers`, `ui_context` (single row id=1), `changes`. Triggers auto-create `card_state` on card insert and log changes to `changes` for the SSE feed. `card_state` has no change trigger, so `cardSchedule` touches `cards.updated_at` to emit a feed event.
- **Constraints to remember:** deck names unique (NOCASE); **one quiz per deck** (unique index `idx_quizzes_deck`, enforced in library + migration v2); questions unique per `(quiz_id, position)`; answer unique per `(attempt_id, question_id)`.
- **Errors:** throw `AppError(code, message, field?, hint?)`. Codes: `VALIDATION | NOT_FOUND | CONFLICT | FORBIDDEN | INTERNAL | ERROR`. HTTP maps codes to 400/403/404/409/500 (`STATUS` in `http/app.ts`) and returns `{code, message, field?, hint?}`. MCP wraps the same via `wrap()`/`fail()`.
- **Validation:** HTTP/import request schemas live in `shared/schemas.ts` (Zod v4) and are the source of inferred input types re-exported by `shared/types.ts`. Query params stay strings (`qstr` preprocess) and handlers convert with `Number(...)`. **MCP tool input schemas are declared separately** (duplicated inline in `src/mcp/stdio.ts`) — keep them in sync with the shared ones. Adding a feature usually means: schema → box function → HTTP route → (maybe) MCP tool → `Api` method in `web/api.ts` **and** `web/api.mock.ts` (the mock mirrors `Api`; keep both in sync).
- **Grading:** `mcq`/`multi`/`numeric` are auto-graded (`graded_by='auto'`); `short`/`latex` become `pending` until `answer_grade` grades them — that function always stamps `graded_by='ai'` (the schema's `'manual'` value is never written). Attempt status is `in_progress → submitted → graded` (graded only when no pending answers).
- **SRS:** rating 0..3 = Again/Hard/Good/Easy. `Again` → +10min, ease −0.2, reps=0; new passing card intervals are 1d/3d/7d; later intervals use SM-2 ease formula. `preview()` drives the on-screen rating-button labels. Don't change interval math without updating `test/smoke.test.ts` expectations (`test/schedule.test.ts` covers manual due-time/`ignored` overrides, not interval math).
- **Small behavioral quirks:** `study.undo()` reverts the globally most recent review (not per-card) and deletes that review row. `library.cardAdd()` defaults `source` to `'ai'` when omitted (the MCP `card_add` tool has no source arg), while the DB column default is `'user'`. In HTTP the review queue without a `deck` resolves to deck 0 → empty queue, and an unknown numeric deck id also gives an empty queue, but an unknown deck **name** throws `NOT_FOUND`. Re-answering a question resets it to `pending` without re-running the auto-grader until `submit()`. `attempts.restart()` is destructive: it deletes **all** in-progress attempts for the quiz (with their answers, including pending ones) before starting a new one.
- **Content rendering:** `web/math.ts` is the single point where untrusted text becomes DOM. Markdown via `marked` with **raw HTML escaped**, links restricted to http(s)/mailto, LaTeX protected from Markdown then KaTeX-rendered. Never bypass this sanitizer. `src/boxes/latex/index.ts` validates `$...$`/`$$...$$` server-side.
- **Web app:** no bundler. `index.html` uses an import map for `hono/client` and `marked`, served from `node_modules` by `src/http/static.ts` under `/vendor/...`. Module scripts are `.js` URLs that map to `.ts` files transpiled on request. Hash router (`#/home`, `#/review/:deckId`, `#/deck/:id`, `#/quiz/:id`, `#/attempt/:id`, `#/quizzes`, `#/grading`, `#/stats`); `import` is **not** a route (`RoutedViewId` excludes it) — the Import view opens as a modal via `openImport()` from the shell. Views export `mount(el, ctx)` returning an optional cleanup fn. CSS is generated from `web/scss/` into gitignored `web/css/` — edit SCSS, never the generated CSS. **`web/scss/app.scss` is currently orphaned** — `index.html` doesn't link `/css/app.css`, so editing it has no visual effect (the linked styles are tokens/base/components/views/micro-interactions).
- **Mock mode:** append `?mock=1` to any URL to use `web/api.mock.ts` (in-memory fixtures) instead of the server — useful for UI work/screenshots without a DB. `scripts/smoke.ts` uses this but hardcodes an absolute, single-user Chromium path (`/home/samsepi0l/.cache/ms-playwright/chromium-1254/...`) and writes screenshots to `/tmp/opencode/shots` — edit those before using it elsewhere.
- **UI ↔ MCP bridge:** the web app writes the currently-viewed card/question to the `ui_context` table as you navigate (`api.setUiContext`); other screens clear it with `{view:null}`. MCP `current_context` reads it so an LLM can answer about what's on screen. `GET/PUT /api/ui/context` are the endpoints.
- **Live updates:** SQL triggers write to `changes`; SSE endpoint `/api/events` streams them with a 20s heartbeat comment, while the server runs with `idleTimeout: 255` — keep both in mind when changing long-held connections. `changefeed.subscribe()` polls every 1s and starts its cursor at the current `MAX(id)` (older changes are never delivered to a new stream); the web app batches events into a `live:change` event (550ms) and shows toasts.
- **Security:** HTTP middleware rejects any request whose `Host`/`Origin` isn't `127.0.0.1:<PORT>` or `localhost:<PORT>`; port fixed host bind to `127.0.0.1`. Do not expose to a network. Static server guards against path traversal.

## HTTP routes (in `src/http/app.ts`)

Decks: `GET/POST /api/decks`, `PATCH/DELETE /api/decks/:id` · Cards: `GET/POST /api/cards`, `PATCH /api/cards/:id`, `PATCH /api/cards/:id/schedule`, `DELETE /api/cards` · Review: `GET /api/review/queue`, `POST /api/review`, `POST /api/review/undo` · Quizzes: `GET/POST /api/quizzes`, `GET/DELETE /api/quizzes/:id`, `POST /api/quizzes/:id/questions` · `POST /api/import` · Attempts: `POST /api/attempts`, `POST /api/attempts/restart`, `GET /api/attempts`, `GET /api/attempts/:id`, `PATCH /api/attempts/:id/answers/:qid`, `POST /api/attempts/:id/submit` · Grading: `GET /api/grading/pending`, `POST /api/grading/:id` · `GET /api/stats` · `POST /api/latex/validate` · `GET/PUT /api/ui/context` · `GET /api/events` (SSE). Unmatched paths fall through to static/SPA for **GET/HEAD only**; other methods and unknown `/api/*` get a JSON 404.

## MCP tools (in `src/mcp/stdio.ts`)

`deck_create/list/delete/update`, `card_add/update/schedule/delete/search`,
`quiz_create/add_questions/get/list/update/delete/outline`,
`question_update/delete`, `study_next_due`, `study_stats`, `attempt_list`,
`attempts_pending_grading`, `answer_grade`, `latex_validate`, `current_context`.
Unlike the HTTP review-queue endpoint, `study_next_due` requires a `deck` argument.
All return `{ok:true, ...}` on success or `{code, message, field, hint}` with `isError:true`.

## Tests

- `test/http.test.ts`, `test/context.test.ts`, `test/schedule.test.ts` — `bun:test` style. The `app.request(...)` suites send `Host: 127.0.0.1:3000`; all reset to an in-memory DB per test.
- `test/smoke.test.ts`, `test/markdown.test.ts` — `node:test` style (runs under Bun): SRS intervals, grader, box CRUD/import/delete/conflicts, and markdown/KaTeX rendering + sanitizer behavior.
- Run all with `bun test` (single file: `bun test test/http.test.ts`); typecheck with `bun run typecheck`. Both must pass before finishing a change. No linter/formatter is configured — strict `tsc` + tests are the only automated checks.

## Housekeeping

- Generated/gitignored — don't hand-edit or commit: `web/css/`, `web/og-image.png`, `data/`, `*.db*`, `node_modules/`, `.playwright-mcp/` (browser artifacts/logs), `dist/`. Source of truth: `web/scss/`, `web/*.svg`, `src/boxes/store/schema.sql`.
- `web/messages.json` holds user-facing copy; it is loaded once at page startup and a random time-of-day greeting is picked, so refresh to see edits. Edit there, not in views. `web/favicon.svg` is served as-is; only `web/og-image.svg` is rendered into a generated PNG.
- Keep changes scoped and consistent with surrounding style; when adding a domain feature, wire it through box → HTTP route → MCP tool → `Api` interface/mock, and add tests.

## Electrobun docs
Local docs: .opencode/memory/electrobun-docs/ (snapshot, see INDEX.md for the upstream commit).
Normal sessions: read INDEX.md, then only the page(s) you need. Before writing any Electrobun code,
read the matching apis/<topic>.mdx or guides/<topic>.mdx. Read guides/migrating-to-v2.mdx first:
older tutorials and your memory of v1 are likely wrong.
For the Phase 1 spike (tasks marked "read ALL.md") you may load ALL.md in full.
Do not guess Electrobun APIs from memory. If the docs don't cover it, say so and stop.

## Port architecture (desktop + web)
- web/ is the single UI for both targets. Web is the product, desktop is a thin shell around it (Discord model).
- Desktop = Electrobun: a Bun main process that imports src/boxes and runs the HTTP app in-process (no sidecar). UI renders in the system webview, not Chromium: test on every OS, Linux/WebKitGTK especially.
- Electrobun is desktop-only (Windows/macOS/Linux) and cannot produce a hosted web app. Never import Electrobun from web/. All native access (notifications, tray, deep links, shortcuts) goes through web/platform.ts with a plain-browser fallback, feature-detected at runtime.
- web/api.ts takes a configurable base URL. Local mode: 127.0.0.1 server inside the app, one DB per install in the app's user-data dir. Remote mode: a hosted server.
- Web hosting = deploying src/http/server.ts. Separate, later phase. The app is single-user by design (loopback Host/Origin guard, ui_context single row id=1, global undo(), global change feed, stdio MCP on one local DB). Multi-user needs auth, per-user data, a per-user change feed/context, and MCP over authenticated HTTP. Do not start hosting work until decisions.md says which kind.
- Phase order: 0 prerequisites -> 1 Electrobun spike -> 2 native features -> 3 packaging/signing/updates -> 4 hosting. Tasks live in .opencode/memory/progress.md.
- UI: do not restyle existing views. Follow the web/scss tokens. Design skills (frontend-design, material-3) apply only to NEW desktop-specific UI (first-run screen, settings, title bar). Use the Google web-guidance skill to check every web feature used against Baseline support for WebKitGTK/WKWebView/WebView2 before relying on it.
- UX/route reference for native features (deep links, tray badge, notifications): .opencode/memory/reference/ux-flow.md (read on demand, not auto-loaded).

## AI / MCP bridge (must survive the port)
- Three entry points, one core: src/boxes owns all logic + SQLite; src/http/app.ts and src/mcp/stdio.ts are thin adapters. The desktop shell is a third adapter, not a rewrite.
- The DB is the bus. The web app writes the viewed card/question to the single ui_context row (api.setUiContext); MCP current_context reads it. SQL triggers write `changes`; changefeed.subscribe() polls every 1s; SSE /api/events (20s heartbeat, server idleTimeout 255) feeds the web live:change batching (550ms). Any IPC added by the port must preserve this behavior or replace it deliberately (a decisions.md entry first).
- Web UI and MCP run concurrently on ONE SQLite file (WAL, busy_timeout=5000): keep both pragmas. In desktop local mode the DB lives in the app's user-data dir, and the MCP server's DB_PATH must point at that same file, otherwise tools and UI silently see different data.
- MCP tool schemas in src/mcp/stdio.ts are duplicated from shared/schemas.ts: keep them in sync. AI grading (attempts_pending_grading -> answer_grade) and AI content creation (MCP tools + the copy/paste IMPORT_PROMPT flow, both ending in library.importBundle) are unchanged by the port.
- Remote/hosted mode would need per-user authenticated equivalents of ui_context, the change feed and MCP. That is Phase 4.

## Box architecture (applies to all new code)
- Every feature is a black box with one public surface: its index.ts (typed interface only).
- Cross-box imports go through index.ts only, never into internals.
- Dependencies are injected via factory params (createX({ ...ports })), not imported ("USB ports").
- Only adapter boxes may import platform libs (electrobun, bun:sqlite).
- Wiring happens only in the composition root (desktop/main.ts, web/app.ts). Boxes never wire themselves.
- Each box has a test using fake ports. A box that can't be tested without its neighbors is wrongly coupled.
- test/boundaries.test.ts enforces the import rules; it must pass with bun test.
- Desktop layout: desktop/boxes/{server-host,window,tray,notify,deeplink,updater,paths}/index.ts + desktop/main.ts (composition root).
- Web layout: web/platform.ts (interface) + platform.browser.ts + platform.electrobun.ts, chosen by feature detection at boot (mirrors api.ts / api.mock.ts).

## Memory protocol
- Session start: read .opencode/memory/progress.md (auto-loaded). One task per session.
- Task done = acceptance checks pass, `bun test` and `bun run typecheck` pass (paste real output), progress.md updated.
- Non-obvious choice -> append to decisions.md. Surprising bug/fix -> append to gotchas.md.
- Keep each memory file under ~150 lines; collapse finished phases into one line.
- Decisions marked "Settled" are not revisited. If you disagree, write it under Open questions and stop.

## Desktop (Electrobun) commands
Scaffolded from the official hello-world template (Electrobun 2.0.6 / Hutch 0.29).
Requires the global Hutch CLI (`curl -fsSL https://hutch.blackboard.sh/hutch/install.sh | sh`).
Main process: desktop/main.ts (composition root). Bundled view: desktop/views/mainview/.
- `hutch electrobun prepare`     resolve core + project `.hutch/devkit` SDK (gitignored)
- `hutch run dev`                build, launch and watch the desktop window
- `hutch run build`              host-only release build (--env=stable)
- `hutch electrobun config`      print the normalized build config
Desktop has its own tsconfig (desktop/tsconfig.json) extending .hutch/devkit/tsconfig.json;
root `bun run typecheck` does not cover desktop/. `bun run dev` (web) is unchanged.

### MCP in the packaged desktop app
The desktop build ships a bundled stdio MCP server at `dist/mcp/stdio.js` (plus `schema.sql` beside it).
The running app exposes `GET /api/mcp/config` (requires the per-launch token) which returns the exact
`dbPath`, the bundled script path, and a ready MCP client config using the app's bundled Bun binary
with `DB_PATH` set to that file. Phase 2's "copy MCP config" button will surface this; never hand-write
a config with a different DB path. See decisions.md "Packaged MCP exposure (T14)".
