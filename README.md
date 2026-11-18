# ministudyui

A quiet, local-first study app for decks, spaced repetition (SRS), quizzes,
attempts, grading, and stats. It ships three entry points:

- **Web UI + HTTP API** (`src/http/server.ts`) — Bun HTTP server on
  `127.0.0.1:3000`.
- **MCP server** (`src/mcp/stdio.ts`) — stdio transport exposing the same
  library as MCP tools.
- **Shared core** (`src/boxes/*`) — decks, cards, SRS, quizzes, attempts,
  grading, stats, LaTeX validation.

All data lives in a local SQLite database (`data/ministudy.db`).

## Prerequisites

- [Bun](https://bun.sh) `>= 1.0` (`bun --version`)
- Node is not required; Sass is installed as a dev dependency.

## Install

```sh
bun install
bun run seed
```

`data/` is gitignored. `bun run seed` creates it and migrates the SQLite schema
without adding any data — use this for a real/initial setup. It only creates
what's missing, so it's safe to run on every boot and won't touch existing data.

For local exploration, `bun run seed:demo` fills the database with sample decks,
cards (with review history), quizzes, and attempts. It skips a database that
already has decks, so re-running it is harmless.

## Run the web app

```sh
bun run start
# -> ministudyui http://127.0.0.1:3000
```

Open <http://127.0.0.1:3000> in a browser.

For live reload while editing:

```sh
bun run dev   # server --watch + sass --watch
```

### Styles (SCSS)

`web/css/` is generated and gitignored. It is produced from `web/scss/`.
`bun run dev` watches and rebuilds it. To build once without watching:

```sh
bunx sass web/scss:web/css --no-source-map
```

Or keep it watching in another terminal:

```sh
bun run sass
```

### Brand assets

`web/favicon.svg` and `web/og-image.svg` are the source marks. `bun run assets`
renders `og-image.svg` to `web/og-image.png` (generated and gitignored). It runs
automatically as part of `bun run start` and `bun run dev`, so there's no separate
step on a fresh checkout.

### Messages

User-facing copy lives in `web/messages.json`, loaded once when the page starts.
The home-page greeting picks a random line from the lists under `greeting`,
depending on the time of day. Add, remove, or rewrite lines to change the
wording. Restart the server (or refresh the page) to pick up changes.

### Content formatting

Deck descriptions, card fronts/backs, quiz descriptions, question prompts,
choices, explanations, and graded answers all render Markdown — headings,
lists, emphasis, code, blockquotes, links, and tables. LaTeX still works
alongside it with `$...$` and `$$...$$`; math is protected from the Markdown
parser, and KaTeX renders the result. Raw HTML is escaped and link targets are
restricted to http(s) and mailto.

### Environment

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port. Host is fixed to `127.0.0.1`. |
| `DB_PATH` | `<repo>/data/ministudy.db` | Used by the MCP server (see below). |

The HTTP server always binds to localhost for security; do not expose it
directly to a network.

## Tests and typecheck

```sh
bun test          # unit tests (node:test via Bun)
bun run typecheck # tsc --noEmit
```

## Run the MCP server

```sh
bun run mcp
```

The server speaks MCP over stdio and stores data in the same SQLite file
(default `data/ministudy.db`, overridable with `DB_PATH`). It exposes tools
such as `deck_create`, `deck_list`, `deck_update`, `card_add`,
`card_search`, `quiz_create`, `study_next_due`, `study_stats`, `attempt_list`,
`attempts_pending_grading`, `answer_grade`, `latex_validate`, and
`current_context`.

`current_context` reports the card or quiz question currently on screen in the
web UI, with its full content and answer (and the user's saved answer for a
quiz question). The web app writes this to a single shared SQLite row as you
review or move between questions, and clears it on other screens — both
processes use the same database file, so an LLM can ask about what you are
looking at without any extra bridge.

## Running with OpenCode

OpenCode connects to this repository's MCP server as a **local (stdio)**
server. Run OpenCode from the repository root (or set an absolute `cwd`).

### Option 1: CLI (already configured)

```sh
opencode mcp add ministudyui -- bun src/mcp/stdio.ts
opencode mcp list   # shows: ministudyui  connected
```

This has been added to your global OpenCode config
(`~/.config/opencode/opencode.jsonc`), so the server connects automatically.

### Option 2: manual configuration

If you need to add it to another project config (`opencode.jsonc` or
`.opencode/opencode.jsonc`) or your global config:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "servers": {
      "ministudyui": {
        "type": "local",
        "command": ["bun", "src/mcp/stdio.ts"],
        "cwd": "."
      }
    }
  }
}
```

If you configure it globally, use an absolute `cwd` (and/or absolute command
path) so the server starts regardless of the working directory:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "servers": {
      "ministudyui": {
        "type": "local",
        "command": ["bun", "/absolute/path/to/ministudyui/src/mcp/stdio.ts"],
        "cwd": "/absolute/path/to/ministudyui"
      }
    }
  }
}
```

To use a non-default database, pass `DB_PATH` through `environment`:

```jsonc
{
  "type": "local",
  "command": ["bun", "src/mcp/stdio.ts"],
  "cwd": ".",
  "environment": {
    "DB_PATH": "/path/to/ministudy.db"
  }
}
```

Notes:

- The default `DB_PATH` resolves relative to the source file, so the database
  is `<repo>/data/ministudy.db` even when `cwd` differs.
- Make sure the `data/` directory exists before starting (`mkdir -p data`).
- MCP tools are exposed through OpenCode's Code Mode by default (grouped under
  `tools.ministudyui.*`). Set `"codemode": false` on the server entry if you
  need them on the provider's native tool list.
- Verify the connection in the TUI with `/mcps`, or via `opencode mcp list`.

### Web UI vs. MCP

The web UI and the MCP server share the same SQLite database. You can run both
at once (`bun run start` + the MCP server started by OpenCode); SQLite is
opened in WAL mode with a busy timeout to tolerate concurrent access. Avoid
pointing them at different `DB_PATH` values unless you intend separate stores.