---
name: platform-adapter
description: Add native features behind web/platform.ts with a browser fallback and runtime feature detection. Use for tray, notifications, deep links, shortcuts, and other native access.
---

# Platform adapter

All native access goes through web/platform.ts. Never import electrobun (or any platform lib) from web/.

## Order of work

1. Interface first: define the method on the web/platform.ts interface.
2. Browser fallback: every method gets a plain-browser implementation that degrades safely (no-op or sensible default).
3. Runtime feature detection: choose the implementation at boot; do not branch on compile-time assumptions.
4. Mirror the existing pattern: web/platform.ts (interface) + platform.browser.ts + platform.electrobun.ts, chosen by feature detection at boot — the same shape as api.ts / api.mock.ts.

## Rules

- No Electrobun imports anywhere under web/.
- Only adapter boxes may import platform libs (electrobun, bun:sqlite).
- The desktop implementation is a box under desktop/boxes/... with injected ports; wiring happens only in the composition root (desktop/main.ts).
- Update both web/api.ts and web/api.mock.ts together whenever the shared surface changes (keep them in sync).
- Test with fake ports; a box that can't be tested without neighbors is wrongly coupled.
