---
name: box-architecture
description: Design and review code as black boxes with a single public interface, injected ports, and composition-root wiring. Use for all new code in this repo.
---

# Box architecture (applies to all new code)

- Every feature is a black box with one public surface: its index.ts (typed interface only).
- Cross-box imports go through index.ts only, never into internals.
- Dependencies are injected via factory params (createX({ ...ports })), not imported ("USB ports").
- Only adapter boxes may import platform libs (electrobun, bun:sqlite).
- Wiring happens only in the composition root (desktop/main.ts, web/app.ts). Boxes never wire themselves.
- Each box has a test using fake ports. A box that can't be tested without its neighbors is wrongly coupled.
- test/boundaries.test.ts enforces the import rules; it must pass with bun test.

## Layout

- Desktop: desktop/boxes/{server-host,window,tray,notify,deeplink,updater,paths}/index.ts + desktop/main.ts (composition root).
- Web: web/platform.ts (interface) + platform.browser.ts + platform.electrobun.ts, chosen by feature detection at boot (mirrors api.ts / api.mock.ts).

## Pre-finish checklist

- What is this box's public interface?
- What ports does it take?
- Does anything import its internals?
- Where is it wired?
- Is there a fake-port test?
