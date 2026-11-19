---
name: webview-security
description: Security checklist for the Electrobun webview shell — origin lock, RPC surface, API token, external links, and untrusted text. Use for desktop shell and native-feature work.
---

# Webview security checklist

Apply to the desktop shell (Phase 1 T12 baseline and every native feature).

- Navigation locked to our origin: the webview may only load our own origin. No arbitrary navigation.
- No remote content with native RPC access: never grant RPC to remotely loaded pages. Local/bundled content only.
- Per-launch API token on API requests: generate a token per launch and require it on every API request from the webview.
- Minimal RPC surface validated in main: expose the smallest possible set of handlers, validate all arguments in the main process, never trust the renderer.
- External links open in the system browser: intercept anchor clicks and hand off to the OS browser; never navigate the webview to them.
- Never bypass web/math.ts for untrusted text: it is the single untrusted-text -> DOM boundary (Markdown with raw HTML escaped, links restricted to http(s)/mailto, LaTeX rendered via KaTeX). Do not render user content any other way.
- Keep the loopback Host/Origin guard and WAL/busy_timeout pragmas intact; do not loosen them.

If a change would weaken any of these, stop and raise it rather than proceeding.
