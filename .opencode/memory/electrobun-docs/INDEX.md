Snapshot of blackboardsh/electrobun docs @ 579d070, Thu Nov 19 2026
apis/app.mdx — App — Application runtime helpers, including the shared persistent install ID.
apis/application-icons.mdx — Application Icons — Configure packaged application icons on macOS, Windows, and Linux.
apis/application-menu.mdx — Application Menu — Configure the native application menu and handle custom actions.
apis/browser-view.mdx — BrowserView — Create, attach, navigate, and communicate with native webviews.
apis/browser-window.mdx — BrowserWindow — Create and control native Electrobun windows.
apis/browser/draggable-regions.mdx — Draggable Regions — Move a frameless native window by dragging designated web content.
apis/browser/electrobun-webview-tag.mdx — Electrobun Webview Tag — Embed an isolated native BrowserView inside an Electrobun page.
apis/browser/electrobun-wgpu-tag.mdx — Electrobun WGPU Tag — Place a native WGPU surface inside a webview layout.
apis/browser/electroview-class.mdx — Electroview — Connect a browser view to Electrobun's typed RPC transport.
apis/browser/global-properties.mdx — Global Properties — Public values injected into every Electrobun webview preload.
apis/build-config.mdx — BuildConfig — Read packaged build and runtime metadata in the main process.
apis/bun.mdx — Bun SDK Alias — Compatibility guidance for the deprecated electrobun/bun import path.
apis/bundled-assets.mdx — Local Webview Assets — Load bundled and app-owned files through views:// and appdata://.
apis/bundling-cef.mdx — Bundling CEF — Ship Chromium Embedded Framework as an Electrobun renderer.
apis/cli/build-configuration.mdx — Build Configuration — Reference for electrobun.config.ts and Hutch's build lifecycle.
apis/cli/cli-args.mdx — Hutch Commands — Command reference for building and running Electrobun applications with Hutch.
apis/context-menu.mdx — Context Menu — Show a native context menu and handle its actions.
apis/events.mdx — Events — Listen to application, window, webview, menu, and tray events.
apis/insights.mdx — Insights — Track custom events and control Electrobun Insights from any supported main-process SDK.
apis/main.mdx — Main Process API — The Electrobun main-process SDK in Cottontail, Bun, Zig, Rust, Go, and Odin.
apis/paths.mdx — Paths — Locate packaged Electrobun resources from the main process.
apis/tray.mdx — Tray — Create a cross-platform system tray item and native menu.
apis/ui/browser-dom.mdx — DOM Renderer (Webviews) — The same reactivity and JSX as Electrobun UI, rendered into real DOM inside a webview.
apis/ui/components.mdx — UI Components — The eb-* component stylesheet: buttons, forms, cards, navigation, menus, dialogs, and more in plain CSS.
apis/ui/events.mdx — Events & Input — Pointer, keyboard, focus, text editing, and accessibility in Electrobun UI.
apis/ui/html-css.mdx — HTML & CSS Support — The HTML elements and CSS features Electrobun UI supports.
apis/ui/overview.mdx — UI API Overview — Electrobun UI windows, mounting, the UI object, native views, and testing helpers.
apis/ui/reactivity.mdx — Reactivity — Electrobun UI's reactivity model (Warren): signal, store, live, memo, inert, cleanup, batch, and control flow.
apis/ui/ui-tag.mdx — UI Tag (<electrobun-ui>) — Layer Electrobun UI over web content with the <electrobun-ui> custom element.
apis/ui/zig.mdx — Electrobun UI from Zig — Build GPU-rendered UI in a Zig main process: Zig state, HTML templates, CSS.
apis/updater-native.mdx — Native Updater — Queue, observe, and approve core-owned updates from Zig, Go, Odin, and Rust.
apis/updater.mdx — Updater — Check, download, apply, and observe Electrobun application updates.
apis/utils.mdx — Utils — Cross-platform application, dialog, clipboard, and path utilities.
apis/webgpu.mdx — WebGPU — Render and compute with the native Dawn WebGPU implementation.
guides/architecture/overview.mdx — Architecture Overview — How Hutch, main-process runtimes, Electrobun Core, and webviews fit together.
guides/architecture/webview-tag.mdx — Webview Tag Architecture — How Electrobun maps a DOM anchor to an isolated native BrowserView.
guides/bundling-and-distribution.mdx — Bundling And Distribution — Create stable and canary installers, update archives, and patches.
guides/changelog/index.mdx — Changelog
guides/changelog/unreleased.mdx — Unreleased
guides/changelog/v2-x.mdx — Electrobun v2.x — The Electrobun 2.0 toolchain, runtime, platform, and API release.
guides/code-signing.mdx — Code Signing — Sign and notarize Electrobun releases on macOS.
guides/compatability.mdx — Compatibility — Supported operating systems, architectures, runtimes, and webview engines.
guides/cottontail.mdx — Cottontail — Use Electrobun's experimental JavaScript runtime.
guides/creating-ui.mdx — Creating UI — Bundle a browser view and embed isolated web content.
guides/cross-platform-development.mdx — Cross-Platform Development — Build and test Electrobun applications on macOS, Windows, and Linux.
guides/electrobun-ui.mdx — Electrobun UI — Build app UI with HTML, CSS, and JSX rendered straight to the GPU from the main process — no webview.
guides/hello-world-bun.mdx — Hello World (Bun) — Build a minimal Electrobun app with the Bun main-process runtime.
guides/hello-world-go.mdx — Hello World (Go) — Build a minimal Electrobun app with a Go main process from scratch.
guides/hello-world-odin.mdx — Hello World (Odin) — Build a minimal Electrobun app with an Odin main process from scratch.
guides/hello-world-rust.mdx — Hello World (Rust) — Build a minimal Electrobun app with a Rust main process from scratch.
guides/hello-world-zig.mdx — Hello World (Zig) — Build a minimal Electrobun app with a Zig main process from scratch.
guides/hello-world.mdx — Hello World (Cottontail) — Build a minimal Electrobun app with the Cottontail main-process runtime.
guides/hot-reloading.mdx — Hot Reloading — Understand hot module replacement, webview reloads, and whole-app watch mode in Electrobun.
guides/hutch.mdx — Hutch — Install and use Electrobun's native build and workspace CLI.
guides/insights.mdx — Electrobun Insights — Opt into app lifecycle analytics and custom events through Electrobun's native core.
guides/managed-deploys.mdx — Electrobun Managed Deploys — Upload each runner's artifacts, review a release in Dash, and publish to prerelease installs or everyone.
guides/migrating-to-v2.mdx — Migrate to Electrobun 2.x — Upgrade the npm dependency, run your scripts, and fix what the validator reports.
guides/native-main-process.mdx — Main Process Runtimes — Choose Cottontail, Bun, Zig, Rust, Go, or Odin for an Electrobun main process.
guides/project-ownership.mdx — Project Ownership and the Devkit — Where Electrobun configuration, SDKs, tasks, and dependencies live.
guides/quick-start.mdx — Quick Start — Create and run an Electrobun 2.x app with Hutch.
guides/uninstalling.mdx — Uninstalling — How Electrobun removes an installed application and its managed data.
guides/updates.mdx — Updates — Publish update artifacts and automate cross-platform releases.
guides/what-is-electrobun.mdx — What is Electrobun? — A compact cross-platform desktop framework built around native views and a small runtime.
index.mdx — Electrobun — Build ultra fast, tiny, cross-platform desktop apps with TypeScript.
