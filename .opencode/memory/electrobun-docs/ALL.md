=== FILE: apis/app.mdx ===
---
title: "App"
description: "Application runtime helpers, including the shared persistent install ID."
---

`app.getInstallationId()` returns the native core's persistent ID for this app and
local user-data profile. Managed updates and Electrobun Insights use the same
value. Reading it works with Insights disabled or absent and does not start an
analytics session, queue an event, or make a network request.

## Display the install ID

Offer the ID in your application's **About**, **Help**, or **Settings** screen,
with a copy action. A developer or tester can then register that exact install
for a managed prerelease. Electrobun does not add a menu or settings
screen automatically.

For Bun and Cottontail main processes, use the named `app` export from
`electrobun/main`, or `Electrobun.app` from the default export:

```ts
import { app, Utils } from "electrobun/main";

// Call from an existing About/Help menu item or settings action.
async function showInstallationInfo() {
  const id = app.getInstallationId();
  const { response } = await Utils.showMessageBox({
    type: "info",
    title: "About My App",
    message: "Install ID",
    detail: id ?? "Unavailable",
    buttons: id ? ["Copy install ID", "Close"] : ["Close"],
  });
  if (id && response === 0) Utils.clipboardWriteText(id);
}
```

The getter returns a 32-character lowercase hexadecimal string, or `null` when
the native core or local identity storage is unavailable. Keep unavailable IDs
out of registration requests rather than generating a second ID in application
code. Importing the TypeScript API alone does not create the identity; the
getter initializes its local storage when needed.

## Native SDKs

Bundled applications configure identity as part of their normal SDK setup.
Use the shared getter after that setup, independently of any Insights setting:

| Runtime | Getter | Unavailable result / ownership |
| --- | --- | --- |
| Zig | `try core.getInstallationId()` | `null`; free a returned slice with `core.allocator` |
| Rust | `core.installation_id()` | `None`; returns an owned `String` |
| Go | `core.InstallationID()` | Empty string; ordinary Go string |
| Odin | `electrobun.getInstallationId(core)` | Empty string; free a returned string with the core's allocator |

For example, in Zig:

```zig
if (try core.getInstallationId()) |id| {
    defer core.allocator.free(id);
    // Display or copy id through the application's own UI.
}
```

The earlier Insights-specific installation-ID getters remain available and
refer to the same native identity. Prefer this shared API when displaying the ID
or integrating managed updates, so the application does not need to initialize
Insights just to retrieve it.

## Identity lifetime

The ID contains 128 random bits and is scoped to the application's local profile. It is not a
hardware serial number, a Dash account ID, or an authenticated application user.
Normal restarts and app updates retain it. Different profiles have independent
IDs; deleting the application's local data can create a new one. Copying an
existing profile can copy its ID too. Managed routing always scopes the ID to
the app selected by the API path or verified hostname, so ID uniqueness is not
the boundary between customers. Existing
Insights identity state is reused when moving to the shared identity API.

Managed update requests send this ID to the configured managed origin to select
an eligible prerelease. Registration is a routing hint rather than a secret
download credential. Insights collection remains off by default and follows
its separate consent settings; showing or copying an ID does not opt anyone in.

See [Managed Deploys](/electrobun/guides/managed-deploys/) for prerelease-install
registration and publication, [Insights](/electrobun/guides/insights/) for optional
analytics, and [Utils](/electrobun/apis/utils/) for dialogs and clipboard APIs.

=== FILE: apis/application-icons.mdx ===
---
title: "Application Icons"
description: "Configure packaged application icons on macOS, Windows, and Linux."
---
import { Aside } from "@astrojs/starlight/components";

Set platform icon sources in `electrobun.config.ts`:

```ts
import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "Icon Example",
    identifier: "dev.example.icons",
    version: "1.0.0",
  },
  build: {
    mac: {
      icons: "icon.iconset",
    },
    win: {
      icon: "assets/icon.ico",
    },
    linux: {
      icon: "assets/icon.png",
    },
  },
} satisfies ElectrobunConfig;
```

## macOS

`build.mac.icons` accepts either a traditional `.iconset` directory or a
modern `.icon` file created by Apple's Icon Composer.

An iconset normally contains:

```text
icon_16x16.png
icon_16x16@2x.png
icon_32x32.png
icon_32x32@2x.png
icon_128x128.png
icon_128x128@2x.png
icon_256x256.png
icon_256x256@2x.png
icon_512x512.png
icon_512x512@2x.png
```

Electrobun converts `.iconset` directories with `iconutil`. Compiling `.icon`
files uses `actool` and therefore requires a full Xcode installation, not only
Command Line Tools. See [Apple's app icon
documentation](https://developer.apple.com/documentation/xcode/configuring-your-app-icon).

## Windows

`build.win.icon` accepts `.ico` or `.png`. Hutch converts PNG input to ICO and
embeds the icon into packaged executables and the installer. Use a 256 x 256 or
larger PNG, or a multi-resolution ICO containing 16, 32, 48, and 256 pixel
variants.

## Linux

`build.linux.icon` accepts PNG. Hutch includes it in the app bundle and generated
desktop entry. A 256 x 256 or larger source is recommended.

<Aside type="tip">
A high-resolution PNG from the macOS iconset can also be the Windows and Linux
source when a platform-specific design is not required.
</Aside>

=== FILE: apis/application-menu.mdx ===
---
title: "Application Menu"
description: "Configure the native application menu and handle custom actions."
---
import { Aside, Tabs, TabItem } from "@astrojs/starlight/components";

Use `ApplicationMenu.setApplicationMenu()` in the main process. A role invokes
native operating-system behavior; an action emits an event for application
code.

<Tabs syncKey="runtime">
<TabItem label="Cottontail">

```ts
import { ApplicationMenu } from "electrobun/main";

ApplicationMenu.setApplicationMenu([
  {
    label: "File",
    submenu: [
      {
        label: "New project",
        action: "new-project",
        accelerator: "n",
      },
      { type: "separator" },
      { role: "close" },
      { role: "quit" },
    ],
  },
  {
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { role: "selectAll" },
    ],
  },
]);

ApplicationMenu.on("application-menu-clicked", (event: unknown) => {
  console.log("Application menu action", event);
});
```

</TabItem>
<TabItem label="Bun">

```ts
import { ApplicationMenu } from "electrobun/main";

ApplicationMenu.setApplicationMenu([
  {
    label: "File",
    submenu: [
      {
        label: "New project",
        action: "new-project",
        accelerator: "n",
      },
      { type: "separator" },
      { role: "close" },
      { role: "quit" },
    ],
  },
  {
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { role: "selectAll" },
    ],
  },
]);

ApplicationMenu.on("application-menu-clicked", (event: unknown) => {
  console.log("Application menu action", event);
});
```

</TabItem>
<TabItem label="Zig">

```zig
fn onMenuAction(item_id: u32, action: [*:0]const u8) callconv(.C) void {
    std.debug.print("application menu action: {d} {s}\n", .{ item_id, action });
}

const menu_json =
    \\[{"label": "File", "submenu": [
    \\  {"label": "New project", "action": "new-project", "accelerator": "n"},
    \\  {"type": "separator"},
    \\  {"role": "close"},
    \\  {"role": "quit"}
    \\]}]
;

try core.setApplicationMenuJson(menu_json, onMenuAction);
```

</TabItem>
<TabItem label="Rust">

```rust
extern "C" fn on_menu_action(item_id: u32, action: *const c_char) {
    let action = electrobun::c_string_to_string(action);
    println!("application menu action: {item_id} {action}");
}

let menu_json = r#"[
  {"label": "File", "submenu": [
    {"label": "New project", "action": "new-project", "accelerator": "n"},
    {"type": "separator"},
    {"role": "close"},
    {"role": "quit"}
  ]}
]"#;

core.set_application_menu_json(menu_json, Some(on_menu_action))?;
```

</TabItem>
<TabItem label="Go">

```go
menuJSON := `[
  {"label": "File", "submenu": [
    {"label": "New project", "action": "new-project", "accelerator": "n"},
    {"type": "separator"},
    {"role": "close"},
    {"role": "quit"}
  ]}
]`

err := core.SetApplicationMenuJSON(menuJSON, func(itemID uint32, action string) {
    fmt.Printf("application menu action: %d %s\n", itemID, action)
})
```

</TabItem>
<TabItem label="Odin">

```odin
on_menu_action :: proc "c" (item_id: u32, action: cstring) {
    context = runtime.default_context()
    fmt.printfln("application menu action: %d %s", item_id, action)
}

MENU_JSON :: `[
  {"label": "File", "submenu": [
    {"label": "New project", "action": "new-project", "accelerator": "n"},
    {"type": "separator"},
    {"role": "close"},
    {"role": "quit"}
  ]}
]`

_ = electrobun.setApplicationMenuJson(core, MENU_JSON, on_menu_action)
```

</TabItem>
</Tabs>

<Aside type="note">
The native SDKs have no typed menu builder: `setApplicationMenuJson` (Rust
`set_application_menu_json`, Go `SetApplicationMenuJSON`) takes a raw JSON
string using the same menu schema the TypeScript SDK serializes, so the item
fields and roles documented below apply unchanged. Custom `action` values
arrive in the `StatusItemHandler` callback instead of an event emitter.
</Aside>

## Menu items

A normal item supports these fields:

| Field | Type | Purpose |
| --- | --- | --- |
| `label` | `string` | Visible item text. Optional when a role supplies its standard label. |
| `action` | `string` | Custom action emitted when selected. |
| `role` | `string` | Native menu command. Do not combine it with `action`. |
| `submenu` | `ApplicationMenuItemConfig[]` | Nested items. |
| `enabled` | `boolean` | Disable interaction when `false`. |
| `checked` | `boolean` | Show the checked state. |
| `hidden` | `boolean` | Hide the item. |
| `tooltip` | `string` | Native tooltip where supported. |
| `accelerator` | `string` | Single-key custom shortcut; Command on macOS and Control on Windows. |
| `data` | `unknown` | Serializable application data attached to the action. |

Use `{ type: "separator" }` or `{ type: "divider" }` for a divider.

## Roles

Common roles include `about`, `quit`, `hide`, `hideOthers`, `showAll`,
`minimize`, `zoom`, `close`, `toggleFullScreen`, `undo`, `redo`, `cut`,
`copy`, `paste`, `pasteAndMatchStyle`, `delete`, and `selectAll`.

Electrobun also accepts native text movement, selection, deletion, insertion,
speech, and scrolling roles. Roles are forwarded to the platform menu system;
unsupported roles have no native action on that platform.

## Stateful items

Rebuild the menu when application state changes:

```ts
import { ApplicationMenu } from "electrobun/main";

let sidebarVisible = true;

function updateMenu() {
  ApplicationMenu.setApplicationMenu([
    {
      label: "View",
      submenu: [
        {
          label: "Show sidebar",
          action: "toggle-sidebar",
          checked: sidebarVisible,
        },
      ],
    },
  ]);
}

ApplicationMenu.on("application-menu-clicked", (event: unknown) => {
  console.log(event);
  sidebarVisible = !sidebarVisible;
  updateMenu();
});

updateMenu();
```

Application menus are currently implemented on macOS and Windows. Linux apps
should expose essential actions in application UI or a supported tray menu.

=== FILE: apis/browser-view.mdx ===
---
title: "BrowserView"
description: "Create, attach, navigate, and communicate with native webviews."
---
import { Aside, Tabs, TabItem } from "@astrojs/starlight/components";

`BrowserView` is Electrobun's main-process wrapper around a native or CEF
webview. Every `BrowserWindow` creates one initial view, available as
`window.webview`. Create additional views when a window needs independently
positioned web content. In the native SDKs there is no view class:
`createWebview` returns a `u32` id and every operation is a `Core` call keyed
by that id.

<Tabs syncKey="runtime">
<TabItem label="Cottontail">

```ts
import { BrowserView, BrowserWindow } from "electrobun/main";

const win = new BrowserWindow({
  title: "Multiple views",
  url: "views://shell/index.html",
  frame: { width: 1000, height: 700 },
});

const view = new BrowserView({
  windowId: win.id,
  url: "views://details/index.html",
  frame: { x: 320, y: 0, width: 680, height: 700 },
  autoResize: false,
});

void view;
```

</TabItem>
<TabItem label="Bun">

```ts
import { BrowserView, BrowserWindow } from "electrobun/main";

const win = new BrowserWindow({
  title: "Multiple views",
  url: "views://shell/index.html",
  frame: { width: 1000, height: 700 },
});

const view = new BrowserView({
  windowId: win.id,
  url: "views://details/index.html",
  frame: { x: 320, y: 0, width: 680, height: 700 },
  autoResize: false,
});

void view;
```

</TabItem>
<TabItem label="Zig">

```zig
const webview_id = try core.createWebview(.{
    .window_id = window_id,
    .url = "views://details/index.html",
    .frame = .{ .x = 320, .y = 0, .width = 680, .height = 700 },
    .auto_resize = false,
    .callbacks = .{ .decide_navigation = electrobun.allowAllNavigation },
});

// Navigation and content:
try core.loadURLInWebview(webview_id, "https://electrobun.dev");
try core.loadHTMLInWebview(webview_id, "<h1>Inline content</h1>");
if (core.canWebviewGoBack(webview_id)) try core.webviewGoBack(webview_id);
if (core.canWebviewGoForward(webview_id)) try core.webviewGoForward(webview_id);
try core.reloadWebview(webview_id);
try core.openWebviewDevTools(webview_id);
```

</TabItem>
<TabItem label="Rust">

```rust
let mut webview_options = WebviewOptions::new(
    window_id,
    "views://details/index.html",
    Rect::new(320.0, 0.0, 680.0, 700.0),
);
webview_options.auto_resize = false;
webview_options.callbacks = WebviewCallbacks {
    decide_navigation: Some(electrobun::allow_all_navigation),
    ..WebviewCallbacks::default()
};
let webview_id = core.create_webview(webview_options)?;

// Navigation and content:
core.load_url_in_webview(webview_id, "https://electrobun.dev")?;
core.load_html_in_webview(webview_id, "<h1>Inline content</h1>")?;
if core.can_webview_go_back(webview_id) {
    core.webview_go_back(webview_id)?;
}
if core.can_webview_go_forward(webview_id) {
    core.webview_go_forward(webview_id)?;
}
core.reload_webview(webview_id)?;
core.open_webview_devtools(webview_id)?;
```

</TabItem>
<TabItem label="Go">

```go
webviewOptions := electrobun.NewWebviewOptions(
    windowID,
    "views://details/index.html",
    electrobun.NewRect(320, 0, 680, 700),
)
webviewOptions.AutoResize = false
webviewID, err := core.CreateWebview(webviewOptions)

// Navigation and content:
_ = core.LoadURLInWebview(webviewID, "https://electrobun.dev")
_ = core.LoadHTMLInWebview(webviewID, "<h1>Inline content</h1>")
if core.CanWebviewGoBack(webviewID) {
    _ = core.WebviewGoBack(webviewID)
}
if core.CanWebviewGoForward(webviewID) {
    _ = core.WebviewGoForward(webviewID)
}
_ = core.ReloadWebview(webviewID)
_ = core.OpenWebviewDevtools(webviewID)
```

</TabItem>
<TabItem label="Odin">

```odin
webview_options := electrobun.defaultWebviewOptions(window_id)
webview_options.url = "views://details/index.html"
webview_options.frame = {x = 320, y = 0, width = 680, height = 700}
webview_options.auto_resize = false
webview_id, webview_err := electrobun.createWebview(core, webview_options)

// Navigation and content:
_ = electrobun.loadURLInWebview(core, webview_id, "https://electrobun.dev")
_ = electrobun.loadHTMLInWebview(core, webview_id, "<h1>Inline content</h1>")
if electrobun.canWebviewGoBack(core, webview_id) {
    _ = electrobun.webviewGoBack(core, webview_id)
}
if electrobun.canWebviewGoForward(core, webview_id) {
    _ = electrobun.webviewGoForward(core, webview_id)
}
_ = electrobun.reloadWebview(core, webview_id)
_ = electrobun.openWebviewDevTools(core, webview_id)
```

</TabItem>
</Tabs>

The rest of this page documents the TypeScript class. The native SDKs expose
the same webview verb set as `Core` calls — see
[the mapping](#native-sdks) at the end of the page.

## Constructor options

The constructor accepts `Partial<BrowserViewOptions>`.

| Option | Type | Default | Purpose |
| --- | --- | --- | --- |
| `windowId` | `number` | `0` | Native parent window ID. |
| `hostWebviewId` | `number` | none | Host view for an `<electrobun-webview>` child. |
| `url` | `string \| null` | `null` | URL to load. |
| `html` | `string \| null` | `null` | HTML string to load instead of `url`. |
| `preload` | `string \| null` | `null` | Inline JavaScript or a bundled `views://` script URL. |
| `viewsRoot` | `string \| null` | `null` | Override for the bundled views root. |
| `allowedProtocols` | `{ views?: boolean; appData?: boolean }` | `{ views: true, appData: false }` | Grant this webview access to Electrobun's filesystem-backed URL schemes. |
| `renderer` | `"native" \| "cef"` | Platform build default | Webview renderer. |
| `partition` | `string \| null` | `null` | Persistent storage/session partition. |
| `frame` | `{ x: number; y: number; width: number; height: number }` | `{ x: 0, y: 0, width: 800, height: 600 }` | Position inside the parent window. |
| `autoResize` | `boolean` | `true` | Resize with the parent window. |
| `rpc` | RPC instance | generated empty RPC | Typed main-process transport. |
| `navigationRules` | `string \| null` | `null` | Serialized navigation policy. |
| `sandbox` | `boolean` | `false` | Disable RPC for untrusted content. |
| `startTransparent` | `boolean` | `false` | Create the native layer transparent. |
| `startPassthrough` | `boolean` | `false` | Create with input passthrough enabled. |
| `spellCheck` | `boolean` | `false` | Enable native spell checking where supported. |

<Aside type="note">
Use the DOM `<electrobun-webview>` element when the view's bounds should follow
an element in another webview. Construct `BrowserView` directly when the main
process owns its geometry.
</Aside>

## Loading and scripting

`allowedProtocols` controls filesystem access for this view. Enabling
`appData` permits reads from the app's `userData` directory through
`appdata://`, including after navigation to remote content. See
[Bundled and app-owned assets](/electrobun/apis/bundled-assets/) for examples
and protocol boundaries.

On Windows WebView2, unsafe, uppercase, Unicode, reserved, or over-80-character
partition names map to hashed profile directories. Safe lowercase ASCII names
use their original paths. For migration of existing profiles, see the
[Electrobun 2.0.2 migration notes](/electrobun/guides/changelog/v2-0-2/#windows-profiles-and-lifecycle).

```ts
import { BrowserWindow } from "electrobun/main";

const win = new BrowserWindow({
  title: "View controls",
  url: "views://mainview/index.html",
});
const view = win.webview;

view.loadURL("views://details/index.html");
view.loadHTML("<!doctype html><title>Inline content</title><h1>Hello</h1>");
view.executeJavascript("document.documentElement.dataset.host = 'electrobun'");
view.setNavigationRules(["views://details/*"]);

view.openDevTools();
view.closeDevTools();
view.toggleDevTools();

view.setPageZoom(1.25);
const zoom = view.getPageZoom();
const spellCheckChanged = view.setSpellCheck(true);

void zoom;
void spellCheckChanged;
```

`executeJavascript()` does not return the evaluated value. Use typed RPC when
the browser must return data to the main process.

Navigation and JavaScript evaluation are asynchronous native operations.
Wait for the target document's readiness (for example `dom-ready`, or an
application-level RPC readiness message) before evaluating code that depends
on it. `executeJavascript()` is not a readiness barrier or a promise of
execution: a view without a native browser/frame can discard the request.

While Linux CEF creates its browser, it retains the latest `loadURL()` or
`loadHTML()` request and starts that navigation when the browser is ready.
On macOS, WKWebView uses file-URL loading for local files. `getPageZoom()` reads
on the main thread after pending initialization and zoom changes.

## Host message queue diagnostics

`getHostMessageQueueStats()` reports the main
process's outgoing queue for this view. Use it to investigate a backlog when
sending bursts of RPC messages:

```ts
import { BrowserWindow } from "electrobun/main";

const win = new BrowserWindow({
  title: "Queue diagnostics",
  url: "views://mainview/index.html",
});

console.log(win.webview.getHostMessageQueueStats());
```

| Field | Meaning |
| --- | --- |
| `queuedMessages` | Messages and RPC responses currently waiting in the host queue. |
| `queuedBytes` | Serialized UTF-8 bytes currently queued. |
| `oldestMessageAgeMs` | Age of the oldest queued message, or `0` when empty. |
| `enqueuedMessages` | Total messages added to this view's host queue. |
| `drainedMessages` | Total messages removed from the queue for transport. |
| `peakQueuedMessages` | Highest recorded queued message count. |
| `peakQueuedBytes` | Highest recorded serialized byte count. |

These are host queue measurements. Byte counts are not retained heap usage,
and draining a message does not acknowledge delivery or rendering in the
WebView. Delivery uses byte-limited batches and yields between turns to keep
I/O responsive under load; the diagnostics do not impose a queue size limit.

## Find in page

```ts
import { BrowserWindow } from "electrobun/main";

const win = new BrowserWindow({
  title: "Find",
  url: "views://mainview/index.html",
});

win.webview.findInPage("Electrobun", {
  forward: true,
  matchCase: false,
});
win.webview.stopFindInPage();
```

## Events

Instance events cover navigation, readiness, and downloads. Event payloads are
currently typed as `unknown`.

```ts
import { BrowserView, BrowserWindow } from "electrobun/main";

const win = new BrowserWindow({
  title: "Events",
  url: "views://mainview/index.html",
});

win.webview.on("dom-ready", (event: unknown) => {
  console.log("DOM ready", event);
});
win.webview.on("did-navigate", (event: unknown) => {
  console.log("Navigation finished", event);
});
win.webview.on("download-completed", (event: unknown) => {
  console.log("Download complete", event);
});

const stopWatchingCreatedViews = BrowserView.on("created", (createdView) => {
  console.log("BrowserView created", createdView.id);
});
stopWatchingCreatedViews();
```

Supported instance event names are `will-navigate`, `did-navigate`,
`did-navigate-in-page`, `did-commit-navigation`, `dom-ready`,
`download-started`, `download-progress`, `download-completed`, and
`download-failed`.

## Typed RPC

Define the shared schema in a module imported by both contexts. The main process
uses `BrowserView.defineRPC`; the browser uses `Electroview.defineRPC`.

```ts
import {
  BrowserView,
  BrowserWindow,
  type RPCSchema,
} from "electrobun/main";

export type AppRPC = {
  bun: RPCSchema<{
    requests: {
      greet: {
        params: { name: string };
        response: { message: string };
      };
    };
    messages: {};
  }>;
  webview: RPCSchema<{
    requests: {};
    messages: {
      statusChanged: { online: boolean };
    };
  }>;
};

const rpc = BrowserView.defineRPC<AppRPC>({
  handlers: {
    requests: {
      greet: ({ name }) => ({ message: `Hello, ${name}` }),
    },
    messages: {},
  },
});

const win = new BrowserWindow({
  title: "Typed RPC",
  url: "views://mainview/index.html",
  rpc,
});

rpc.send.statusChanged({ online: true });
void win;
```

The browser-side half is documented under
[Electroview](/electrobun/apis/browser/electroview-class/).

## Lookup, adoption, and removal

```ts
import { BrowserView, BrowserWindow } from "electrobun/main";

const win = new BrowserWindow({
  title: "View ownership",
  url: "views://mainview/index.html",
});

const existing = BrowserView.getById(win.webview.id);
const allViews = BrowserView.getAll();

if (existing) {
  const wrapped = BrowserView.ensureWrapped(existing.id, {
    windowId: win.id,
  });
  const adopted = BrowserView.adoptExisting(existing.id, {
    windowId: win.id,
  });
  void wrapped;
  void adopted;
}

void allViews;
```

`ensureWrapped()` and `adoptExisting()` are advanced APIs for native views that
already exist. Calling `remove()` destroys a view and disconnects its RPC
transport; repeated calls are safe.

## Public methods

- Content: `loadURL`, `loadHTML`, `executeJavascript`, `setNavigationRules`,
  `setSpellCheck`.
- Developer tools and find: `openDevTools`, `closeDevTools`, `toggleDevTools`,
  `findInPage`, `stopFindInPage`.
- Display: `setPageZoom`, `getPageZoom`.
- Lifecycle and events: `on`, `remove`, `ptr`.
- Static ownership: `getById`, `getAll`, `ensureWrapped`, `adoptExisting`, `on`,
  `off`, and `defineRPC`.

## Native SDKs

Zig, Rust, Go, and Odin expose the webview verb set procedurally on `Core`,
keyed by the `u32` webview id `createWebview` returns. Only naming style
differs per language:

| TypeScript | Zig / Odin | Rust | Go |
| --- | --- | --- | --- |
| `view.loadURL(url)` | `loadURLInWebview(id, url)` | `load_url_in_webview(id, url)` | `LoadURLInWebview(id, url)` |
| `view.loadHTML(html)` | `loadHTMLInWebview(id, html)` | `load_html_in_webview(id, html)` | `LoadHTMLInWebview(id, html)` |
| `frame` / `autoResize` option | `resizeWebview(id, frame, masks_json)` | `resize_webview(id, frame, masks_json)` | `ResizeWebview(id, frame, masksJSON)` |
| `startTransparent` / `startPassthrough` options | `setWebviewTransparent` / `setWebviewPassthrough` / `setWebviewHidden` | `set_webview_transparent` / `set_webview_passthrough` / `set_webview_hidden` | `SetWebviewTransparent` / `SetWebviewPassthrough` / `SetWebviewHidden` |
| `view.setSpellCheck(b)` | `setWebviewSpellCheck(id, b)` | `set_webview_spell_check(id, b)` | `SetWebviewSpellCheck(id, b)` |
| `view.setNavigationRules(rules)` | `setWebviewNavigationRules(id, rules_json)` | `set_webview_navigation_rules(id, rules_json)` | `SetWebviewNavigationRules(id, rulesJSON)` |
| `view.findInPage` / `stopFindInPage` | `webviewFindInPage` / `webviewStopFind` | `webview_find_in_page` / `webview_stop_find` | `WebviewFindInPage` / `WebviewStopFind` |
| `view.openDevTools` / `closeDevTools` / `toggleDevTools` | `openWebviewDevTools` / `closeWebviewDevTools` / `toggleWebviewDevTools` | `open_webview_devtools` / `close_webview_devtools` / `toggle_webview_devtools` | `OpenWebviewDevtools` / `CloseWebviewDevtools` / `ToggleWebviewDevtools` |
| `view.setPageZoom` / `getPageZoom` | `setWebviewPageZoom` / `getWebviewPageZoom` | `set_webview_page_zoom` / `get_webview_page_zoom` | `SetWebviewPageZoom` / `GetWebviewPageZoom` |
| `view.executeJavascript(js)` | `evaluateJavaScriptWithNoCompletion(id, js)` | `evaluate_javascript_with_no_completion(id, js)` | `EvaluateJavaScriptWithNoCompletion(id, js)` |
| `view.remove()` | `removeWebview(id)` | `remove_webview(id)` | `RemoveWebview(id)` |
| — (no TS history methods) | `canWebviewGoBack` / `canWebviewGoForward`, `webviewGoBack` / `webviewGoForward`, `reloadWebview` | `can_webview_go_back` / `can_webview_go_forward`, `webview_go_back` / `webview_go_forward`, `reload_webview` | `CanWebviewGoBack` / `CanWebviewGoForward`, `WebviewGoBack` / `WebviewGoForward`, `ReloadWebview` |

Not available natively: the typed RPC layer (`defineRPC`) — the native SDKs
provide only the raw JSON bridge primitives, and apps implement the
request/response envelope themselves; the `.on()` event emitter — native
webview events arrive through the C callbacks fixed at creation
(`decide_navigation`, `event`, and the bridge handlers); JavaScript
evaluation with a returned result — only the fire-and-forget
`evaluateJavaScriptWithNoCompletion` exists; and the download event stream
(`download-started` through `download-failed`), which has no native
equivalent.

=== FILE: apis/browser-window.mdx ===
---
title: "BrowserWindow"
description: "Create and control native Electrobun windows."
---
import { Aside, Tabs, TabItem } from "@astrojs/starlight/components";

Every runtime creates native windows through the same core. In TypeScript
(Cottontail/Bun), `BrowserWindow` creates a window and its initial
[`BrowserView`](/electrobun/apis/browser-view/); the native SDKs create
windows and webviews as two explicit calls.

<Tabs syncKey="runtime">
<TabItem label="Cottontail">

```ts
import { BrowserWindow } from "electrobun/main";

const win = new BrowserWindow({
  title: "My app",
  url: "views://mainview/index.html",
  frame: {
    width: 960,
    height: 640,
  },
});
```

</TabItem>
<TabItem label="Bun">

```ts
import { BrowserWindow } from "electrobun/main";

const win = new BrowserWindow({
  title: "My app",
  url: "views://mainview/index.html",
  frame: {
    width: 960,
    height: 640,
  },
});
```

</TabItem>
<TabItem label="Zig">

```zig
const window_id = try core.createWindow(.{
    .title = "My app",
    .frame = .{ .x = 160, .y = 100, .width = 960, .height = 640 },
    .callbacks = .{ .resize = onResize, .should_close = onShouldClose },
});

const webview_id = try core.createWebview(.{
    .window_id = window_id,
    .url = "views://mainview/index.html",
    .frame = .{ .x = 0, .y = 0, .width = 960, .height = 640 },
    .callbacks = .{ .decide_navigation = electrobun.allowAllNavigation },
});
```

</TabItem>
<TabItem label="Rust">

```rust
let mut window_options =
    WindowOptions::new("My app", Rect::new(160.0, 100.0, 960.0, 640.0));
window_options.callbacks = WindowCallbacks {
    close: Some(main_window_closed),
    ..WindowCallbacks::default()
};
let window_id = core.create_window(window_options)?;

let webview_options = WebviewOptions::new(
    window_id,
    "views://mainview/index.html",
    Rect::new(0.0, 0.0, 960.0, 640.0),
);
let webview_id = core.create_webview(webview_options)?;
```

</TabItem>
<TabItem label="Go">

```go
windowOptions := electrobun.NewWindowOptions(
    "My app",
    electrobun.NewRect(160, 100, 960, 640),
)
windowOptions.Callbacks = electrobun.WindowCallbacks{
    Close: func(uint32) { _ = core.StopEventLoop() },
}
windowID, err := core.CreateWindow(windowOptions)

webviewOptions := electrobun.NewWebviewOptions(
    windowID,
    "views://mainview/index.html",
    electrobun.NewRect(0, 0, 960, 640),
)
webviewID, err := core.CreateWebview(webviewOptions)
```

</TabItem>
<TabItem label="Odin">

```odin
window_options := electrobun.defaultWindowOptions("My app")
window_options.frame = {x = 160, y = 100, width = 960, height = 640}
window_id, window_err := electrobun.createWindow(core, window_options)

webview_options := electrobun.defaultWebviewOptions(window_id)
webview_options.url = "views://mainview/index.html"
webview_options.frame = {x = 0, y = 0, width = 960, height = 640}
webview_id, webview_err := electrobun.createWebview(core, webview_options)
```

</TabItem>
</Tabs>

In TypeScript, omitting `frame.x` or `frame.y` centers the window, the
instance is available immediately, and `win.webview` is the `BrowserView`
created for its content. Native window/webview creation and its required
lifecycle setup (core loading, the blocking main thread, the webview
runtime) are covered end to end in the per-runtime
[Hello World walkthroughs](/electrobun/guides/hello-world/).

The rest of this page documents the TypeScript class. Every window
operation below also exists in the native SDKs as a `Core` call keyed by
window id — see [the mapping](#native-sdks) at the end of the page.

## Constructor options

All options are optional because the constructor accepts
`Partial<WindowOptionsType>`. The table describes the defaults used when an
options object is supplied. For compatibility, calling `new BrowserWindow()`
with no argument uses the legacy starter window: title `"Electrobun"`, size
800 by 600, and URL `https://electrobun.dev`.

| Option | Type | Default | Purpose |
| --- | --- | --- | --- |
| `title` | `string` | `"New Window"` | Native window title. |
| `frame` | `{ x?: number; y?: number; width: number; height: number }` | `800 x 600`, centered | Initial position and size. |
| `url` | `string \| null` | `null` | URL loaded by the initial webview. Use `views://` for bundled content. |
| `html` | `string \| null` | `null` | HTML string loaded instead of `url`. |
| `preload` | `string \| null` | `null` | Inline JavaScript or a bundled `views://` script URL. |
| `viewsRoot` | `string \| null` | `null` | Override for the bundled views root. |
| `allowedProtocols` | `{ views?: boolean; appData?: boolean }` | `{ views: true, appData: false }` | Grant the initial webview access to Electrobun's filesystem-backed URL schemes. |
| `renderer` | `"native" \| "cef"` | Platform build default | Renderer for the initial webview. |
| `rpc` | RPC instance | none | Main-process side of the webview RPC transport. |
| `titleBarStyle` | `"default" \| "hidden" \| "hiddenInset"` | `"default"` | Native title-bar treatment; see platform behavior below. |
| `styleMask` | object | platform defaults | Advanced native style-mask overrides. |
| `transparent` | `boolean` | `false` | Make the native window background transparent. |
| `passthrough` | `boolean` | `false` | Pass pointer input through transparent regions. |
| `spellCheck` | `boolean` | `false` | Enable native spell checking where supported. |
| `hidden` | `boolean` | `false` | Create without showing the window. |
| `activate` | `boolean` | `true` | Activate the window when it is created. |
| `trafficLightOffset` | `{ x: number; y: number }` | `{ x: 0, y: 0 }` | macOS traffic-light offset. |
| `navigationRules` | `string \| null` | `null` | Serialized navigation policy for the initial webview. |
| `sandbox` | `boolean` | `false` | Disable RPC for untrusted content; event emission remains available. |

Only bundle and select CEF when the app needs it. See
[Bundling CEF](/electrobun/apis/bundling-cef/) for the build configuration.

`allowedProtocols` applies to this window's initial webview. Enable `appData`
only when its content and navigation are trusted; permission persists across
navigation. Additional `BrowserView` instances have their own settings. See
[Bundled and app-owned assets](/electrobun/apis/bundled-assets/) for examples.

`titleBarStyle: "hidden"` removes the system titlebar and native controls.
Frameless Linux GTK windows support edge and corner resizing. `"hiddenInset"`
keeps inset native controls on macOS; on Windows
and the native Linux GTK backend it provides resize handles without a system
titlebar. Add your own draggable regions when using custom window chrome.

```ts
import { BrowserWindow } from "electrobun/main";

const cefWindow = new BrowserWindow({
  title: "CEF content",
  url: "views://mainview/index.html",
  renderer: "cef",
});

const sandboxedWindow = new BrowserWindow({
  title: "Untrusted content",
  url: "https://example.com",
  sandbox: true,
});

void cefWindow;
void sandboxedWindow;
```

<Aside type="caution">
Do not attach privileged RPC handlers to a view that can navigate to untrusted
content. Use `sandbox: true` and restrictive navigation rules for remote pages.
</Aside>

## Window lifecycle

```ts
import { BrowserWindow } from "electrobun/main";

const win = new BrowserWindow({
  title: "Lifecycle",
  url: "views://mainview/index.html",
});

win.show();
win.showInactive();
win.hide();
const visible = win.isVisible();

win.activate();
win.minimize();
win.unminimize();
const minimized = win.isMinimized();

win.maximize();
win.unmaximize();
const maximized = win.isMaximized();

win.setFullScreen(true);
const fullScreen = win.isFullScreen();

win.setAlwaysOnTop(true);
const alwaysOnTop = win.isAlwaysOnTop();

win.setVisibleOnAllWorkspaces(true);
const onAllWorkspaces = win.isVisibleOnAllWorkspaces();

win.requestClose(); // Runs the normal close-request path.
win.close();        // Closes the window directly.

void visible;
void minimized;
void maximized;
void fullScreen;
void alwaysOnTop;
void onAllWorkspaces;
```

`focus()` remains as a deprecated alias for `activate()`.

## Title, position, and size

```ts
import { BrowserWindow } from "electrobun/main";

const win = new BrowserWindow({
  title: "Geometry",
  url: "views://mainview/index.html",
  frame: { width: 800, height: 600 },
});

win.setTitle("Updated title");
win.setPosition(120, 80);
win.setSize(1024, 720);
win.setFrame(120, 80, 1024, 720);
win.center();

const frame = win.getFrame();
const position = win.getPosition();
const size = win.getSize();

win.setWindowButtonPosition(14, 14);
const buttonPosition = win.getWindowButtonPosition();

void frame;
void position;
void size;
void buttonPosition;
```

## Webview access

The initial view is exposed as `win.webview`. Content, developer tools, find,
zoom, and navigation operations belong to `BrowserView`:

```ts
import { BrowserWindow } from "electrobun/main";

const win = new BrowserWindow({
  title: "Webview access",
  url: "views://mainview/index.html",
});

win.webview.loadURL("views://details/index.html");
win.webview.executeJavascript("document.body.dataset.ready = 'true'");
win.webview.openDevTools();
win.webview.findInPage("example", { forward: true, matchCase: false });
win.webview.stopFindInPage();

win.setPageZoom(1.25);
const zoom = win.getPageZoom();
const spellCheckChanged = win.setSpellCheck(true);

void zoom;
void spellCheckChanged;
```

See [BrowserView](/electrobun/apis/browser-view/) for the complete view API.

## Events and lookup

`on()` scopes an Electrobun window event to this instance. Event payloads are
currently typed as `unknown`, so narrow them before reading application data.

```ts
import { BrowserWindow } from "electrobun/main";

const win = new BrowserWindow({
  title: "Events",
  url: "views://mainview/index.html",
});

win.on("resize", (event: unknown) => {
  console.log("Window resized", event);
});

const sameWindow = BrowserWindow.getById(win.id);
sameWindow?.activate();

const nativePointer = win.ptr;
void nativePointer;
```

The native pointer is an advanced FFI escape hatch. Application code should use
the class methods unless it is integrating directly with a platform API.

## Public methods

The current public control surface is:

- Lifecycle: `close`, `requestClose`, `activate`, `show`, `showInactive`,
  `hide`, `isVisible`.
- Window state: `minimize`, `unminimize`, `isMinimized`, `maximize`,
  `unmaximize`, `isMaximized`, `setFullScreen`, `isFullScreen`,
  `setAlwaysOnTop`, `isAlwaysOnTop`, `setVisibleOnAllWorkspaces`,
  `isVisibleOnAllWorkspaces`.
- Geometry: `setPosition`, `center`, `setSize`, `setFrame`, `getFrame`,
  `getPosition`, `getSize`, `setWindowButtonPosition`,
  `getWindowButtonPosition`.
- Content: `setPageZoom`, `getPageZoom`, `setSpellCheck`, and the `webview`
  property.
- Metadata and events: `setTitle`, `on`, `ptr`, and static `getById`.

## Native SDKs

Zig, Rust, Go, and Odin expose the same window operations procedurally on
`Core`, keyed by the `u32` window id `createWindow` returns. The verb set
matches the class methods one-to-one; only naming style differs per
language:

| TypeScript | Zig / Odin | Rust | Go |
| --- | --- | --- | --- |
| `win.setTitle(t)` | `setWindowTitle(id, t)` | `set_window_title(id, t)` | `SetWindowTitle(id, t)` |
| `win.show()` / `hide()` / `isVisible()` | `showWindow(id, activate)` / `hideWindow` / `isWindowVisible` | `show_window` / `hide_window` / `is_window_visible` | `ShowWindow` / `HideWindow` / `IsWindowVisible` |
| `win.minimize()` ... `isMaximized()` | `minimizeWindow` / `restoreWindow` / `maximizeWindow` / `unmaximizeWindow` + `is...` | snake_case equivalents | CamelCase equivalents |
| `win.setFullScreen(b)` / `setAlwaysOnTop(b)` / `setVisibleOnAllWorkspaces(b)` | `setWindowFullScreen` etc. | `set_window_full_screen` etc. | `SetWindowFullScreen` etc. |
| `win.setPosition` / `setSize` / `setFrame` / `getFrame` / `center` | `setWindowPosition` / `setWindowSize` / `setWindowFrame` / `getWindowFrame` / `centerWindow` | snake_case | CamelCase |
| `win.setWindowButtonPosition` / `get...` | same names (`core`-level) | snake_case | CamelCase |
| `win.close()` / `requestClose()` | `closeWindow` / `requestWindowClose` | `close_window` / `request_window_close` | `CloseWindow` / `RequestWindowClose` |
| `win.on("resize", ...)` | `WindowCallbacks` passed to `createWindow` (`close`, `should_close`, `move`, `resize`, `focus`, `blur`, `key`) | `WindowCallbacks` (same slots) | `WindowCallbacks` (same slots) |

Zig and Odin additionally ship an optional `WindowRegistry` /
`BrowserWindowRef` layer covering `getById`, close/request-close, frame,
center, and button position. Not available natively: `setPageZoom` /
`setSpellCheck` live on the webview id instead
(`setWebviewPageZoom`, `setWebviewSpellCheck`), and there is no event
emitter — events are the C callbacks registered at creation.

=== FILE: apis/browser/draggable-regions.mdx ===
---
title: "Draggable Regions"
description: "Move a frameless native window by dragging designated web content."
---

Electrobun's injected preload turns designated DOM regions into native window
drag handles. No `Electroview` instance or RPC setup is required for dragging
itself.

Use the compatibility classes:

```html
<header class="titlebar electrobun-webkit-app-region-drag">
  <strong>My App</strong>
  <nav class="window-controls electrobun-webkit-app-region-no-drag">
    <button id="minimize" type="button" aria-label="Minimize">_</button>
    <button id="maximize" type="button" aria-label="Maximize">+</button>
    <button id="close" type="button" aria-label="Close">x</button>
  </nav>
</header>
```

Or use an app-region CSS property. Electrobun recognizes
`-webkit-app-region`, `app-region`, and the legacy `window-drag` spelling in
inline and same-origin stylesheets.

```css
.titlebar {
  -webkit-app-region: drag;
  app-region: drag;
  align-items: center;
  display: flex;
  height: 36px;
  user-select: none;
}

.window-controls,
.window-controls button {
  -webkit-app-region: no-drag;
  app-region: no-drag;
}
```

A `no-drag` descendant always wins over a draggable ancestor. Apply it to
buttons, inputs, links, menus, and every other interactive control inside the
titlebar.

## Window Configuration

Use `titleBarStyle: "hidden"` for fully custom chrome. `hiddenInset` retains
the inset native controls on macOS and keeps resize handles without a system
titlebar on Windows and Linux's native GTK backend.
On the Linux GTK backend, `hidden` also includes edge and corner resize handles
without adding a system titlebar.

```typescript
import { BrowserWindow } from "electrobun/main";

const win = new BrowserWindow({
  title: "Custom Titlebar",
  url: "views://mainview/index.html",
  frame: { width: 800, height: 600 },
  titleBarStyle: "hidden",
});

void win;
```

## Custom Window Controls

Custom HTML buttons need typed RPC to invoke native window operations. Define
the same schema in both contexts. In a project, place this type in a shared
module rather than duplicating it.

Main process:

```typescript
import {
  BrowserView,
  BrowserWindow,
  type RPCSchema,
} from "electrobun/main";

type WindowControlsRPC = {
  bun: RPCSchema<{
    requests: {};
    messages: {
      closeWindow: void;
      minimizeWindow: void;
      maximizeWindow: void;
    };
  }>;
  webview: RPCSchema<{ requests: {}; messages: {} }>;
};

let win: BrowserWindow;
const rpc = BrowserView.defineRPC<WindowControlsRPC>({
  handlers: {
    requests: {},
    messages: {
      closeWindow: () => win.close(),
      minimizeWindow: () => win.minimize(),
      maximizeWindow: () => {
        if (win.isMaximized()) win.unmaximize();
        else win.maximize();
      },
    },
  },
});

win = new BrowserWindow({
  title: "Custom Titlebar",
  url: "views://mainview/index.html",
  frame: { width: 800, height: 600 },
  titleBarStyle: "hidden",
  rpc,
});
```

Browser view:

```typescript
import { Electroview, type RPCSchema } from "electrobun/view";

type WindowControlsRPC = {
  bun: RPCSchema<{
    requests: {};
    messages: {
      closeWindow: void;
      minimizeWindow: void;
      maximizeWindow: void;
    };
  }>;
  webview: RPCSchema<{ requests: {}; messages: {} }>;
};

const rpc = Electroview.defineRPC<WindowControlsRPC>({
  handlers: { requests: {}, messages: {} },
});
new Electroview({ rpc });

document.querySelector("#close")?.addEventListener("click", () => {
  rpc.send.closeWindow();
});
document.querySelector("#minimize")?.addEventListener("click", () => {
  rpc.send.minimizeWindow();
});
document.querySelector("#maximize")?.addEventListener("click", () => {
  rpc.send.maximizeWindow();
});
```

The RPC calls use the local `rpc` object returned by `defineRPC`. Constructing
`Electroview` attaches its transport to that object.

## Stylesheet Notes

Electrobun mirrors app-region declarations into a custom property so system
webviews that discard the vendor property still preserve CSS cascade. Inline
styles and same-origin stylesheets are supported. A cross-origin stylesheet
that cannot be fetched may depend on what the current renderer exposes through
computed style; keep titlebar rules in application-owned CSS.

=== FILE: apis/browser/electrobun-webview-tag.mdx ===
---
title: "Electrobun Webview Tag"
description: "Embed an isolated native BrowserView inside an Electrobun page."
---

`<electrobun-webview>` embeds a separate native `BrowserView` and keeps its
position synchronized with an element in the host page. It behaves like an
isolated iframe, but the embedded content is rendered by its own native
webview rather than inside the host document.

Import `electrobun/view` once in the host page. That module registers the
custom element and augments TypeScript's DOM types.

```html
<electrobun-webview
  id="documentation"
  src="https://example.com"
  sandbox
  style="display: block; width: 100%; height: 480px"
></electrobun-webview>
```

```typescript
import type { WebviewTagElement } from "electrobun/view";
import "electrobun/view";

const webview = document.querySelector("electrobun-webview");
if (!webview) throw new Error("The embedded webview was not found");

webview.on("dom-ready", () => {
  console.log("Embedded content is ready", webview.webviewId);
});

webview.loadURL("https://example.com/docs");

const typedWebview: WebviewTagElement = webview;
void typedWebview;
```

## Attributes

| Attribute | Value | Purpose |
| --- | --- | --- |
| `src` | URL | Initial URL. Changing it navigates the webview. |
| `html` | HTML string | Initial inline document. Changing it loads the new HTML. |
| `preload` | JavaScript string | Code evaluated before the embedded page's scripts. |
| `partition` | string | Persistent session/storage partition name. |
| `renderer` | `native` or `cef` | Renderer for this webview. Defaults to `native`. |
| `sandbox` | boolean attribute | Disables Electrobun RPC in the child while retaining events and navigation controls. |
| `transparent` | boolean attribute | Starts the native layer transparent. |
| `passthrough` | boolean attribute | Starts with pointer input passing through to the host page. |
| `spellcheck` | boolean attribute | Enables native WKWebView spell checking where supported. |
| `masks` | comma-separated selectors | Cuts holes in the native layer for matching host elements. |
| `navigation-rules` | JSON string array | Initial native navigation allow/block rules. |

Boolean attributes are enabled by their presence. For `spellcheck`, an
explicit value of `"false"` is also treated as disabled.

```html
<electrobun-webview
  src="https://example.com"
  renderer="cef"
  partition="account-a"
  sandbox
  transparent
  passthrough
  masks=".toolbar, .popover"
  navigation-rules='["^*", "https://example.com/*"]'
></electrobun-webview>
```

Set creation-only attributes such as `renderer`, `partition`, and `sandbox`
before attaching the element to the document. Use the methods below for
runtime changes.

## Navigation

```typescript
import "electrobun/view";

const webview = document.querySelector("electrobun-webview");
if (!webview) throw new Error("The embedded webview was not found");

webview.loadURL("https://example.com");
webview.loadHTML("<!doctype html><title>Inline document</title><h1>Hello</h1>");
webview.reload();
webview.goBack();
webview.goForward();

const [canGoBack, canGoForward] = await Promise.all([
  webview.canGoBack(),
  webview.canGoForward(),
]);
console.log({ canGoBack, canGoForward });
```

`setNavigationRules(rules)` applies rules in native code. `*` is a wildcard,
`^` marks a blocking rule, and the last matching rule wins. With no matching
rule, navigation is allowed.

```typescript
import "electrobun/view";

const webview = document.querySelector("electrobun-webview");
if (!webview) throw new Error("The embedded webview was not found");

webview.setNavigationRules([
  "^*",
  "https://example.com/*",
  "https://cdn.example.com/*",
]);
```

An empty rules array restores the default allow behavior.

On macOS with the native WKWebView renderer, navigation rules apply to the
webview's main document. Child iframes can load under their own browser origin
and sandbox restrictions. They cannot call the webview's native bridge; use
`postMessage` to communicate with the parent document.

## Visibility And Input

The toggle methods accept an explicit state. Omit it to invert the current
state.

```typescript
import "electrobun/view";

const webview = document.querySelector("electrobun-webview");
if (!webview) throw new Error("The embedded webview was not found");

webview.toggleTransparent(true);
webview.togglePassthrough(true);
webview.toggleHidden(false);
webview.syncDimensions(true);

console.log({
  transparent: webview.transparent,
  passthrough: webview.passthroughEnabled,
  hidden: webview.hidden,
});
```

`syncDimensions(true)` forces an immediate geometry and mask update. Normal
layout changes are synchronized automatically.

## Mask Selectors

The native webview is a separate layer above the host page, so ordinary
`z-index` cannot place host DOM over it. A mask selector cuts rectangular
holes in the native layer. Matching host elements then remain visible and
receive input.

```html
<div class="toolbar">Host controls</div>
<electrobun-webview
  src="https://example.com"
  sandbox
  masks=".toolbar, .context-menu"
></electrobun-webview>
```

```typescript
import "electrobun/view";

const webview = document.querySelector("electrobun-webview");
if (!webview) throw new Error("The embedded webview was not found");

webview.addMaskSelector(".autocomplete");
webview.removeMaskSelector(".autocomplete");
console.log([...webview.maskSelectors]);
```

Each selector can match any number of elements. Invalid selectors are
ignored. Masks use bounding rectangles; rounded corners and partial alpha do
not alter the rectangular cutout.

On Linux, passthrough and mask punch-through are unavailable for embedded
views inside transparent `BrowserWindow`s. Use a non-transparent parent for
those overlays. On Windows, WebView2 does not honor these overlay operations;
set `bundleCEF: true` and use the CEF renderer when masks or passthrough are
required.

## Spell Check

```typescript
import "electrobun/view";

const webview = document.querySelector("electrobun-webview");
if (!webview) throw new Error("The embedded webview was not found");

const supported = await webview.setSpellCheck(true);
console.log({ supported, enabled: webview.spellCheckEnabled });
```

The promise resolves to `true` only when the current renderer supports the
change. Native WKWebView on macOS is currently supported; other renderers
return `false` without changing renderer state.

## Find And Developer Tools

```typescript
import "electrobun/view";

const webview = document.querySelector("electrobun-webview");
if (!webview) throw new Error("The embedded webview was not found");

webview.findInPage("Electrobun", { forward: true, matchCase: false });
webview.stopFindInPage();

webview.openDevTools();
webview.closeDevTools();
webview.toggleDevTools();

webview.executeJavascript("document.documentElement.dataset.embedded = 'true'");
```

## Events

Use `on` and `off` for custom-element events. A listener receives a
`CustomEvent`; payload shape depends on the native event.

```typescript
import "electrobun/view";

const webview = document.querySelector("electrobun-webview");
if (!webview) throw new Error("The embedded webview was not found");

const onNavigation = (event: CustomEvent) => {
  console.log("Navigation payload", event.detail);
};

webview.on("did-navigate", onNavigation);
webview.off("did-navigate", onNavigation);
```

Supported event names are:

- `will-navigate`
- `did-navigate`
- `did-navigate-in-page`
- `did-commit-navigation`
- `dom-ready`
- `host-message`
- `new-window-open`
- `download-started`
- `download-progress`
- `download-completed`
- `download-failed`
- `load-started`
- `load-committed`
- `load-finished`

Embedded content can emit a `host-message` from its preload script:

```javascript
window.__electrobunSendToHost({ type: "ready", documentTitle: document.title });
```

The host receives that value in the event detail. This event bridge remains
available in sandbox mode; Electrobun RPC does not.

## Properties

| Property | Type | Notes |
| --- | --- | --- |
| `webviewId` | `number \| null` | Native view ID after initialization. |
| `src` | `string \| null` | Attribute-backed URL. |
| `html` | `string \| null` | Attribute-backed inline HTML. |
| `preload` | `string \| null` | Attribute-backed preload source. |
| `renderer` | `"native" \| "cef"` | Attribute-backed renderer. |
| `sandbox` | `boolean` | Read-only initialized sandbox state. |
| `transparent` | `boolean` | Current transparency state. |
| `passthroughEnabled` | `boolean` | Current input passthrough state. |
| `spellCheckEnabled` | `boolean` | Requested spell-check state. |
| `hidden` | `boolean` | Current native visibility state. |
| `maskSelectors` | `Set<string>` | Active host-page mask selectors. |

The element also inherits standard `HTMLElement` properties such as `id`,
`style`, and `dataset`.

=== FILE: apis/browser/electrobun-wgpu-tag.mdx ===
---
title: "Electrobun WGPU Tag"
description: "Place a native WGPU surface inside a webview layout."
---

`<electrobun-wgpu>` places a native WGPU surface at an element's bounds. Use
the host document for layout and controls while a Zig, Rust, Go, Odin, Bun, or
Cottontail main process renders directly to the native surface.

Import `electrobun/view` once to register the element and its TypeScript DOM
types.

```html
<div class="toolbar">GPU controls</div>
<electrobun-wgpu
  id="scene"
  style="display: block; width: 100%; height: 480px"
></electrobun-wgpu>
```

```typescript
import type { WgpuTagElement } from "electrobun/view";
import "electrobun/view";

const surface = document.querySelector("electrobun-wgpu");
if (!surface) throw new Error("The WGPU surface was not found");

surface.on("ready", (event) => {
  const { id } = event.detail as { id: number };
  console.log("Native WGPU view ready", id);
});

const typedSurface: WgpuTagElement = surface;
void typedSurface;
```

The `ready` event reports the native `wgpuViewId`. Send that ID to the main
process through your application's RPC schema, then initialize the renderer
for that view.

## Attributes

| Attribute | Value | Purpose |
| --- | --- | --- |
| `transparent` | boolean attribute | Starts the native surface transparent. |
| `passthrough` | boolean attribute | Starts with pointer input passing through to the host page. |
| `hidden` | boolean attribute | Starts the native surface hidden. |
| `masks` | comma-separated selectors | Cuts holes for matching host elements. |

```html
<div class="toolbar">Host controls rendered over the surface</div>
<electrobun-wgpu
  transparent
  passthrough
  masks=".toolbar, .popover"
></electrobun-wgpu>
```

Boolean attributes configure the initial native view. Use the toggle methods
for runtime changes.

## Visibility And Input

Each toggle accepts an explicit state. Omit the argument to invert the current
state.

```typescript
import "electrobun/view";

const surface = document.querySelector("electrobun-wgpu");
if (!surface) throw new Error("The WGPU surface was not found");

surface.toggleTransparent(true);
surface.togglePassthrough(false);
surface.toggleHidden(false);
surface.syncDimensions(true);

console.log({
  transparent: surface.transparent,
  passthrough: surface.passthroughEnabled,
  hidden: surface.hidden,
});
```

Normal layout changes are synchronized automatically. Call
`syncDimensions(true)` when application code needs an immediate update.

## Masks

The WGPU surface is a native layer above the host webview. Host elements
cannot cross that layer with `z-index`; masks cut rectangular holes so the
matching host elements can render and receive input.

```typescript
import "electrobun/view";

const surface = document.querySelector("electrobun-wgpu");
if (!surface) throw new Error("The WGPU surface was not found");

surface.addMaskSelector(".context-menu");
surface.removeMaskSelector(".context-menu");
```

On Linux, passthrough and masks are unavailable inside transparent
`BrowserWindow`s because the transparent CEF host is rendered offscreen while
the WGPU surface is a native child window. Use a non-transparent parent or
keep interactive HTML outside the surface for that composition.

## Main-Process Surface

In a Bun or Cottontail main process, the tag-created native view is available
through `WGPUView`. `getById` normally finds it; `adoptExisting` attaches a
wrapper when it was created outside the current SDK object map.

```typescript
import { WGPUView, webgpu } from "electrobun/main";

export function createEmbeddedGpuContext(
  id: number,
  windowId: number,
  width: number,
  height: number,
) {
  const view =
    WGPUView.getById(id) ??
    WGPUView.adoptExisting(id, {
      windowId,
      autoResize: false,
      frame: { x: 0, y: 0, width, height },
    });

  if (!view) throw new Error(`WGPU view ${id} is unavailable`);
  return webgpu.createContext(view);
}
```

The native Zig, Rust, Go, and Odin SDKs receive the same view ID and expose
their own WGPU surface bridge. Start from the corresponding WGPU template for
a complete renderer with lifecycle and resize handling.

## Lifecycle

Removing the element destroys its native view. A later insertion creates a
new ID, so stop resources tied to the old surface and initialize them again on
the next `ready` event. Reconfigure the WebGPU context and recreate
size-dependent textures when dimensions change.

The `runTest()` method invokes Electrobun's native diagnostic renderer. It is
intended for framework and platform verification rather than application
render loops.

## Properties And Methods

| Member | Type | Purpose |
| --- | --- | --- |
| `wgpuViewId` | `number \| null` | Native view ID after initialization. |
| `transparent` | `boolean` | Current transparency state. |
| `passthroughEnabled` | `boolean` | Current input passthrough state. |
| `hidden` | `boolean` | Current native visibility state. |
| `toggleTransparent(value?)` | method | Sets or toggles transparency. |
| `togglePassthrough(value?)` | method | Sets or toggles input passthrough. |
| `toggleHidden(value?)` | method | Sets or toggles visibility. |
| `syncDimensions(force?)` | method | Synchronizes geometry and masks. |
| `addMaskSelector(selector)` | method | Adds a host-page mask selector. |
| `removeMaskSelector(selector)` | method | Removes a mask selector. |
| `on("ready", listener)` | method | Subscribes to initialization. |
| `off("ready", listener)` | method | Removes the exact listener. |
| `runTest()` | method | Runs the native diagnostic renderer. |

=== FILE: apis/browser/electroview-class.mdx ===
---
title: "Electroview"
description: "Connect a browser view to Electrobun's typed RPC transport."
---

`Electroview` is the browser-side SDK. Its primary job is to attach a typed RPC
object to the webview's encrypted loopback transport, with a native bridge as
fallback.

## Define A Shared Schema

An RPC schema has a `bun` side and a `webview` side. Requests have a typed
parameter and response; messages are one-way payloads.

```typescript
import type { RPCSchema } from "electrobun/view";

export type AppRPC = {
  bun: RPCSchema<{
    requests: {
      add: {
        params: { a: number; b: number };
        response: { sum: number };
      };
    };
    messages: {
      rendererReady: { title: string };
    };
  }>;
  webview: RPCSchema<{
    requests: {
      getDocumentTitle: {
        params: {};
        response: string;
      };
    };
    messages: {
      showStatus: { message: string };
    };
  }>;
};
```

Keep the schema in a module imported by both contexts. It contains types only
and emits no runtime code.

## Browser Side

Use `Electroview.defineRPC()` to provide handlers for the `webview` side, then
pass the returned object to the constructor. Calls can use the local `rpc`
variable immediately after construction.

```typescript
import { Electroview, type RPCSchema } from "electrobun/view";

type AppRPC = {
  bun: RPCSchema<{
    requests: {
      add: { params: { a: number; b: number }; response: { sum: number } };
    };
    messages: { rendererReady: { title: string } };
  }>;
  webview: RPCSchema<{
    requests: {
      getDocumentTitle: { params: {}; response: string };
    };
    messages: { showStatus: { message: string } };
  }>;
};

const rpc = Electroview.defineRPC<AppRPC>({
  maxRequestTime: 10_000,
  handlers: {
    requests: {
      getDocumentTitle: () => document.title,
    },
    messages: {
      showStatus: ({ message }) => console.log(message),
    },
  },
});

const view = new Electroview({ rpc });

const result = await rpc.request.add(
  { a: 9, b: 8 },
  { maxRequestTime: 5_000 },
);
rpc.send.rendererReady({ title: document.title });

console.log(result.sum);
void view;
```

`maxRequestTime` on `defineRPC` is the default request timeout in
milliseconds. The optional second argument to one request overrides it;
`Infinity` disables the timeout for that call.

## Main-Process Side

The same schema is attached to a `BrowserView` or `BrowserWindow` with
`BrowserView.defineRPC()`:

```typescript
import {
  BrowserView,
  BrowserWindow,
  type RPCSchema,
} from "electrobun/main";

type AppRPC = {
  bun: RPCSchema<{
    requests: {
      add: { params: { a: number; b: number }; response: { sum: number } };
    };
    messages: { rendererReady: { title: string } };
  }>;
  webview: RPCSchema<{
    requests: {
      getDocumentTitle: { params: {}; response: string };
    };
    messages: { showStatus: { message: string } };
  }>;
};

const rpc = BrowserView.defineRPC<AppRPC>({
  handlers: {
    requests: {
      add: ({ a, b }) => ({ sum: a + b }),
    },
    messages: {
      rendererReady: ({ title }) => console.log("Ready", title),
    },
  },
});

const win = new BrowserWindow({
  title: "Typed RPC",
  url: "views://main/index.html",
  rpc,
});

const title = await rpc.request.getDocumentTitle({});
rpc.send.showStatus({ message: `Loaded ${title}` });
void win;
```

The directions are deliberate:

- `bun.requests` execute in the main process and are called by the webview.
- `bun.messages` are received in the main process and sent by the webview.
- `webview.requests` execute in the browser and are called by the main process.
- `webview.messages` are received in the browser and sent by the main process.

## Empty RPC

The constructor still requires an RPC object when the view has no application
messages:

```typescript
import { Electroview, type RPCSchema } from "electrobun/view";

type EmptyRPC = {
  bun: RPCSchema<{ requests: {}; messages: {} }>;
  webview: RPCSchema<{ requests: {}; messages: {} }>;
};

const rpc = Electroview.defineRPC<EmptyRPC>({
  handlers: { requests: {}, messages: {} },
});

new Electroview({ rpc });
```

Importing the view SDK is not required merely to use preload-provided custom
elements or draggable regions. Construct `Electroview` when the page needs the
application RPC transport.

## Carrot Invocation

`view.carrots.invoke()` sends a request through the configured host RPC. It is
available only when the packaged host exposes the Carrot invocation handler.

```typescript
import { Electroview, type RPCSchema } from "electrobun/view";

type EmptyRPC = {
  bun: RPCSchema<{ requests: {}; messages: {} }>;
  webview: RPCSchema<{ requests: {}; messages: {} }>;
};

const rpc = Electroview.defineRPC<EmptyRPC>({
  handlers: { requests: {}, messages: {} },
});
const view = new Electroview({ rpc });

const result = await view.carrots.invoke<{ value: string }>(
  "com.example.settings",
  "read",
  { key: "theme" },
);
console.log(result.value);
```

Electrobun intentionally has no implicit browser-to-browser RPC. Route
communication through the main process or use an explicit web transport.

=== FILE: apis/browser/global-properties.mdx ===
---
title: "Global Properties"
description: "Public values injected into every Electrobun webview preload."
---

Electrobun injects these values before application scripts run. They do not
require an `Electroview` instance.

## `window.__electrobunWebviewId`

The numeric native ID of the current `BrowserView`.

```typescript
import "electrobun/view";

console.log("Current webview", window.__electrobunWebviewId);
```

## `window.__electrobunWindowId`

The numeric native ID of the containing window.

```typescript
import "electrobun/view";

console.log("Containing window", window.__electrobunWindowId);
```

## `window.__electrobunPlatform`

The native platform name: `"macos"`, `"windows"`, or `"linux"`.

```typescript
import "electrobun/view";

if (window.__electrobunPlatform === "macos") {
  document.documentElement.dataset.platform = "macos";
}
```

## `window.__electrobunSendToHost()`

Emits the value as a `host-message` event on the containing `BrowserView` or
`<electrobun-webview>` element. The event-only bridge remains available in a
sandboxed embedded webview.

```typescript
import "electrobun/view";

window.__electrobunSendToHost({
  type: "ready",
  title: document.title,
});
```

Other `__electrobun*` globals are transport implementation details. Do not use
them as application APIs; their names and shapes may change independently of
the public SDK.

=== FILE: apis/build-config.mdx ===
---
title: "BuildConfig"
description: "Read packaged build and runtime metadata in the main process."
---

`BuildConfig` reads `Resources/build.json` and `Resources/version.json`, then
caches the result.

```ts
import { BuildConfig } from "electrobun/main";

const config = await BuildConfig.get();

console.log(config.mainProcess);
console.log(config.defaultRenderer);
console.log(config.availableRenderers);
console.log(config.channel);
console.log(config.isPackaged);
```

## Access methods

- `await BuildConfig.get()` loads the files once and returns
  `Promise<BuildConfigType>`.
- `BuildConfig.getSync()` performs the first load synchronously when necessary.
- `BuildConfig.getCached()` returns `BuildConfigType | null` without loading.

```ts
import { BuildConfig } from "electrobun/main";

const startupConfig = BuildConfig.getSync();
const sameConfig = BuildConfig.getCached();

if (sameConfig?.availableRenderers.includes("cef")) {
  console.log("CEF is bundled");
}

void startupConfig;
```

Missing metadata falls back to a development configuration with the native
renderer only.

## Returned fields

| Field | Type | Meaning |
| --- | --- | --- |
| `mainProcess` | `"bun" \| "cottontail" \| "zig" \| "rust" \| "go" \| "odin" \| undefined` | Packaged main-process runtime; Bun by default, Cottontail experimental. |
| `defaultRenderer` | `"native" \| "cef"` | Renderer used when a window or view does not select one. |
| `availableRenderers` | `("native" \| "cef")[]` | Renderers included in the app bundle. |
| `buildEnvironment` | `"dev" \| "canary" \| "stable" \| undefined` | Environment recorded in `build.json`. |
| `channel` | `string` | Runtime release channel from `version.json`. |
| `isPackaged` | `boolean` | `false` only for the `dev` channel. |
| `chromiumFlags` | `Record<string, string \| boolean> \| undefined` | CEF switches selected for the target platform. |
| `autoGrantPermissions` | permission array or `undefined` | Windows WebView2 permissions included at build time. |
| `runtime` | object or `undefined` | Runtime options, including `exitOnLastWindowClosed` and custom values. |

## Renderer selection

```ts
import { BrowserWindow, BuildConfig } from "electrobun/main";

const build = BuildConfig.getSync();

const mainWindow = new BrowserWindow({
  title: "Default renderer",
  url: "views://main/index.html",
});

if (build.availableRenderers.includes("cef")) {
  const cefWindow = new BrowserWindow({
    title: "CEF renderer",
    url: "views://cef/index.html",
    renderer: "cef",
  });
  void cefWindow;
}

void mainWindow;
```

See [Build Configuration](/electrobun/apis/cli/build-configuration/) for the
settings that produce this metadata.

=== FILE: apis/bun.mdx ===
---
title: "Bun SDK Alias"
description: "Compatibility guidance for the deprecated electrobun/bun import path."
---

`electrobun/bun` is a deprecated alias for `electrobun/main`. It resolves to
the same SDK and remains supported for source compatibility. Only the SDK
namespace is deprecated: Bun remains a first-class main-process runtime and a
first-class `hutch.config.ts` package-manager selection.

Use the runtime-neutral namespace in new and migrated code:

```ts
import { BrowserWindow } from "electrobun/main";

const win = new BrowserWindow({
  title: "My app",
  url: "views://mainview/index.html",
});

void win;
```

See the [Main Process API](/electrobun/apis/main/) for the current API guide.

=== FILE: apis/bundled-assets.mdx ===
---
title: "Local Webview Assets"
description: "Load bundled and app-owned files through views:// and appdata://."
---
import { Aside, Tabs, TabItem } from "@astrojs/starlight/components";

Electrobun maps files under the packaged `Resources/app/views` directory to the
`views://` protocol. Use these URLs anywhere a webview accepts a normal URL.

## Configure a view

`build.views` bundles JavaScript or TypeScript entrypoints. `build.copy` copies
HTML, CSS, images, and other static files without transforming them.

```ts
import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "Assets Example",
    identifier: "dev.example.assets",
    version: "1.0.0",
  },
  build: {
    views: {
      mainview: {
        entrypoint: "src/mainview/index.ts",
      },
    },
    copy: {
      "src/mainview/index.html": "views/mainview/index.html",
      "src/mainview/style.css": "views/mainview/style.css",
      "src/mainview/logo.png": "views/mainview/logo.png",
    },
  },
} satisfies ElectrobunConfig;
```

The destination `views/mainview/index.html` becomes
`views://mainview/index.html` at runtime. View names are application-defined;
you can add as many entries as needed.

## Load bundled content

```ts
import { BrowserWindow } from "electrobun/main";

const mainWindow = new BrowserWindow({
  title: "Bundled content",
  url: "views://mainview/index.html",
  frame: { width: 800, height: 600 },
});

void mainWindow;
```

`BrowserWindow` takes the URL in its constructor. Loading a new URL later is a
`BrowserView` operation: `mainWindow.webview.loadURL(url)`.

## Reference assets from HTML and CSS

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Bundled content</title>
    <link rel="stylesheet" href="views://mainview/style.css" />
    <script type="module" src="views://mainview/index.js"></script>
  </head>
  <body>
    <img src="views://mainview/logo.png" alt="Application logo" />
  </body>
</html>
```

```css
body {
  background-image: url("views://mainview/logo.png");
}
```

Each configured view is emitted as `views/<view-name>/index.js`, independent of
the entrypoint's filename. In this example, the `mainview` entry becomes
`views/mainview/index.js`.

<Aside type="note">
`views://` is read-only packaged content. Store mutable application data under
`Utils.paths.userData`, `Utils.paths.userCache`, or another writable system
directory.
</Aside>

## Load mutable files with `appdata://`

`appdata://` maps to the app's fixed, writable `userData` directory. Its exact
OS-specific location is available as `Utils.paths.userData` in TypeScript and
the `userData` / `user_data` / `UserData` field of the native SDKs' resolved
paths. See [Paths](/electrobun/apis/paths/) for the directory layout.

Access is granted per webview and is disabled by default. Enable it when
creating the `BrowserWindow` or `BrowserView` that needs to read those files:

<Tabs syncKey="runtime">
<TabItem label="Cottontail">

```ts
import { BrowserWindow } from "electrobun/main";

const win = new BrowserWindow({
  url: "views://mainview/index.html",
  allowedProtocols: {
    appData: true,
  },
});
```

</TabItem>
<TabItem label="Bun">

```ts
import { BrowserWindow } from "electrobun/main";

const win = new BrowserWindow({
  url: "views://mainview/index.html",
  allowedProtocols: {
    appData: true,
  },
});
```

</TabItem>
<TabItem label="Zig">

```zig
var webview_options = electrobun.WebviewOptions{
    .window_id = window_id,
    .url = "views://mainview/index.html",
    .allowed_protocols = .{ .app_data = true },
};
const webview_id = try core.createWebview(webview_options);
```

</TabItem>
<TabItem label="Rust">

```rust
let mut webview_options = WebviewOptions::new(
    window_id,
    "views://mainview/index.html",
    Rect::new(0.0, 0.0, 800.0, 600.0),
);
webview_options.allowed_protocols = AllowedProtocols {
    views: true,
    app_data: true,
};
let webview_id = core.create_webview(webview_options)?;
```

</TabItem>
<TabItem label="Go">

```go
webviewOptions := electrobun.NewWebviewOptions(
    windowID,
    "views://mainview/index.html",
    electrobun.NewRect(0, 0, 800, 600),
)
webviewOptions.AllowedProtocols.AppData = true
webviewID, err := core.CreateWebview(webviewOptions)
```

</TabItem>
<TabItem label="Odin">

```odin
webview_options := electrobun.defaultWebviewOptions(window_id)
webview_options.url = "views://mainview/index.html"
webview_options.allowed_protocols.app_data = true
webview_id, webview_err := electrobun.createWebview(core, webview_options)
```

</TabItem>
</Tabs>

Files written beneath `userData` are then available to that webview as normal
web resources:

```html
<img src="appdata://images/avatar.png" alt="User avatar" />
```

```ts
const response = await fetch("appdata://documents/report.txt");
if (!response.ok) throw new Error("Could not load report");
const report = await response.text();
```

The protocol works from both `views://` pages and remote pages, and its
responses are CORS-enabled. Permission follows the webview, not the current
page's origin: if an enabled webview navigates to a remote URL, that remote
page can also request `appdata://` files.

<Aside type="caution">
Only enable `appData` on a webview whose content and navigation you trust. For
remote content, use a separate webview without this permission unless that
site is deliberately allowed to read the app's shared files.
</Aside>

Both `views://` and `appdata://` are confined to their respective roots.
Absolute paths, `..` traversal (including encoded traversal), and symlink
escapes outside the root are rejected.

## Protocol defaults

The complete per-webview option is:

```ts
type AllowedProtocols = {
  views?: boolean;   // defaults to true
  appData?: boolean; // defaults to false
};
```

Set `views: false` for a webview that should not be able to read packaged UI
assets. Unspecified properties retain their defaults.

=== FILE: apis/bundling-cef.mdx ===
---
title: "Bundling CEF"
description: "Ship Chromium Embedded Framework as an Electrobun renderer."
---

Electrobun uses the operating system webview by default: WKWebView on macOS,
WebView2 on Windows, and GTK WebKit on Linux. Bundling CEF ships a tested
Chromium renderer with the application for consistent browser behavior and
the native-layer features that require it.

CEF materially increases the application download and installed size. System
webviews remain the better default when their browser behavior and compositing
support meet the application's requirements.

## Configuration

Enable CEF independently for each target platform. `defaultRenderer` controls
the renderer used when a window or view does not set one explicitly.

```typescript
import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "CEF App",
    identifier: "com.example.cef-app",
    version: "1.0.0",
  },
  build: {
    mac: {
      bundleCEF: true,
      defaultRenderer: "cef",
    },
    win: {
      bundleCEF: true,
      defaultRenderer: "cef",
    },
    linux: {
      bundleCEF: true,
      defaultRenderer: "cef",
    },
  },
} satisfies ElectrobunConfig;
```

Hutch downloads Electrobun's pinned CEF artifact and packages its libraries,
helper processes, resources, and locales. A CEF renderer is unavailable when
`bundleCEF` is false.

## Select A Renderer

On macOS and Windows, a bundled application can mix native and CEF views.

```typescript
import { BrowserWindow } from "electrobun/main";

const browserWindow = new BrowserWindow({
  title: "Chromium Window",
  url: "views://main/index.html",
  frame: { width: 1200, height: 800 },
  renderer: "cef",
});

const settingsWindow = new BrowserWindow({
  title: "Native Settings",
  url: "views://settings/index.html",
  frame: { width: 800, height: 600 },
  renderer: "native",
});

void browserWindow;
void settingsWindow;
```

Embedded views accept the same renderer choice:

```html
<electrobun-webview
  src="https://example.com"
  renderer="cef"
  sandbox
  style="display: block; width: 100%; height: 500px"
></electrobun-webview>

<electrobun-webview
  src="https://example.org"
  renderer="native"
  sandbox
  style="display: block; width: 100%; height: 300px"
></electrobun-webview>
```

On Linux, the packaged native wrapper selects one webview implementation for
the process. When CEF is bundled, its views use CEF; without it, views use GTK
WebKit. Do not design a Linux window around mixed native and CEF children.

## Runtime Detection

Read the packaged renderer metadata instead of assuming a renderer exists:

```typescript
import { BuildConfig } from "electrobun/main";

const build = await BuildConfig.get();
console.log({
  defaultRenderer: build.defaultRenderer,
  availableRenderers: build.availableRenderers,
});

if (!build.availableRenderers.includes("cef")) {
  throw new Error("This application was built without CEF");
}
```

## Platform Guidance

### macOS

The native renderer is WKWebView and has the smallest distribution. Bundle
CEF when the application needs pinned Chromium behavior or CEF-specific
features. Both renderers can coexist in one process.

### Windows

The native renderer is WebView2, which is Chromium-based and updated by the
system. CEF is useful when the application must pin its browser version or use
Electrobun overlay behavior that WebView2 cannot provide. In particular,
`<electrobun-webview>` masks and input passthrough require CEF on Windows.

### Linux

GTK WebKit keeps the bundle small. CEF is recommended for consistent Chromium
behavior and native overlay compositing. A transparent CEF `BrowserWindow` has
additional passthrough and mask limitations documented on the
[`<electrobun-webview>` page](/electrobun/apis/browser/electrobun-webview-tag).

## Chromium Flags

Set CEF command-line flags per platform with `chromiumFlags`. Keys omit the
`--` prefix; values are strings, `true`, or `false`.

```typescript
import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "CEF Debug App",
    identifier: "com.example.cef-debug-app",
    version: "1.0.0",
  },
  build: {
    mac: {
      bundleCEF: true,
      chromiumFlags: {
        "show-paint-rects": true,
        "user-agent": "CEF Debug App/1.0",
      },
    },
  },
} satisfies ElectrobunConfig;
```

Development builds automatically expose CEF debugging on an available local
port. Packaged canary and stable builds disable it unless an explicit
`"remote-debugging-port"` is configured. See [Build
Configuration](/electrobun/apis/cli/build-configuration#chromium-flags) for
the security and override details.

=== FILE: apis/cli/build-configuration.mdx ===
---
title: "Build Configuration"
description: "Reference for electrobun.config.ts and Hutch's build lifecycle."
---

`electrobun.config.ts` is a TypeScript module in the project root. With Hutch
0.30.0-canary.4 or later, Hutch evaluates its default export with Bun by default
and merges it with Electrobun's defaults.
Use `satisfies ElectrobunConfig` so unsupported fields and values fail during
development. Electrobun release overrides, tasks, and package-manager selection
belong in `hutch.config.ts`; the release and external package-manager fields are
optional. This file owns the app, build, tool overrides, and distribution
description.

Bun is the default `build.mainProcess`. Use `build.bun` for its entrypoint and
bundler options. Cottontail is experimental and requires an explicit
`mainProcess: "cottontail"` selection with a `build.cottontail.entrypoint`.
Cottontail-only capability and bytecode options do not apply to Bun. See the
[migration guide](/electrobun/guides/migrating-to-v2/) for existing configurations.
The same Bun default applies to `hutch.config.ts`, scripts, tests, hooks, and
build helpers. Set `HUTCH_RUNTIME=cottontail` to opt into experimental Cottontail
for those operations. A `cottontail=...` version pragma alone does not select
that runtime, and Hutch's runtime selection does not change `build.mainProcess`.

```typescript
import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "My App",
    identifier: "com.example.my-app",
    version: "1.0.0",
  },
  build: {
    mainProcess: "bun",
    bun: {
      entrypoint: "src/bun/index.ts",
    },
    views: {
      main: {
        entrypoint: "src/mainview/index.ts",
      },
    },
    copy: {
      "src/mainview/index.html": "views/main/index.html",
      "src/mainview/index.css": "views/main/index.css",
    },
  },
  runtime: {
    exitOnLastWindowClosed: true,
  },
} satisfies ElectrobunConfig;
```

Run `hutch electrobun config --env=dev` to inspect the merged configuration
that Hutch will use.

## Electrobun Devkit

`hutch.config.ts` may set `electrobun.version` to an exact release such as
`2.0.0` or `2.1.0-beta.3`. That optional pin wins over the npm bootstrap's
paired release default or a direct Hutch invocation's floating channel. The
application version in `app.version` remains independent.

Hutch resolves and verifies the selected release under
`~/.hutch/releases/electrobun`, then copies its config types and language SDKs
into the generated project `.hutch/devkit` sysroot. Run
`hutch electrobun prepare` to materialize or refresh that project copy without
building or advancing a valid floating projection. `build`, `run`, and `dev`
prepare implicitly. Run `hutch electrobun update` to move an existing exact pin
to the latest stable release and sync the app; use `hutch electrobun sync` when
you deliberately want an unpinned direct-Hutch project to follow the current
release channel head. See
[Project Ownership and the Devkit](/electrobun/guides/project-ownership/) for
the config responsibility table, generated-state lifecycle, and
external-bundler aliases.

## Application Metadata

`app` is required.

| Field | Type | Purpose |
| --- | --- | --- |
| `name` | `string` | Display name and base artifact name. |
| `identifier` | `string` | Platform application identifier, normally reverse-DNS. |
| `version` | `string` | Application version written into release metadata. |
| `description` | `string?` | Human-readable description. |
| `urlSchemes` | `string[]?` | Custom URL schemes on macOS. |
| `fileAssociations` | `FileAssociation[]?` | Document associations on macOS. |

### URL Schemes

Custom URL schemes are currently registered on macOS. Install the built app
in `/Applications` or `~/Applications` so Launch Services can register it.

```typescript
import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "Link Receiver",
    identifier: "com.example.link-receiver",
    version: "1.0.0",
    urlSchemes: ["link-receiver", "link-receiver-dev"],
  },
} satisfies ElectrobunConfig;
```

Handle the resulting URL in the main process:

```typescript
import Electrobun from "electrobun/main";

Electrobun.events.on("open-url", (event) => {
  const url = new URL(event.data.url);
  console.log(url.protocol, url.pathname);
});
```

### File Associations

File associations are currently packaged on macOS. Extensions do not include
the leading dot. An optional icon must be an `.icns` source file.

```typescript
import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "Document Editor",
    identifier: "com.example.document-editor",
    version: "1.0.0",
    fileAssociations: [
      {
        name: "Example Document",
        ext: ["example", "example-project"],
        role: "Editor",
        icon: "assets/example-document.icns",
      },
    ],
  },
} satisfies ElectrobunConfig;
```

Opened files arrive through `open-url` as `file:` URLs.

```typescript
import Electrobun from "electrobun/main";

Electrobun.events.on("open-url", (event) => {
  const url = new URL(event.data.url);
  if (url.protocol === "file:") {
    console.log("Opened file", decodeURIComponent(url.pathname));
  }
});
```

Windows and Linux URL schemes and file associations are not yet implemented.

## Main Process

`build.mainProcess` selects the runtime and compiler. It defaults to
`"bun"`.

| Value | Configuration | Project build input |
| --- | --- | --- |
| `cottontail` | `build.cottontail` | `src/bun/index.ts` |
| `bun` | `build.bun` | `src/bun/index.ts` |
| `zig` | `build.zig` | project `build.zig` |
| `rust` | `build.rust` | `Cargo.toml`, binary target `main` |
| `go` | `build.go` | `go.mod`, package `./src/go` |
| `odin` | `build.odin` | package containing `src/odin/main.odin` |

```typescript
import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "Native Example",
    identifier: "com.example.native",
    version: "1.0.0",
  },
  build: {
    mainProcess: "zig",
    zig: { version: "0.17.0" },
  },
} satisfies ElectrobunConfig;
```

Each selected Electrobun release declares default Zig, Rust, Go, and Odin
versions. The matching `build.zig.version`, `build.rust.version`,
`build.go.version`, or `build.odin.version` field is an exact per-project
override. Hutch reuses exact matching system compilers where supported, or
stores the selected compiler under
`~/.hutch/toolchains/<language>/<version>/<platform>`.

Native build descriptions remain project-owned:

- Zig: `build.zig`; Hutch passes `-Delectrobun-sdk=<project>/.hutch/devkit/zig-sdk/electrobun.zig`.
- Rust: `Cargo.toml` and `Cargo.lock`; configure `manifest` (default
  `Cargo.toml`) and `binary` (default `main`). A local dependency may point to
  `.hutch/devkit/rust-sdk`.
- Go: `go.mod` and `go.sum`; configure `package` (default `./src/go`). Use
  `require electrobun v0.0.0` and
  `replace electrobun => ./.hutch/devkit/go-sdk` in the module root.
- Odin: normal source package; `entrypoint` defaults to
  `src/odin/main.odin`, and Hutch passes the projected `electrobun_sdk`
  collection. No `build.odin` is generated or required.

Hutch invokes the normal project build tool. It does not generate `build.zig`,
Cargo manifests, Go modules, or a temporary GOPATH.

Hutch builds for the current host platform and architecture. Use native CI
runners when producing the macOS, Windows, and Linux release matrix.

## `build.cottontail`

| Field | Type | Default | Purpose |
| --- | --- | --- | --- |
| `entrypoint` | `string` | `"src/bun/index.ts"` | Main-process source entrypoint. |
| `capabilities` | `string[]` | `[]` | Additional capability modules to package when dynamic usage cannot be found by the bundle scan. |
| `bytecode` | `false \| true \| "obfuscate"` | `false` | Precompile the main process; this option is declared but not yet wired. |

The JavaScript bundler options described below can also be set in this object.

### Capability Modules

Cottontail keeps optional standard-library APIs outside its core executable and
loads each capability on demand through module imports or `Cottontail.*`
namespace access. When `build.mainProcess` is `"cottontail"`, Hutch scans the
final tree-shaken main-process bundle for recognized `bun:*`, `node:*`, and
`Cottontail.*` references. It packages the core runtime plus the selected
capability bytecode and native libraries, including transitive dependencies
declared by the runtime's capability manifest. Each build reports the automatic
result:

```text
hutch electrobun: Cottontail capabilities discovered by scan: [sqlite, compression]
```

This message contains the scan result only. Explicit configuration entries are
merged afterward, followed by dependency expansion. This is not a complete
inventory of the packaged runtime.

Detection matches known text in the bundle rather than evaluating JavaScript.
For example, `bun:sqlite`, `node:sqlite`, and `Cottontail.sqlite` select
`sqlite`; `node:zlib` and `Cottontail.compression` select `compression`.
The scan includes bundled dependency code, but cannot reliably infer aliased
or destructured namespaces, computed property access, or code loaded later.
Global Bun compatibility APIs are not all scan markers: `Bun.SQL` alone, for
example, needs an explicit `sql` include or a recognized `bun:sql` import.

Set `build.cottontail.capabilities` when a capability is reached through a
computed dynamic import, generated source, a plugin loader, or another path the
bundle scan cannot see. These entries are additive: Hutch still includes every
capability found by its scan. An empty list does not disable detection, and
the list cannot exclude automatically selected modules. This is a packaging
setting, not a runtime permission policy, and does not change Hutch's build-time
runtime or a Bun main process.

```typescript
import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "Dynamic Modules",
    identifier: "com.example.dynamic-modules",
    version: "1.0.0",
  },
  build: {
    mainProcess: "cottontail",
    cottontail: {
      entrypoint: "src/bun/index.ts",
      capabilities: ["sqlite", "compression"],
    },
  },
} satisfies ElectrobunConfig;
```

Supported capability names are `archive`, `bake`, `build`, `colors`,
`compression`, `cookies`, `csrf`, `data`, `ffi`, `filesystemRouter`, `glob`,
`hashing`, `htmlRewriter`, `inspector`, `jscTools`, `json5`, `markdown`,
`password`, `redis`, `repl`, `s3`, `sea`, `secrets`, `shell`, `sql`, `sqlite`,
`terminal`, `test`, `text`, `toml`, `uuid`, `websocket`, and `yaml`. Unknown
names fail the build. If an omitted capability is reached at runtime,
Cottontail's error identifies the missing name and points back to
`build.cottontail.capabilities`.

## Bytecode And Obfuscation

The precompiled standard-library capability modules above are already packaged
by Hutch. The setting below concerns compilation of your application's own
main-process source, which is separate.

`build.cottontail.bytecode` is declared in the configuration type but has no
effect on application packaging. Its accepted values are `false` (the default),
`true`, and `"obfuscate"`; all currently ship normal source in dev, canary, and
stable builds. Setting it does not improve startup time or remove source from
the bundle. It does not apply to Bun main processes.

## JavaScript Bundling

Hutch owns the output path, platform, and base format for Cottontail, Bun, and
view bundles. The following serializable options are currently forwarded to
Cottontail's build API:

| Option | Type | Applies to |
| --- | --- | --- |
| `minify` | `boolean` | main process and views |
| `sourcemap` | `boolean \| "inline" \| "external" \| "linked"` | main process and views |
| `target` | `string \| string[]` | main process and views |
| `external` | `string[]` | main process and views |
| `define` | `Record<string, string>` | main process and views |
| `alias` | `Record<string, string>` | main process and views |
| `format` | `"esm" \| "cjs" \| "iife"` | views only |

Config is serialized while Hutch loads it. Function-valued bundler plugins
cannot cross that boundary and are not currently supported in
`electrobun.config.ts`. Framework templates that need plugin transforms run
their own Vite build and copy its output.

```typescript
import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "Bundled App",
    identifier: "com.example.bundled-app",
    version: "1.0.0",
  },
  build: {
    cottontail: {
      entrypoint: "src/bun/index.ts",
      minify: true,
      sourcemap: "linked",
      external: ["optional-native-module"],
      define: {
        "process.env.APP_EDITION": '"desktop"',
      },
      alias: {
        "@shared": "./src/shared/index.ts",
      },
    },
    views: {
      main: {
        entrypoint: "src/mainview/index.ts",
        minify: true,
        sourcemap: "linked",
        format: "esm",
      },
    },
  },
} satisfies ElectrobunConfig;
```

## Static Files And Output

`build.copy` maps project-relative source paths to safe relative paths inside
the packaged application resources. `buildFolder` and `artifactFolder` are
also project-relative. Nested paths are supported, but absolute paths, empty
paths, and `.` or `..` path components are rejected before Hutch creates,
copies, or removes output files.

| Field | Type | Default |
| --- | --- | --- |
| `copy` | `Record<string, string>` | `{}` |
| `buildFolder` | `string` | `build` |
| `artifactFolder` | `string` | `artifacts` |

```typescript
import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "Packaged App",
    identifier: "com.example.packaged-app",
    version: "1.0.0",
  },
  build: {
    copy: {
      "src/mainview/index.html": "views/main/index.html",
      "assets": "assets",
    },
    buildFolder: "build",
    artifactFolder: "artifacts",
  },
} satisfies ElectrobunConfig;
```

## Watch Mode

`hutch electrobun dev --watch` derives watch roots from configured source and
native build inputs, view entrypoints, and copy sources. Add other source
locations with `build.watch`; suppress generated or high-churn paths with
`build.watchIgnore`. `build`, `artifacts`, and
`node_modules` are always ignored.

Watch mode rebuilds and relaunches the whole app; it is distinct from
webview-only hot module replacement. See [Hot Reloading](/electrobun/guides/hot-reloading/)
for the main-process, Vite, and Electrobun UI reload boundaries.

```typescript
import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "Watched App",
    identifier: "com.example.watched-app",
    version: "1.0.0",
  },
  build: {
    watch: ["scripts", "vendor/native-library"],
    watchIgnore: ["**/*.generated.*", "data/cache/**"],
  },
} satisfies ElectrobunConfig;
```

## Platform Options

### macOS

| Field | Type | Default |
| --- | --- | --- |
| `codesign` | `boolean` | `false` |
| `createDmg` | `boolean` | `true` |
| `notarize` | `boolean` | `false` |
| `bundleCEF` | `boolean` | `false` |
| `bundleWGPU` | `boolean` | `false` |
| `defaultRenderer` | `"native" \| "cef"` | `"native"` |
| `chromiumFlags` | `Record<string, string \| boolean>` | none |
| `entitlements` | `Record<string, boolean \| string \| string[]>` | JIT defaults |
| `icons` | `string` | `icon.iconset` |

On macOS, `bundleWGPU` also bundles the [Electrobun UI](/electrobun/guides/electrobun-ui/)
engine (`libElectrobunUI.dylib`) next to Dawn.

An icon source can be an `.iconset` directory or an Icon Composer `.icon`
file. `notarize` requires signing credentials; see [Code
Signing](/electrobun/guides/code-signing).

### Windows

| Field | Type | Default |
| --- | --- | --- |
| `bundleCEF` | `boolean` | `false` |
| `bundleWGPU` | `boolean` | `false` |
| `defaultRenderer` | `"native" \| "cef"` | `"native"` |
| `chromiumFlags` | `Record<string, string \| boolean>` | none |
| `autoGrantPermissions` | `WindowsWebView2Permission[]` | `[]` |
| `icon` | `string` | none |

`autoGrantPermissions` applies to every origin in native WebView2 views and
does not affect CEF. Grant only capabilities the application intentionally
delegates to its web content.

### Linux

| Field | Type | Default |
| --- | --- | --- |
| `bundleCEF` | `boolean` | `false` |
| `bundleWGPU` | `boolean` | `false` |
| `defaultRenderer` | `"native" \| "cef"` | `"native"` |
| `chromiumFlags` | `Record<string, string \| boolean>` | none |
| `icon` | `string` | none |
| `flatpak` | `FlatpakConfig` | disabled |

Flatpak mode writes an expanded `flatpak-builder` manifest and `/app` payload;
Hutch does not invoke `flatpak-builder` itself.

```typescript
import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "Cross Platform App",
    identifier: "com.example.cross-platform",
    version: "1.0.0",
  },
  build: {
    mac: {
      bundleCEF: true,
      bundleWGPU: true,
      defaultRenderer: "cef",
      codesign: true,
      notarize: true,
      icons: "App.icon",
    },
    win: {
      bundleCEF: true,
      bundleWGPU: true,
      defaultRenderer: "cef",
      autoGrantPermissions: ["camera", "microphone"],
      icon: "assets/icon.ico",
    },
    linux: {
      bundleCEF: true,
      bundleWGPU: true,
      defaultRenderer: "cef",
      icon: "assets/icon.png",
      flatpak: {
        enabled: true,
        runtimeVersion: "25.08",
      },
    },
  },
} satisfies ElectrobunConfig;
```

## Chromium Flags

`chromiumFlags` is used only by CEF. Keys omit the `--` prefix. A `true` value
adds a switch, a string adds a switch with a value, and `false` suppresses an
Electrobun default with the same name.

```typescript
import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "CEF App",
    identifier: "com.example.cef-app",
    version: "1.0.0",
  },
  build: {
    mac: {
      bundleCEF: true,
      chromiumFlags: {
        "show-paint-rects": true,
        "user-agent": "CEF App/1.0",
        "disable-gpu": false,
      },
    },
  },
} satisfies ElectrobunConfig;
```

Development CEF builds automatically select an available loopback debugging
port from 9222 through 9232. Canary and stable builds disable remote
debugging unless `"remote-debugging-port"` is set to a string port from 1024
through 65535. Set it to `false` to disable the dev endpoint too.

`ELECTROBUN_CEF_REMOTE_DEBUGGING_PORT` can override this for one launch. Set it
to a port, or to `0`, `off`, or `false` to disable the endpoint.

## Runtime Values

The `runtime` object is copied into `build.json`. `exitOnLastWindowClosed`
defaults to `true`; set it to `false` for tray and background applications.
Additional JSON-compatible values are available through `BuildConfig`.

```typescript
import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "Background App",
    identifier: "com.example.background-app",
    version: "1.0.0",
  },
  runtime: {
    exitOnLastWindowClosed: false,
    serviceEndpoint: "https://api.example.com",
  },
} satisfies ElectrobunConfig;
```

```typescript
import { BuildConfig } from "electrobun/main";

const config = await BuildConfig.get();
console.log(config.runtime?.serviceEndpoint);
```

## Build Hooks

Hook paths are relative to the project root. Hutch transpiles each TypeScript
or JavaScript file and executes it with the pinned host-platform Bun binary
by default. Set `HUTCH_RUNTIME=cottontail` to use experimental Cottontail for hooks.

| Hook | Timing |
| --- | --- |
| `preBuild` | Before any application build work. |
| `postBuild` | After main process, views, copied assets, and Carrot output are built. |
| `postWrap` | After a non-dev release wrapper is assembled, before final packaging/signing. |
| `postPackage` | After dev output or all release artifacts are complete. |

```typescript
import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "Hooked App",
    identifier: "com.example.hooked-app",
    version: "1.0.0",
  },
  scripts: {
    preBuild: "./scripts/pre-build.ts",
    postBuild: "./scripts/post-build.ts",
    postWrap: "./scripts/post-wrap.ts",
    postPackage: "./scripts/post-package.ts",
  },
} satisfies ElectrobunConfig;
```

All hooks inherit the process environment and receive:

- `ELECTROBUN_BUILD_ENV`: `dev`, `canary`, or `stable`
- `ELECTROBUN_OS`: `macos`, `linux`, or `win`
- `ELECTROBUN_ARCH`: `x64` or `arm64`
- `ELECTROBUN_BUILD_DIR`
- `ELECTROBUN_ARTIFACT_DIR`
- `ELECTROBUN_APP_NAME`
- `ELECTROBUN_APP_VERSION`
- `ELECTROBUN_APP_IDENTIFIER`

`postWrap` also receives `ELECTROBUN_WRAPPER_BUNDLE_PATH`. `postBuild`
receives `ELECTROBUN_CARROT_DIR` when the build produced a Carrot.

```typescript
import { cpSync, existsSync } from "node:fs";
import { join } from "node:path";

const wrapper = process.env.ELECTROBUN_WRAPPER_BUNDLE_PATH;
if (!wrapper) throw new Error("This hook requires a release wrapper");

const source = "assets/release-only";
if (existsSync(source)) {
  cpSync(source, join(wrapper, "Contents", "Resources", "release-only"), {
    recursive: true,
  });
}
```

The path layout in that example is macOS-specific; branch on `ELECTROBUN_OS`
for a cross-platform hook.

## Release Configuration

| Field | Default | Purpose |
| --- | --- | --- |
| `baseUrl` | Unset | Artifact folder for a static host; optional verified custom HTTPS origin for managed hosting. |
| `managed.appId` | Unset | Opt into Electrobun Managed Deploys with the app ID from Dash. |
| `managed.apiUrl` | `https://api.electrobun.dev` | Advanced management API override for staging/local testing. |
| `updateAuthority` | `"direct"` | `"external"` or `"none"` disables the direct updater; neither implements a store update integration. |
| `generatePatch` | `true` | Generate a delta from the previously published full archive. Set `false` to skip downloading and diffing it during a local packaged build. |

For a static host, `release.baseUrl` is the shared folder containing every
target's original artifact filenames:

```typescript
import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "Released App",
    identifier: "com.example.released-app",
    version: "2.0.0",
  },
  release: {
    baseUrl: "https://releases.example.com/released-app/",
    generatePatch: true,
  },
} satisfies ElectrobunConfig;
```

For [Managed Deploys](/electrobun/guides/managed-deploys/), set
`release.managed.appId` instead. The public update URL is derived automatically;
no custom domain or explicit API URL is required. Managed canary names and
identifiers are derived from the base app configuration. Stable and canary
remain separate builds.

With managed hosting, an optional `baseUrl` must be a verified HTTPS origin on
the standard port, without a path, credentials, query, or fragment. Insights
for the same app inherits this custom origin unless its own `apiUrl` overrides
it. A static host's `baseUrl` may include a folder path. Neither hosting choice
requires Insights. See [Updates](/electrobun/guides/updates/) for the unchanged
static-host publishing protocol.

## Insights Configuration

[Electrobun Insights](/electrobun/guides/insights/) is independent of release
hosting and is off by default on every channel.

| Field | Default | Purpose |
| --- | --- | --- |
| `insights.appId` | Required when `insights` is present | Public app ID from Dash; use the same ID as managed hosting when both are configured. |
| `insights.enabled` | `false` | Initial collection preference. A persisted runtime `setEnabled` choice overrides this build default. |
| `insights.apiUrl` | Hosted API, or the matching managed custom origin | Advanced ingestion API override for staging/local testing. |

```typescript
import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "My App",
    identifier: "com.example.my-app",
    version: "2.0.0",
  },
  insights: {
    appId: "YOUR_APP_ID",
    enabled: false,
  },
} satisfies ElectrobunConfig;
```

This prepares the client for an explicit runtime enablement. Omitting the entire
`insights` block leaves it unconfigured. Setting `enabled: true` explicitly
enables collection by default, subject to the persisted runtime choice. The app
owns that policy and its settings UI, including whether canary and stable use
different defaults. See the [channel-specific example](/electrobun/guides/insights/#choose-defaults-by-build-channel).
`enabled: false` is a build default; `setEnabled(false)` changes the effective
local setting and stops both basic and custom events. Never put a deploy API
key in app configuration.

`release.managed.apiUrl` does not supply the Insights override: set both
overrides when testing both services against staging. Dev collection requires
explicit `enabled: true` and a loopback HTTP endpoint; the hosted service does
not ingest dev builds. Disabling direct updates with `updateAuthority` does not
disable Insights.

## Carrot Packaging

`build.carrot` produces a Carrot artifact in addition to the standalone app.
Set `carrotOnly: true` to omit the standalone application. The object accepts
an ID, display name, optional description and mode, dependencies, remote/slate
UI definitions, and file-activator contributions. `bunny.carrot.dependencies`
declares dependencies used when the same project is distributed through Bunny
Ears.

=== FILE: apis/cli/cli-args.mdx ===
---
title: "Hutch Commands"
description: "Command reference for building and running Electrobun applications with Hutch."
---

Hutch is Electrobun 2.x's native build and workspace CLI. Install it globally,
or use the single dependency-free `electrobun` npm bootstrap that downloads,
verifies, and caches its paired Hutch archive from the Electrobun GitHub
Release. Run `hutch electrobun ...` directly with the global installation or
`electrobun ...` through the project dependency, from the project root.

## `hutch electrobun init`

Create a project from the current Electrobun template catalog.

```bash
# Interactive project name and template selection
hutch electrobun init

# Select a template directly
hutch electrobun init my-app --template=hello-world

# Use the beta template catalog
hutch electrobun init my-app --template=solid --beta

# Select stable instead of the invoking launcher's default catalog
hutch electrobun init my-app --template=solid --channel=stable

# Leave the template's install task for later
hutch electrobun init my-app --template=solid --skip-install
```

Usage:

```text
hutch electrobun init [project-name] [--template=name]
  [--channel=stable|beta] [--beta] [--skip-install]
```

Without `--template`, Hutch displays an interactive arrow-key selector. The
stable and beta catalogs are published independently. Direct Hutch invocation
chooses the catalog associated with the invoking launcher unless `--channel` or
the `--beta` shorthand selects one explicitly. The thin npm bootstrap adds
`--channel=stable` when no template channel was requested. `production` and
`canary` are also accepted as template channel names.

The template channel and Hutch's own release channel are independent. A beta
catalog can require a stable Hutch release; `--beta` does not mean that
`hutch-canary` is required. When the current toolchain is incompatible with the
catalog, `init` downloads and uses the exact Hutch release listed in that catalog.
Older Hutch installations that report a minimum-version error need an upgrade
before retrying.

The publisher guarantees that a published template's exact Electrobun pin
matches its catalog. After extracting it, `init` uses that release for its
initial core/devkit sync. An unpinned hand-written template instead uses the
npm-paired Electrobun default when supplied, otherwise the selected catalog
release. It also prepares any required native toolchain. If the template defines
an `install` task in
`hutch.config.ts`, `init` then runs it. `--skip-install` leaves that task for
later. Init always requires network access: Hutch fetches the current template
catalog and selected template instead of keeping persistent copies of either
one.

## `hutch electrobun config`

Load `electrobun.config.ts` and print the normalized build configuration. This
is useful for validating a dynamically constructed config without building.

```bash
hutch electrobun config --env=dev
hutch electrobun config --env=stable
```

## `hutch electrobun prepare`

Resolve the Electrobun release, verify and install its platform core archive
under `~/.hutch/releases/electrobun`, atomically refresh the project's generated
`.hutch/devkit` SDK projection, and resolve the configured native compiler
toolchain without building the application. An exact `electrobun.version` pin
wins; otherwise an npm command uses its package-paired default, then an existing
valid project projection wins, and only an unprepared direct-Hutch project
consults the active release channel:

```bash
hutch electrobun prepare
hutch electrobun prepare --env=stable
```

`build`, `run`, and `dev` perform the same non-advancing preparation implicitly.
Use the explicit command before Vite, editor tooling, or a standalone typecheck,
after changing an exact pin, or before a build that will later run without
network access. Preparation can reuse exact releases and managed toolchains
that are already installed; anything missing requires a network lookup and
download.

## `hutch electrobun update`

Upgrade a pinned app to the latest stable Electrobun release:

```bash
hutch electrobun update
```

Hutch searches upward from the current app directory for the nearest
`hutch.config.ts`, resolves the stable release catalog to an exact version,
safely rewrites its existing exact `electrobun.version` string literal, and
then runs the normal sync path for the current app. Stable is explicit: an
active canary/beta channel does not change the update target.

The command requires network access. It fails closed when there is no parent
Hutch config, no exact pin, or the pin is computed or ambiguous; edit those
non-canonical configurations manually before retrying.

## `hutch electrobun sync`

Perform the same project preparation, but deliberately advance an unpinned
direct-Hutch project to the active release channel head instead of preserving
its current valid projection. Exact `electrobun.version` and npm-paired defaults
remain authoritative:

```bash
hutch electrobun sync
hutch electrobun sync --env=stable
```

Use `sync` when you intend to change the selected floating release. `init`
performs an initial sync to a published template's exact pin; npm or catalog
defaults apply only to an unpinned template.

## `hutch electrobun build`

Build the application for the current host platform and architecture.

```bash
hutch electrobun build --env=dev
hutch electrobun build --env=canary
hutch electrobun build --env=stable
```

| Environment | Result |
| --- | --- |
| `dev` | Runnable inner app bundle with terminal diagnostics; no distribution artifacts |
| `canary` | Optimized canary app, wrapper, update metadata, and platform installer |
| `stable` | Optimized stable app, wrapper, update metadata, and platform installer |

Canary app names include `-canary`. Production names are unsuffixed. Signing,
notarization, patch generation, CEF, WGPU, and installer behavior come from
`electrobun.config.ts`.

`stable` is the canonical main release environment. Canary remains a separate
release channel.

Hutch does not cross-compile an Electrobun release. Run the command on native
macOS, Windows, and Linux CI workers for a complete matrix.

## `hutch electrobun upload`

Stage the existing artifact folder in
[Electrobun Managed Deploys](/electrobun/guides/managed-deploys/):

```sh
hutch electrobun build --env=canary
hutch electrobun upload --dry-run
hutch electrobun upload
```

Upload infers the channel, version, and targets from the generated files and
manifests. Every runner contributes to the same `<channel>-<version>` release.
It does not need a target list or `--env`, and uploading does not publish.
Only stable/canary artifacts are supported; dev builds produce none.

| Option | Purpose |
| --- | --- |
| `--artifacts=<folder>` | Read a copied or nondefault artifact folder. Keep its generated `managed-deploy.json` sidecar. |
| `--app=<id>` | Supply the managed app ID when generated public defaults are not available. `ELECTROBUN_APP_ID` also supplies it. |
| `--release=<id>` | Optional check: it must match the inferred `<channel>-<version>`. It cannot create an alternate release for the same version. |
| `--api-url=<origin>` | Override the management API for local/staging testing. |
| `--api-key=<key>` | Supply an app-scoped deploy key. `ELECTROBUN_API_KEY` is the usual CI/environment alternative. |
| `--dry-run` | Validate and print the local inventory without uploading. |

Hutch uploads bytes directly to R2 using scoped signed URLs. Retrying the same
command resumes an interrupted upload. The command runs in Hutch's Zig core
without evaluating the project config, installing packages, or running a
JavaScript runtime. Builds write the public defaults used by this command;
deploy credentials stay in the calling environment.

`hutch electrobun deploy` is an alias for upload.

## `hutch electrobun publish`

Validate and publish an already uploaded release:

```sh
hutch electrobun publish --app=YOUR_APP_ID --release=canary-2.0.0 --audience=prerelease --dry-run
hutch electrobun publish --app=YOUR_APP_ID --release=canary-2.0.0 --audience=prerelease
hutch electrobun publish --app=YOUR_APP_ID --release=canary-2.0.0 --audience=public
```

`--release` is required; use the release ID reported by upload. The audience
is `prerelease` or `public` (the default). Prerelease selects the app's enrolled
installation IDs; public selects ordinary installs on that release's channel.
Neither audience can change a stable build into a canary build or vice versa.

This command uses the same app, API, and key options as upload. Its `--dry-run`
reads and checks the server's release without changing routing. The final CI
job needs only Hutch, the app/release IDs, and the deploy key; it does not need
artifacts, a project checkout, or a package runner. Make it depend on every
intended build/upload job completing successfully. The dashboard provides the
same publication actions.

A release becomes closed to uploads after publication to either audience.
Changed builds need a new version. See the
[publication flow](/electrobun/guides/managed-deploys/#publish-after-all-uploads-finish)
for release review, prerelease groups, and retained patch files.

## `hutch electrobun run`

Launch an existing application bundle for the selected environment without
building it again:

```bash
hutch electrobun run --env=dev
```

Main-process inspection is available for Cottontail and Bun:

```bash
hutch electrobun run --inspect
hutch electrobun run --inspect=9229
hutch electrobun run --inspect-wait=127.0.0.1:9229
hutch electrobun run --inspect-brk=9229
```

The CLI flag overrides `ELECTROBUN_INSPECT`, which overrides
`runtime.mainProcessInspector` in the config. Pass `--no-inspect` to disable
configured inspection for one invocation.

## `hutch electrobun dev`

Build a dev bundle and launch it:

```bash
hutch electrobun dev
hutch electrobun dev --watch
```

With `--watch`, Hutch rebuilds and relaunches after changes to:

- configured main-process source and native build inputs, such as `build.zig`,
  Cargo manifests/project source, Go module/package files, or the Odin package
- view entrypoint directories
- sources in `build.copy`
- additional paths in `build.watch`

Use `build.watchIgnore` to exclude generated output. Changes are debounced, and
a failed build leaves the watcher running for the next edit.

## Project scripts

A generated `hutch.config.ts` exposes the common commands:

```ts docs=syntax
export default {
  scripts: {
    install: ["hutch", "install", "--frozen-lockfile"],
    "ui:build":
      "hutch electrobun prepare && hutch pm exec -- vite build",
    start: ["hutch", "electrobun", "dev"],
    dev: ["hutch", "electrobun", "dev", "--watch"],
    "build:canary": ["hutch", "electrobun", "build", "--env=canary"],
    build: ["hutch", "electrobun", "build", "--env=stable"],
  },
};
```

Run them through Hutch:

```bash
hutch run dev
hutch run build:canary
hutch run build
```

Hutch's task runner resolves scripts only from `hutch.config.ts`. A string is interpreted as
a shell expression, including operators, expansion, and redirects. An array
spawns its first element with the rest as exact arguments and performs no shell
parsing. The task runner does not inspect `package.json` scripts, add
`node_modules/.bin` to `PATH` itself, or emulate package-manager lifecycle hooks.

## Package managers

Without a selection in `hutch.config.ts`, `hutch install` uses Hutch's
built-in npm-compatible resolver: `package.json` registry, `file:`, and git
dependencies install into `hutch.lock`, the only lockfile Hutch reads or
writes. Foreign lockfiles are ignored, never migrated, and lifecycle scripts
never run. `--frozen-lockfile` makes installs fail rather than drift from the
committed lockfile.

`hutch.config.ts` may instead select `"npm"`, `"bun"`, `"pnpm"`, `"yarn"`, or
a custom `{ name, executable? }` package manager. Selecting `"bun"` without an
explicit executable uses a Hutch-vendored Bun toolchain. This setting is
independent of `build.mainProcess`, so a Cottontail app may use Bun for
packages and a Bun main process may use npm.

With an external manager selected, `hutch install` delegates to its `install`
command and `hutch pm ...` forwards the remaining arguments unchanged:

```bash
hutch install
hutch pm ci
hutch pm install zod
hutch pm exec -- tsc --version
```

Without an external selection, `hutch pm` is the built-in interface. Its
`hutch pm exec [--] <command> [args...]` form runs only a matching binary from
the nearest package project's `node_modules/.bin`, preserving argv and exit
status. It rejects path-like names and never downloads a package or falls back
to `PATH`; bare `hutch pm` prints help and `hutch pm --version` reports Hutch's
version.

The delegation commands are process delegation, not a second resolver; the
selected external manager owns its dependency graph and lockfile. The same
boundary applies to Cargo, Go modules, and other language ecosystems: they own
dependency graphs while Hutch owns Electrobun orchestration, selected devkits,
and compiler toolchains.

## Store maintenance

`hutch prune --dry-run` lists every installed release and managed toolchain that
is not protected by the currently executing Hutch release, a local selection, a
resolvable registered project, or a live lease. `hutch prune` removes that same
set immediately, with no age threshold. Missing projects and project dependency
records that cannot be resolved protect nothing.

Hutch also performs a lazy cleanup on every ordinary invocation, but retains an
object for 10 days from when it first becomes unreachable. The dry run does not
mutate Hutch state. `hutch reset` recreates the Hutch home immediately and
without a prompt. It preserves the launcher, engine, and exact Hutch selection
used to invoke reset so the command remains usable, while removing every other
Hutch-managed release, toolchain, and state object. These commands never remove
project files or dependency caches owned by external package managers. See
[Hutch: Local store and cleanup](/electrobun/guides/hutch/#local-store-and-cleanup)
for the on-disk layout and offline boundary.

## Lifecycle hook environment

Build hooks receive:

| Variable | Value |
| --- | --- |
| `ELECTROBUN_BUILD_ENV` | `dev`, `canary`, or `stable` |
| `ELECTROBUN_OS` | `macos`, `win`, or `linux` |
| `ELECTROBUN_ARCH` | `arm64` or `x64` |
| `ELECTROBUN_BUILD_DIR` | Build output path |
| `ELECTROBUN_ARTIFACT_DIR` | Distribution artifact path |
| `ELECTROBUN_APP_NAME` | Environment-specific app name |
| `ELECTROBUN_APP_VERSION` | Version from the config |
| `ELECTROBUN_APP_IDENTIFIER` | Application identifier |

`postWrap` also receives `ELECTROBUN_WRAPPER_BUNDLE_PATH`.

=== FILE: apis/context-menu.mdx ===
---
title: "Context Menu"
description: "Show a native context menu and handle its actions."
---
import { Aside, Tabs, TabItem } from "@astrojs/starlight/components";

Call `ContextMenu.showContextMenu()` from the main process. The menu opens at
the current global pointer position.

<Tabs syncKey="runtime">
<TabItem label="Cottontail">

```ts
import { ContextMenu } from "electrobun/main";

ContextMenu.showContextMenu([
  {
    label: "Open",
    action: "open",
    accelerator: "o",
    data: { source: "context-menu" },
  },
  {
    label: "More",
    submenu: [
      { label: "Rename", action: "rename" },
      { label: "Delete", action: "delete", enabled: false },
    ],
  },
  { type: "separator" },
  { role: "copy" },
  { role: "paste" },
]);

ContextMenu.on("context-menu-clicked", (event: unknown) => {
  console.log("Context menu action", event);
});
```

</TabItem>
<TabItem label="Bun">

```ts
import { ContextMenu } from "electrobun/main";

ContextMenu.showContextMenu([
  {
    label: "Open",
    action: "open",
    accelerator: "o",
    data: { source: "context-menu" },
  },
  {
    label: "More",
    submenu: [
      { label: "Rename", action: "rename" },
      { label: "Delete", action: "delete", enabled: false },
    ],
  },
  { type: "separator" },
  { role: "copy" },
  { role: "paste" },
]);

ContextMenu.on("context-menu-clicked", (event: unknown) => {
  console.log("Context menu action", event);
});
```

</TabItem>
<TabItem label="Zig">

```zig
fn onContextMenuAction(item_id: u32, action: [*:0]const u8) callconv(.C) void {
    std.debug.print("context menu action: {d} {s}\n", .{ item_id, action });
}

const menu_json =
    \\[{"label": "Open", "action": "open"},
    \\ {"label": "Rename", "action": "rename"},
    \\ {"type": "separator"},
    \\ {"role": "copy"},
    \\ {"role": "paste"}]
;

try core.showContextMenuJson(menu_json, onContextMenuAction);
```

</TabItem>
<TabItem label="Rust">

```rust
extern "C" fn on_context_menu_action(item_id: u32, action: *const c_char) {
    let action = electrobun::c_string_to_string(action);
    println!("context menu action: {item_id} {action}");
}

let menu_json = r#"[
  {"label": "Open", "action": "open"},
  {"label": "Rename", "action": "rename"},
  {"type": "separator"},
  {"role": "copy"},
  {"role": "paste"}
]"#;

core.show_context_menu_json(menu_json, Some(on_context_menu_action))?;
```

</TabItem>
<TabItem label="Go">

```go
menuJSON := `[
  {"label": "Open", "action": "open"},
  {"label": "Rename", "action": "rename"},
  {"type": "separator"},
  {"role": "copy"},
  {"role": "paste"}
]`

err := core.ShowContextMenuJSON(menuJSON, func(itemID uint32, action string) {
    fmt.Printf("context menu action: %d %s\n", itemID, action)
})
```

</TabItem>
<TabItem label="Odin">

```odin
on_context_menu_action :: proc "c" (item_id: u32, action: cstring) {
    context = runtime.default_context()
    fmt.printfln("context menu action: %d %s", item_id, action)
}

MENU_JSON :: `[
  {"label": "Open", "action": "open"},
  {"label": "Rename", "action": "rename"},
  {"type": "separator"},
  {"role": "copy"},
  {"role": "paste"}
]`

_ = electrobun.showContextMenuJson(core, MENU_JSON, on_context_menu_action)
```

</TabItem>
</Tabs>

<Aside type="note">
The native SDKs have no typed menu builder: `showContextMenuJson` (Rust
`show_context_menu_json`, Go `ShowContextMenuJSON`) takes a raw JSON string
using the same menu schema the TypeScript SDK serializes, so the item fields
below apply unchanged. Item `action` values arrive in the
`StatusItemHandler` callback instead of an event emitter.
</Aside>

Normal items support `label`, `action` or `role`, `data`, `submenu`, `enabled`,
`checked`, `hidden`, `tooltip`, and `accelerator`. Separators accept either
`separator` or `divider` as their type.

In a webview, prevent the browser's default `contextmenu` event and make an RPC
request to the main process, which owns the native menu API.

Context menus are currently implemented on macOS and Windows. Linux support is
not yet available.

=== FILE: apis/events.mdx ===
---
title: "Events"
description: "Listen to application, window, webview, menu, and tray events."
---
import { Aside, Tabs, TabItem } from "@astrojs/starlight/components";

The default main-process export exposes the global event emitter. Window,
webview, menu, and tray objects also expose scoped listeners. In the native
SDKs there is no emitter: window and webview events are C callbacks
registered at creation time.

<Tabs syncKey="runtime">
<TabItem label="Cottontail">

```ts
import Electrobun, { BrowserWindow } from "electrobun/main";

const win = new BrowserWindow({
  title: "Events",
  url: "views://mainview/index.html",
});

Electrobun.events.on("will-navigate", (event) => {
  console.log("Any view will navigate", event);
});

win.webview.on("will-navigate", (event: unknown) => {
  console.log("This view will navigate", event);
});
```

</TabItem>
<TabItem label="Bun">

```ts
import Electrobun, { BrowserWindow } from "electrobun/main";

const win = new BrowserWindow({
  title: "Events",
  url: "views://mainview/index.html",
});

Electrobun.events.on("will-navigate", (event) => {
  console.log("Any view will navigate", event);
});

win.webview.on("will-navigate", (event: unknown) => {
  console.log("This view will navigate", event);
});
```

</TabItem>
<TabItem label="Zig">

```zig
fn onResize(window_id: u32, x: f64, y: f64, width: f64, height: f64) callconv(.C) void {
    std.debug.print("window {d} resized to {d}x{d} at ({d},{d})\n", .{ window_id, width, height, x, y });
}

fn onWebviewEvent(webview_id: u32, event_name: [*:0]const u8, payload: [*:0]const u8) callconv(.C) void {
    std.debug.print("webview {d}: {s} {s}\n", .{ webview_id, event_name, payload });
}

const window_id = try core.createWindow(.{
    .title = "Events",
    .callbacks = .{ .resize = onResize },
});

_ = try core.createWebview(.{
    .window_id = window_id,
    .url = "views://mainview/index.html",
    .callbacks = .{
        .decide_navigation = electrobun.allowAllNavigation,
        .event = onWebviewEvent,
    },
});
```

</TabItem>
<TabItem label="Rust">

```rust
extern "C" fn on_resize(window_id: u32, x: f64, y: f64, width: f64, height: f64) {
    println!("window {window_id} resized to {width}x{height} at ({x},{y})");
}

extern "C" fn on_webview_event(webview_id: u32, event_name: *const c_char, detail: *const c_char) {
    let name = electrobun::c_string_to_string(event_name);
    let detail = electrobun::c_string_to_string(detail);
    println!("webview {webview_id}: {name} {detail}");
}

let mut window_options = WindowOptions::new("Events", Rect::new(160.0, 100.0, 960.0, 640.0));
window_options.callbacks = WindowCallbacks {
    resize: Some(on_resize),
    ..WindowCallbacks::default()
};
let window_id = core.create_window(window_options)?;

let mut webview_options = WebviewOptions::new(
    window_id,
    "views://mainview/index.html",
    Rect::new(0.0, 0.0, 960.0, 640.0),
);
webview_options.callbacks = WebviewCallbacks {
    decide_navigation: Some(electrobun::allow_all_navigation),
    event: Some(on_webview_event),
    ..WebviewCallbacks::default()
};
core.create_webview(webview_options)?;
```

</TabItem>
<TabItem label="Go">

```go
windowOptions := electrobun.NewWindowOptions(
    "Events",
    electrobun.NewRect(160, 100, 960, 640),
)
windowOptions.Callbacks = electrobun.WindowCallbacks{
    Resize: func(windowID uint32, x, y, width, height float64) {
        fmt.Printf("window %d resized to %.0fx%.0f\n", windowID, width, height)
    },
}
windowID, err := core.CreateWindow(windowOptions)

webviewOptions := electrobun.NewWebviewOptions(
    windowID,
    "views://mainview/index.html",
    electrobun.NewRect(0, 0, 960, 640),
)
webviewOptions.Callbacks = electrobun.WebviewCallbacks{
    DecideNavigation: electrobun.AllowAllNavigation,
    Event: func(webviewID uint32, eventName, detail string) {
        fmt.Printf("webview %d: %s %s\n", webviewID, eventName, detail)
    },
}
webviewID, err := core.CreateWebview(webviewOptions)
```

</TabItem>
<TabItem label="Odin">

```odin
import "base:runtime"

on_window_resize :: proc "c" (window_id: u32, x: f64, y: f64, width: f64, height: f64) {
	context = runtime.default_context()
	fmt.printfln("window %d resized to %.0fx%.0f", window_id, width, height)
}

on_webview_event :: proc "c" (webview_id: u32, event_name: cstring, detail: cstring) {
	context = runtime.default_context()
	fmt.printfln("webview %d: %s %s", webview_id, event_name, detail)
}

window_options := electrobun.defaultWindowOptions("Events")
window_options.callbacks.resize = on_window_resize
window_id, window_err := electrobun.createWindow(core, window_options)

webview_options := electrobun.defaultWebviewOptions(window_id)
webview_options.url = "views://mainview/index.html"
webview_options.callbacks = {
	decide_navigation = electrobun.allowAllNavigation,
	event             = on_webview_event,
}
webview_id, webview_err := electrobun.createWebview(core, webview_options)
```

</TabItem>
</Tabs>

<Aside type="note">
The native SDKs have no event emitter. Window events are the
`WindowCallbacks` slots (`close`, `should_close`, `move`, `resize`, `focus`,
`blur`, `key`), and webview events arrive through the `WebviewCallbacks`
slots (`decide_navigation`, `event`, and the bridge callbacks) — all fixed
at creation time. The only app-level hooks are the four handlers set on
`Core`: quit-requested (TypeScript `before-quit`), reopen, URL open
(TypeScript `open-url`), and the global-shortcut callback.
</Aside>

The rest of this page documents the TypeScript emitter surface used by
Cottontail and Bun.

## Event objects

Electrobun events expose:

- `name`: emitted event name.
- `data`: event-specific payload.
- `response`: optional response consumed by a cancellable native action.
- `responseWasSet`: whether a handler assigned a response.
- `clearResponse()`: remove a response set by an earlier handler.

Handlers run synchronously in registration order. A cancellable action reads
the response after emission, so assign `event.response` before returning from
the callback.

## Application events

Current application event names are `application-menu-clicked`,
`context-menu-clicked`, `open-url`, `reopen`, and `before-quit`.

```ts
import Electrobun from "electrobun/main";

Electrobun.events.on("open-url", (event) => {
  const data = event.data as { url: string };
  const url = new URL(data.url);
  console.log(url.protocol, url.pathname);
});

Electrobun.events.on("before-quit", (event) => {
  const shouldCancel = false;
  if (shouldCancel) {
    event.response = { allow: false };
  }
});
```

On macOS, custom schemes and associated files arrive through `open-url`; files
use `file://` URLs. Configure them with `app.urlSchemes` and
`app.fileAssociations`.

## Window events

Current window event names are `close`, `will-close`, `resize`, `move`,
`focus`, `blur`, `keyDown`, and `keyUp`. Per-window close handlers run before
the internal last-window shutdown logic.

## Webview events

Current webview event names are `will-navigate`, `did-navigate`,
`did-navigate-in-page`, `did-commit-navigation`, `dom-ready`,
`new-window-open`, `host-message`, `download-started`, `download-progress`,
`download-completed`, and `download-failed`.

The `BrowserView.on()` typed surface currently includes navigation, readiness,
and download events. `<electrobun-webview>` exposes its browser-side event
surface documented on the [webview tag page](/electrobun/apis/browser/electrobun-webview-tag/).

## Shutdown

Use `before-quit` to synchronously save in-memory state, initiate already
prepared cleanup, or cancel shutdown. The current event emitter does **not**
await a returned promise.

```ts
import Electrobun from "electrobun/main";

Electrobun.events.on("before-quit", (event) => {
  const canQuit = true;
  if (!canQuit) {
    event.response = { allow: false };
    return;
  }

  console.log("Application is quitting");
});

process.on("exit", (code) => {
  console.log("Process exited with code", code);
});
```

<Aside type="caution">
Do not put awaited cleanup after an `await` inside `before-quit` and assume it
will delay shutdown. Complete required asynchronous persistence before allowing
the quit, or cancel and explicitly retry the quit after cleanup finishes.
</Aside>

=== FILE: apis/insights.mdx ===
---
title: "Insights"
description: "Track custom events and control Electrobun Insights from any supported main-process SDK."
---

Electrobun Insights is a preview API available in Bun, Cottontail, Zig, Rust,
Go, and Odin. All SDKs use the same native queue and lifecycle recorder.
Collection is off by default. Configure the app through
[`insights` in electrobun.config.ts](/electrobun/apis/cli/build-configuration/#insights-configuration)
and see the [Insights guide](/electrobun/guides/insights/) for lifecycle,
consent, offline storage, and dashboard behavior.

## Bun and Cottontail

Both runtimes use the named `Insights` export:

```typescript
import { Insights } from "electrobun/main";

const queued = Insights.track("export_completed", { format: "pdf", pages: 3 });
```

### `track(name, properties?)`

```typescript docs=syntax
declare function track(name: string, properties?: InsightsProperties): boolean;
type InsightsProperties = Record<string, string | number | boolean | null>;
```

Queues one custom event with stable identity and timestamp fields. `true`
means accepted locally, not acknowledged by the service. `false` means the
client is disabled/unavailable, custom collection is paused, or the event is
outside the accepted limits. Properties default to an empty object.

### `setEnabled(enabled)`

```typescript
import { Insights } from "electrobun/main";

Insights.setEnabled(true);
Insights.setEnabled(false);
```

Sets and persists the local collection preference for configured Insights.
The choice overrides `insights.enabled` in later builds. `false` stops all
basic and custom collection and clears pending events and the active session
journal; a request already in flight may finish. The server's separate
`collection.customEvents` policy can pause custom events, but cannot enable
anything while this local setting is false. Enabling Insights does not enable
the updater. If the client has no Insights configuration, this call does not
create one.

The app decides when to call this method and owns any related settings UI.
There is no public enabled-state getter; retain the choice in your app's
settings if the UI needs to display it.

### `identify(userId)` and `reset()`

```typescript
import { Insights } from "electrobun/main";

Insights.identify("user_123");
Insights.track("project_created", { template: "blank" });
Insights.reset();
```

Associates an opaque app user ID with future custom events. The ID must be
nonempty, contain no NUL, and fit within 256 UTF-8 bytes. `reset()` clears
that association for future events. Neither method changes the installation
ID, starts a new app session, or divides the current duration into segments.
They do not automatically emit login or logout events.

### `flush()`

Requests background delivery of queued records and returns immediately. It
does not wait for acknowledgement. Normal SDK teardown saves close/duration
records for later delivery; calling `flush()` does not make shutdown delivery
guaranteed.

### `configure(config)`

```typescript docs=syntax
declare function configure(config: {
  appId: string;
  apiUrl?: string;
  enabled?: boolean;
}): boolean;
```

Advanced explicit setup using public ingestion settings. It returns whether
native configuration succeeded. The bundled app supplies its version/build,
channel, platform, and storage location. Prefer declarative build configuration
so normal SDK startup can initialize lifecycle recording consistently. Never
include a deploy key. If managed updates are configured too, use the same app ID.

Configuration initializes the native reporter once. Repeated `configure` calls
do not change an initialized reporter's collection state; use `setEnabled` for
runtime changes.

### Installation ID

Use [`app.getInstallationId()`](/electrobun/apis/app/) for About/Help screens
and managed prerelease registration:

```typescript
import { app } from "electrobun/main";

const installationId = app.getInstallationId();
```

The legacy `Insights.getInstallationId(): string | null` returns the same
identity when Insights is configured. It may initialize the reporter according
to its settings but does not opt the user in. The shared `app` getter performs
identity-only setup and works without configuring Insights.

## Native SDKs

Use these calls after the SDK's normal bundled-app initialization. That setup
reads the optional Insights configuration; normal SDK teardown handles
session persistence. The lower-level native APIs return whether an event was
queued and may also report serialization or native-call errors.

| Operation | Zig | Rust | Go | Odin |
| --- | --- | --- | --- | --- |
| Track | `try core.insightsTrack(name, properties)` | `core.insights_track(name, properties_json)?` | `core.InsightsTrack(name, properties)` | `eb.insightsTrack(&core, name, properties_json)` |
| Enable/disable | `core.insightsSetEnabled(enabled)` | `core.insights_set_enabled(enabled)` | `core.InsightsSetEnabled(enabled)` | `eb.insightsSetEnabled(&core, enabled)` |
| Associate user | `try core.insightsIdentify(user_id)` | `core.insights_identify(Some(user_id))?` | `core.InsightsIdentify(user_id)` | `eb.insightsIdentify(&core, user_id)` |
| Clear association | `core.insightsReset()` | `core.insights_reset()` | `core.InsightsReset()` | `eb.insightsReset(&core)` |
| Request delivery | `core.insightsFlush()` | `core.insights_flush()` | `core.InsightsFlush()` | `eb.insightsFlush(&core)` |

Zig serializes an input value and Go accepts `map[string]any`; their values
must satisfy the same flat-property limits as TypeScript. Rust and Odin accept
the properties as a JSON string. Go's track call returns `(bool, error)` and
its identify call returns an error for invalid input; handle those errors in
your app. The `eb` alias in the Odin column refers to the Electrobun SDK import.

Examples inside an already initialized app:

```zig docs=fragment
const queued = try core.insightsTrack("export_completed", .{ .format = "pdf" });
_ = queued;
```

```rust docs=fragment
let queued = core.insights_track("export_completed", r#"{"format":"pdf"}"#)?;
```

```go docs=fragment
queued, err := core.InsightsTrack("export_completed", map[string]any{"format": "pdf"})
```

```odin docs=fragment
queued := eb.insightsTrack(&core, "export_completed", "{\"format\":\"pdf\"}")
```

See the [shared installation-ID reference](/electrobun/apis/app/#native-sdks)
for each native getter and returned-value ownership.

## Event limits

| Field | Limit |
| --- | --- |
| Event name | 80 ASCII bytes; starts with a letter or digit, followed by letters, digits, spaces, `_`, `.`, `:`, or `-` |
| Properties | At most 16 flat key/value pairs |
| Property key | 64 ASCII bytes; same characters as an event name except spaces |
| Property value | String, finite number, boolean, or `null`; no arrays or nested objects |
| String value | 256 UTF-8 bytes |
| Serialized event | 8 KiB, including event ID, timestamp, sequence, optional user association, and properties |

The serialized-event limit excludes the separate batch header containing app
version/build and platform metadata. The native core validates these limits
even when a language wrapper accepts a larger value. The lifecycle names
`electrobun.app.open`, `electrobun.app.close`, and `electrobun.app.interrupted`
are reserved for the core and are rejected by `track()`.
Queue capacity and
delivery behavior are described in
[offline delivery](/electrobun/guides/insights/#offline-delivery-and-local-storage).

=== FILE: apis/main.mdx ===
---
title: "Main Process API"
description: "The Electrobun main-process SDK in Cottontail, Bun, Zig, Rust, Go, and Odin."
---
import { Aside, Tabs, TabItem } from "@astrojs/starlight/components";

Electrobun exposes the same native core to **six main-process runtimes**:
Bun (the default), Cottontail (experimental), Zig, Rust, Go, and Odin. The TypeScript SDK
(`electrobun/main`) serves Cottontail and Bun; each native language has its
own SDK that loads `ElectrobunCore` directly. Pick your runtime once — code
snippets across these docs follow your selection.

Cottontail and Bun share the TypeScript SDK today, but they are separate
runtime choices (`build.mainProcess: "cottontail"` vs `"bun"`) and will
diverge over time — treat the tabs as distinct even where the code currently
matches. See [Main Process Runtimes](/electrobun/guides/native-main-process/)
for choosing, and the per-runtime
[Hello World walkthroughs](/electrobun/guides/hello-world/) for complete
setup.

## Your first window

<Tabs syncKey="runtime">
<TabItem label="Cottontail">

```ts
// src/bun/index.ts — Cottontail executes TypeScript directly.
import { BrowserWindow, ApplicationMenu, Utils } from "electrobun/main";

const win = new BrowserWindow({
  title: "My app",
  url: "views://mainview/index.html",
});

ApplicationMenu.setApplicationMenu([
  { label: "File", submenu: [{ role: "quit" }] },
]);

Utils.showNotification({ title: "Application started" });
void win;
```

</TabItem>
<TabItem label="Bun">

```ts
// src/bun/index.ts — same TypeScript SDK, running on the actual Bun runtime.
import { BrowserWindow, ApplicationMenu, Utils } from "electrobun/main";

const win = new BrowserWindow({
  title: "My app",
  url: "views://mainview/index.html",
});

ApplicationMenu.setApplicationMenu([
  { label: "File", submenu: [{ role: "quit" }] },
]);

Utils.showNotification({ title: "Application started" });
void win;
```

</TabItem>
<TabItem label="Zig">

```zig
// src/zig/main.zig — the core is a dynamic library; windows are created
// from a worker thread while runMainThread blocks. Full setup in the
// Zig hello world.
const electrobun = @import("electrobun");

// ...inside the UI thread, after configureWebviewRuntimeFromExecutableDir:
const window_id = try core.createWindow(.{
    .title = "My app",
    .frame = .{ .x = 160, .y = 100, .width = 800, .height = 600 },
});

_ = try core.createWebview(.{
    .window_id = window_id,
    .url = "views://mainview/index.html",
    .frame = .{ .x = 0, .y = 0, .width = 800, .height = 600 },
    .callbacks = .{ .decide_navigation = electrobun.allowAllNavigation },
});
```

</TabItem>
<TabItem label="Rust">

```rust
// src/main.rs — the project Cargo.toml points `electrobun` at the Rust crate
// projected under .hutch/devkit. Full setup is in the Rust hello world.
use electrobun::{Core, Rect, WebviewOptions, WindowOptions};

// ...inside the UI thread, after configure_webview_runtime_from_executable_dir:
let window_options =
    WindowOptions::new("My app", Rect::new(160.0, 100.0, 800.0, 600.0));
let window_id = core.create_window(window_options)?;

let webview_options = WebviewOptions::new(
    window_id,
    "views://mainview/index.html",
    Rect::new(0.0, 0.0, 800.0, 600.0),
);
core.create_webview(webview_options)?;
```

</TabItem>
<TabItem label="Go">

```go
// src/go/main.go — import "electrobun" through the project go.mod replacement
// to .hutch/devkit/go-sdk. Windows are created from a goroutine while
// RunMainThread blocks. Full setup in the Go hello world.
import "electrobun"

// ...inside the UI goroutine, after ConfigureWebviewRuntimeFromExecutableDir:
windowOptions := electrobun.NewWindowOptions(
    "My app",
    electrobun.NewRect(160, 100, 800, 600),
)
windowID, err := core.CreateWindow(windowOptions)

webviewOptions := electrobun.NewWebviewOptions(
    windowID,
    "views://mainview/index.html",
    electrobun.NewRect(0, 0, 800, 600),
)
_, err = core.CreateWebview(webviewOptions)
```

</TabItem>
<TabItem label="Odin">

```odin
// src/odin/main.odin — windows are created from a worker thread while
// runMainThread blocks. Full setup in the Odin hello world.
import electrobun "electrobun_sdk:electrobun"

// ...inside the UI thread, after configureWebviewRuntimeFromExecutableDir:
window_options := electrobun.defaultWindowOptions("My app")
window_options.frame = {x = 160, y = 100, width = 800, height = 600}
window_id, _ := electrobun.createWindow(core, window_options)

webview_options := electrobun.defaultWebviewOptions(window_id)
webview_options.url = "views://mainview/index.html"
webview_options.frame = {x = 0, y = 0, width = 800, height = 600}
electrobun.createWebview(core, webview_options)
```

</TabItem>
</Tabs>

<Aside type="note">
Exact native option and callback shapes vary slightly per language — each
native snippet in these docs is verbatim-compatible with its SDK, and the
generated templates are the canonical, complete references.
</Aside>

## The TypeScript SDK (Cottontail and Bun)

Named imports are recommended:

```ts
import { BrowserWindow, ApplicationMenu, Utils } from "electrobun/main";
```

A default namespace export is also available (`import Electrobun from
"electrobun/main"`). The package root, `electrobun`, currently resolves to
the same main-process SDK; use `electrobun/view` inside browser bundles. The
former `electrobun/bun` namespace remains a deprecated alias for
`electrobun/main` so imports can migrate incrementally.

### Cottontail standard-library APIs

The Electrobun SDK and Cottontail's standard library are separate surfaces.
For Cottontail apps, Hutch scans the bundled main process and includes optional
standard-library capabilities used by the SDK, your code, and bundled
dependencies. Computed imports or namespace access may need an explicit,
additive `build.cottontail.capabilities` entry in `electrobun.config.ts`.
See [Cottontail's modular standard library](/electrobun/guides/cottontail/#modular-standard-library)
for examples and detection limits.

## Runtime coverage

The TypeScript SDK has the broadest high-level surface. The native SDKs
mirror the core contract procedurally (ids + callbacks instead of classes).
What exists where:

| API area | Cottontail | Bun | Zig | Rust | Go | Odin |
| --- | :-: | :-: | :-: | :-: | :-: | :-: |
| Windows & webviews | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| WGPU views (native GPU surfaces) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Application & context menus | ✓ typed | ✓ typed | JSON | JSON | JSON | JSON |
| Tray (create/show/title) | ✓ + events | ✓ + events | ✓ ¹ | ✓ ¹ | ✓ + clicks | ✓ ¹ |
| Dialogs, message box, notifications | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Clipboard, displays, shell open/reveal/trash | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Sessions & cookies | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Global shortcuts | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| [Paths](/electrobun/apis/paths/) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Typed RPC (`createRPC`) | ✓ | ✓ | raw bridge ² | raw bridge ² | raw bridge ² | raw bridge ² |
| [Updater](/electrobun/apis/updater/) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| [Installation ID](/electrobun/apis/app/) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| [Insights](/electrobun/apis/insights/) (preview, opt-in) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| [Electrobun UI](/electrobun/apis/ui/overview/) (`main/ui`) ³ | ✓ | ✓ | ✓ ⁴ | — | — | — |
| three.js / Babylon WebGPU adapters | ✓ | ✓ | — | — | — | — |

¹ Zig, Rust, and Odin create and manage tray items, but their wrappers do
not yet surface tray click events; Go's `TrayOptions.Handler` does receive
them. Tray menus remain TypeScript-only everywhere.
² Native SDKs exchange raw JSON messages with `Electroview` in the webview
(the request/response envelope is implemented by hand; the templates show
the full pattern). The webview-side SDK is identical for every runtime.
³ Electrobun UI is experimental and supports macOS, Windows, and Linux X11.
See the [UI guide](/electrobun/guides/electrobun-ui/) for platform limitations.
⁴ Through the `zig-ui` template; see [Electrobun UI from Zig](/electrobun/apis/ui/zig/).

All runtimes use the core-owned updater. Bun and Cottontail expose promises;
[native SDKs](/electrobun/apis/updater-native/) expose typed queued operations,
state, events, and explicit apply approval.

Pages for TypeScript-only features say so at the top; everything else shows
a tab per supported runtime.

=== FILE: apis/paths.mdx ===
---
title: "Paths"
description: "Locate packaged Electrobun resources from the main process."
---
import { Tabs, TabItem } from "@astrojs/starlight/components";

In TypeScript, `PATHS` exposes the packaged resource and view directories.
The native SDKs resolve the same bundle locations with `resolveBundlePaths`
and expose the writable per-user directories through their `Paths` type
(the `app_info` argument comes from `resolveAppInfoFromBundle`).

<Tabs syncKey="runtime">
<TabItem label="Cottontail">

```ts
import { PATHS } from "electrobun/main";

console.log(PATHS.RESOURCES_FOLDER);
console.log(PATHS.VIEWS_FOLDER);
```

</TabItem>
<TabItem label="Bun">

```ts
import { PATHS } from "electrobun/main";

console.log(PATHS.RESOURCES_FOLDER);
console.log(PATHS.VIEWS_FOLDER);
```

</TabItem>
<TabItem label="Zig">

```zig
// Packaged, read-only bundle locations (backs views://):
var bundle_paths = try electrobun.resolveBundlePaths(allocator);
defer bundle_paths.deinit(allocator);
std.debug.print("{s}\n", .{bundle_paths.resources_dir});

// Writable per-user directories, scoped by app identifier + channel:
var paths = try electrobun.Paths.resolve(allocator, app_info);
defer paths.deinit(allocator);
std.debug.print("{s}\n", .{paths.userData});
```

</TabItem>
<TabItem label="Rust">

```rust
// Packaged, read-only bundle locations (backs views://):
let bundle_paths = electrobun::resolve_bundle_paths()?;
println!("{}", bundle_paths.resources_dir.display());

// Writable per-user directories, scoped by app identifier + channel:
let paths = Paths::resolve(&app_info)?;
println!("{}", paths.user_data);
```

</TabItem>
<TabItem label="Go">

```go
// Packaged, read-only bundle locations (backs views://):
bundlePaths, err := electrobun.ResolveBundlePaths()
fmt.Println(bundlePaths.ResourcesDir)

// Writable per-user directories, scoped by app identifier + channel:
paths, err := electrobun.ResolvePaths(appInfo)
fmt.Println(paths.UserData)
```

</TabItem>
<TabItem label="Odin">

```odin
// Packaged, read-only bundle locations (backs views://):
bundle_paths, bundle_err := electrobun.resolveBundlePaths()
defer electrobun.deinit(&bundle_paths, context.allocator)
fmt.println(bundle_paths.resources_dir)

// Writable per-user directories, scoped by app identifier + channel:
paths, paths_err := electrobun.resolvePaths(context.allocator, app_info)
defer electrobun.deinit(&paths, context.allocator)
fmt.println(paths.userData)
```

</TabItem>
</Tabs>

- `RESOURCES_FOLDER` is the app bundle's `Resources` directory. The native
  equivalent is the `resources_dir` / `ResourcesDir` field of the bundle
  paths.
- `VIEWS_FOLDER` is `Resources/app/views`, which backs the `views://` protocol.

The native `Paths` type carries the same fields as `Utils.paths` in
TypeScript: `home`, `appData`, `config`, `cache`, `temp`, `logs`,
`documents`, `downloads`, `desktop`, `pictures`, `music`, `videos`,
`userData`, `userCache`, and `userLogs` (snake_case in Rust, CamelCase in
Go). On every runtime, `userData`, `userCache`, and `userLogs` resolve to
`<base>/<identifier>/<install-root>` using the packaged app identifier and
physical install-root name. That root normally matches the packaged release
channel. Supported Electrobun v1 updates keep their existing physical root,
including `stable` and older app-name roots, so app data stays in place.

Path getters resolve locations; they do not guarantee that the directories
already exist. Create app-owned directories before writing files or calling
`mkdtemp` beneath them, especially on a first launch:

```ts
import { mkdir, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { Utils } from "electrobun/main";

await mkdir(Utils.paths.userData, { recursive: true });
const workingDirectory = await mkdtemp(join(Utils.paths.userData, "work-"));
console.log(workingDirectory);
```

Packaged resources are read-only application content. Modifying a macOS app
bundle invalidates its code signature. Use `Utils.paths.userData`,
`Utils.paths.userCache`, or another writable system directory for mutable data.
Webviews can read files beneath `userData` through the opt-in `appdata://`
protocol; see [Local Webview Assets](/electrobun/apis/bundled-assets/#load-mutable-files-with-appdata).

For installer builds, Electrobun's `App and Data` uninstall action removes the
three app-scoped paths (`userData`, `userCache`, and `userLogs`) for only the
current identifier and recorded physical install root. See
[Uninstalling](/electrobun/guides/uninstalling/) for the exact behavior and
platform availability.

=== FILE: apis/tray.mdx ===
---
title: "Tray"
description: "Create a cross-platform system tray item and native menu."
---
import { Aside, Tabs, TabItem } from "@astrojs/starlight/components";

Create trays in the main process. Images may be absolute paths or bundled
`views://` URLs.

<Tabs syncKey="runtime">
<TabItem label="Cottontail">

```ts
import { Tray } from "electrobun/main";

const tray = new Tray({
  title: "My app",
  image: "views://assets/tray-icon.png",
  template: true,
  width: 32,
  height: 32,
});

const menuState: Record<string, boolean> = {
  notifications: true,
};

function updateTrayMenu() {
  tray.setMenu([
    {
      type: "normal",
      label: "Notifications",
      action: "notifications",
      checked: menuState.notifications,
    },
    { type: "separator" },
    {
      type: "normal",
      label: "Quit",
      action: "quit",
    },
  ]);
}

// Install the menu before listening for interaction. This is required for the
// supported Linux AppIndicator interaction path and works on every platform.
updateTrayMenu();

type TrayClickEvent = {
  data: { id: number; action: string; data?: unknown };
};

tray.on("tray-clicked", (event: unknown) => {
  const { action } = (event as TrayClickEvent).data;
  if (action === "notifications") {
    menuState.notifications = !menuState.notifications;
    updateTrayMenu();
  }
});
```

</TabItem>
<TabItem label="Bun">

```ts
import { Tray } from "electrobun/main";

const tray = new Tray({
  title: "My app",
  image: "views://assets/tray-icon.png",
  template: true,
  width: 32,
  height: 32,
});

const menuState: Record<string, boolean> = {
  notifications: true,
};

function updateTrayMenu() {
  tray.setMenu([
    {
      type: "normal",
      label: "Notifications",
      action: "notifications",
      checked: menuState.notifications,
    },
    { type: "separator" },
    {
      type: "normal",
      label: "Quit",
      action: "quit",
    },
  ]);
}

// Install the menu before listening for interaction. This is required for the
// supported Linux AppIndicator interaction path and works on every platform.
updateTrayMenu();

type TrayClickEvent = {
  data: { id: number; action: string; data?: unknown };
};

tray.on("tray-clicked", (event: unknown) => {
  const { action } = (event as TrayClickEvent).data;
  if (action === "notifications") {
    menuState.notifications = !menuState.notifications;
    updateTrayMenu();
  }
});
```

</TabItem>
<TabItem label="Zig">

```zig
const tray_id = try core.createTray(.{
    .title = "My app",
    .image = "", // absolute path to an icon file, or empty for text-only
    .is_template = true,
    .width = 32,
    .height = 32,
});

try core.setTrayTitle(tray_id, "Ready");
const bounds = try core.getTrayBounds(tray_id);
_ = bounds;
try core.hideTray(tray_id);
try core.showTray(tray_id);
try core.removeTray(tray_id);
```

</TabItem>
<TabItem label="Rust">

```rust
let tray_id = core.create_tray(TrayOptions {
    title: "My app",
    image: "", // absolute path to an icon file, or empty for text-only
    is_template: true,
    width: 32,
    height: 32,
})?;

core.set_tray_title(tray_id, "Ready")?;
let bounds = core.get_tray_bounds(tray_id)?;
core.hide_tray(tray_id)?;
core.show_tray(tray_id)?;
core.remove_tray(tray_id)?;
```

</TabItem>
<TabItem label="Go">

```go
trayID, err := core.CreateTray(electrobun.TrayOptions{
    Title:      "My app",
    Image:      "", // absolute path to an icon file, or empty for text-only
    IsTemplate: true,
    Width:      32,
    Height:     32,
    Handler: func(id uint32, action string) {
        fmt.Printf("tray %d activated: %s\n", id, action)
    },
})

err = core.SetTrayTitle(trayID, "Ready")
bounds, err := core.GetTrayBounds(trayID)
err = core.HideTray(trayID)
err = core.ShowTray(trayID)
err = core.RemoveTray(trayID)
```

</TabItem>
<TabItem label="Odin">

```odin
tray_options := electrobun.defaultTrayOptions("") // image path, or empty for text-only
tray_options.title = "My app"
tray_options.is_template = true
tray_options.width = 32
tray_options.height = 32
tray_id, tray_err := electrobun.createTray(core, tray_options)

_ = electrobun.setTrayTitle(core, tray_id, "Ready")
bounds, bounds_err := electrobun.getTrayBounds(core, tray_id)
_ = electrobun.hideTray(core, tray_id)
_ = electrobun.showTray(core, tray_id)
_ = electrobun.removeTray(core, tray_id)
```

</TabItem>
</Tabs>

<Aside type="note">
The native SDKs create and manage tray items — show/hide (`showTray` /
`hideTray`), title (`setTrayTitle`), bounds (`getTrayBounds`), and removal
(`removeTray`) — but tray click events are not yet surfaced to native
handlers in Zig, Rust, or Odin: those `createTray` wrappers currently pass a
null click handler. The Go SDK's `TrayOptions` does accept a `Handler`
(`StatusItemHandler`) for tray activation. Tray menus (`setMenu()`) and the
`tray-clicked` event flow shown above are TypeScript-SDK features and remain
Cottontail/Bun-only.
</Aside>

## Constructor options

| Option | Type | Default | Purpose |
| --- | --- | --- | --- |
| `title` | `string` | `""` | Text shown by the tray backend. |
| `image` | `string` | `""` | `views://` URL or absolute image path. |
| `template` | `boolean` | `true` | Treat the image as a macOS template image. |
| `width` | `number` | `16` | Requested image width. |
| `height` | `number` | `16` | Requested image height. |

## Methods and lookup

```ts
import { Tray } from "electrobun/main";

const tray = new Tray({
  title: "Status",
  image: "views://assets/tray-icon.png",
});

tray.setTitle("Ready");
tray.setImage("views://assets/tray-ready.png");
tray.setVisible(false);
tray.setVisible(true);

const bounds = tray.getBounds();
const sameTray = Tray.getById(tray.id);
const allTrays = Tray.getAll();

void bounds;
void sameTray;
void allTrays;

tray.remove();
```

Use `Tray.removeById(id)` instead when only a stored tray ID is available.

`setMenu()` replaces the current menu. Tray menu normal items require `type:
"normal"` and `label`; they also support `action`, `data`, `submenu`, `enabled`,
`checked`, `hidden`, and `tooltip`.

## Platform behavior

Ayatana AppIndicator backend supports tray menus and their actions but does not
expose raw primary icon activation. Linux apps should use `setMenu()` and handle
menu actions; do not wait for an icon-only click to install the menu. A backend
that exposes raw activation may emit
`tray-clicked` with an empty action; portable apps should use explicit menu
actions.

=== FILE: apis/ui/browser-dom.mdx ===
---
title: "DOM Renderer (Webviews)"
description: "The same reactivity and JSX as Electrobun UI, rendered into real DOM inside a webview."
---
import { Aside } from "@astrojs/starlight/components";

<Aside type="caution" title="Experimental">
Warren, Electrobun's reactivity and JSX library, is experimental. APIs may
change between releases.
</Aside>

`electrobun/browser/ui` is Warren's DOM renderer. It is the same renderer
[Electrobun UI](/electrobun/guides/electrobun-ui/) uses in the main process —
there it drives the GPU engine's document; here it drives the browser's real
DOM inside a webview (or any web page). Components run once, reactivity is
explicit via `live()`, control flow is `For`/`Show`/`Switch`/`Match`, and the
markup is plain HTML in both places, so a component can move between a GPU
window and a webview unchanged.

There is still no compiler: Electrobun's view bundler transpiles `.tsx`
natively. Point TypeScript at the DOM runtime (type-checking configuration
only):

```jsonc
// tsconfig.json for your view code
{ "compilerOptions": { "jsx": "react-jsx", "jsxImportSource": "electrobun/browser/ui" } }
```

If the same project also contains main-process Electrobun UI code
(`electrobun/main/ui`), use a per-file pragma instead of the global setting:

```tsx
/** @jsxImportSource electrobun/browser/ui */
```

## Mounting

```tsx
import { live, signal, render } from "electrobun/browser/ui";

function Counter() {
  const [count, setCount] = signal(0);
  return (
    <div class="counter">
      <output>{live(() => `Count: ${count()}`)}</output>
      <button onClick={() => setCount((c) => c + 1)}>+1</button>
    </div>
  );
}

const dispose = render(() => <Counter />, document.getElementById("app")!);
```

`render(app, container)` mounts the app and returns a dispose function that
removes everything Warren created (the container's other content is left
alone).

## Elements and props

Any HTML or SVG tag works — the runtime never enumerates elements; a tag
becomes `document.createElement(tag)` (`createElementNS` inside `<svg>`).
Prop handling:

| Prop | Behavior |
| --- | --- |
| `class` / `className` | sets `className` (attribute on SVG) |
| `classList` | object of class names to booleans; toggles each |
| `style` | string (`cssText`) or object (camelCase keys, `--vars` supported) |
| `value`, `checked`, `innerHTML`, ... | set as element properties |
| `disabled`, other booleans | boolean attributes (`true` sets, `false`/`null` removes) |
| `onClick`, `onInput`, `on...` | `addEventListener(name.slice(2).toLowerCase())` |
| `ref` | `ref={(el) => ...}` called with the created element |
| anything else | `setAttribute` (name passed through — SVG's `viewBox` works) |

Reactivity is explicit, exactly like Electrobun UI: `class={live(() =>
...)}` updates in place; `class={value}` is static; a bare function in a
value position is an error.

```tsx
<div
  classList={live(() => ({ active: isActive(), busy: pending() }))}
  style={{ marginTop: "8px", "--accent": "#b18aff" }}
/>
```

Text inputs are explicit two-way:

```tsx
<input value={live(name)} onInput={(e) => setName(e.target.value)} />
```

## Control flow

`Show`, `For`, `Switch`/`Match` behave identically in Electrobun UI: a
`live()` prop reconciles on change, a plain value is a frozen snapshot.
`For` reconciles keyed rows against real DOM nodes — reordering moves the
same elements (scroll position, focus, and animation state survive):

```tsx
<For each={live(() => state.rows.slice())} key={(row) => row.id}
     fallback={<p>No rows.</p>}>
  {(row, index) => <li classList={live(() => ({ first: index() === 0 }))}>{row.label}</li>}
</For>
```

Regions are delimited by comment nodes, so conditional and keyed content
works inside any parent (`<tbody>`, flex rows) without wrapper elements.

## Portal

`Portal` renders children into another parent — `document.body` by default,
or `mount` — while keeping reactive ownership, so they're torn down with the
owning scope:

```tsx
<Show when={live(modalOpen)}>
  <Portal>
    <div class="modal">...</div>
  </Portal>
</Show>
```

## Escape hatch

A bare function child runs imperatively at that point in the tree;
`currentParent()` returns the element it would attach into, and a returned
element mounts. Use it to integrate DOM libraries (editors, terminals) that
manage their own subtree:

```tsx
import { cleanup, currentParent } from "electrobun/browser/ui";

<div class="terminal-host">
  {() => {
    const host = currentParent() as HTMLElement;
    const term = attachTerminal(host); // any third-party DOM library
    cleanup(() => term.dispose());
  }}
</div>
```

## Sharing code with the main process

The reactivity primitives (`signal`, `store`, `live`, `memo`, `inert`,
`cleanup`, `batch`) are the same implementation in both entries — model and
store modules written against them run unchanged in the main process and in
views. Components share too: both renderers take the same HTML elements and
props. What differs is the platform underneath — a browser engine here, the
Electrobun UI engine's [HTML & CSS subset](/electrobun/apis/ui/html-css/)
there — so stick to that subset for components you want to run in both.

See [Reactivity](/electrobun/apis/ui/reactivity/) for the full semantics —
everything there applies verbatim in the browser.

=== FILE: apis/ui/components.mdx ===
---
title: "UI Components"
description: "The eb-* component stylesheet: buttons, forms, cards, navigation, menus, dialogs, and more in plain CSS."
---
import { Aside } from "@astrojs/starlight/components";

<Aside type="caution" title="Experimental">
Electrobun UI is experimental. Class names and tokens may change between
releases.
</Aside>

Electrobun UI ships a small design system as one plain CSS file. There are no
component functions to import: components are HTML elements with `eb-*`
classes, so they work with any markup, any framework, and identically in a
webview. Enable it with `components: true`:

```tsx
createUIWindow({ title: "App", components: true }, () => <App />);
// or: createUI(win, { components: true })
```

Wrap your app in `class="eb-app"` to get the base font, colors, and
`box-sizing: border-box`.

![Built-in Electrobun UI components in Kitchen Sink on macOS, including buttons, badges, cards, tabs, and a progress bar](../../assets/ui/components-macos.png)

*The built-in component stylesheet in Kitchen Sink on macOS. The controls,
text, gradients, shadows, and backdrop blur are rendered by Electrobun UI.*

## Theming

Everything is driven by `--eb-*` custom properties on `:root`. Override any of
them in your own CSS:

| Token | Purpose |
| --- | --- |
| `--eb-bg`, `--eb-surface`, `--eb-card` | Backgrounds |
| `--eb-fg`, `--eb-muted`, `--eb-subtle` | Text colors |
| `--eb-border`, `--eb-input` | Borders and input outlines |
| `--eb-primary`, `--eb-primary-hover`, `--eb-primary-fg` | Primary actions |
| `--eb-secondary`, `--eb-secondary-hover`, `--eb-accent`, `--eb-accent-fg` | Secondary surfaces, selection |
| `--eb-danger`, `--eb-success`, `--eb-warning` (+ `-bg`) | Status colors |
| `--eb-ring` | Focus ring |
| `--eb-radius`, `--eb-radius-lg` | Corner radii |
| `--eb-shadow-sm`, `--eb-shadow`, `--eb-shadow-lg` | Elevation |
| `--eb-font`, `--eb-mono` | Font stacks |

```css
:root { --eb-primary: #e11d48; --eb-primary-hover: #be123c; --eb-radius: 6px; }
```

Dark tokens apply under `prefers-color-scheme: dark` (set with the `dark`
option or `ui.setDark()`), or force a scheme on any subtree with
`class="eb-dark"` / `class="eb-light"`.

## Buttons

```html
<button class="eb-btn">Save</button>
<button class="eb-btn secondary">Cancel</button>
<button class="eb-btn outline">Outline</button>
<button class="eb-btn ghost">Ghost</button>
<button class="eb-btn danger">Delete</button>
<button class="eb-btn link">Learn more</button>
<button class="eb-btn sm">Small</button>
<button class="eb-btn lg">Large</button>
<button class="eb-btn icon" aria-label="Close">✕</button>
```

## Form controls

```html
<label class="eb-field">
  <span class="eb-label">Email</span>
  <input class="eb-input" type="email" placeholder="ada@example.com">
  <span class="eb-hint">We never share it.</span>
</label>

<select class="eb-select"><option>Free</option><option>Pro</option></select>
<textarea class="eb-textarea"></textarea>

<label class="eb-check-row"><input class="eb-checkbox" type="checkbox"> I agree</label>
<label class="eb-check-row"><input class="eb-radio" type="radio" name="r"> Monthly</label>

<!-- switch: an input and an empty span inside the label -->
<label class="eb-switch"><input type="checkbox"><span></span></label>

<input class="eb-slider" type="range" min="0" max="100">
```

## Surfaces

```html
<div class="eb-card">
  <div class="eb-card-header">
    <h3 class="eb-card-title">Card</h3>
    <p class="eb-card-desc">A short description.</p>
  </div>
  <div class="eb-card-body">Content</div>
  <div class="eb-card-footer"><button class="eb-btn">OK</button></div>
</div>

<div class="eb-panel">Inset panel</div>
<hr class="eb-separator">
```

## Badges, avatars, keys

```html
<span class="eb-badge">Default</span>
<span class="eb-badge primary">New</span>
<span class="eb-badge success">Done</span>
<span class="eb-badge warning">Pending</span>
<span class="eb-badge danger">Failed</span>
<span class="eb-badge outline">Draft</span>

<div class="eb-avatar-group">
  <div class="eb-avatar">AL</div>
  <div class="eb-avatar sm">GH</div>
  <div class="eb-avatar lg"><img src="data:image/png;base64,..." alt="Ada"></div>
</div>

<kbd class="eb-kbd">⌘K</kbd>
```

## Feedback

```html
<div class="eb-alert success">
  <div><div class="eb-alert-title">Saved</div>Your changes are live.</div>
</div>
<div class="eb-progress"><div style="width: 40%"></div></div>
<div class="eb-spinner"></div>
<div class="eb-skeleton" style="height: 14px; width: 120px"></div>

<div class="eb-toasts">
  <div class="eb-toast">Copied to clipboard</div>
</div>
```

`.eb-alert` also has `warning` and `danger` variants. `.eb-toast` animates in
when added; render toasts into `.eb-toasts` with a keyed `<For>`.

## Navigation

```html
<div class="eb-tabs" role="tablist">
  <button class="eb-tab" aria-selected="true">General</button>
  <button class="eb-tab">Advanced</button>
</div>

<div class="eb-underline-tabs">
  <button class="eb-tab active">Overview</button>
  <button class="eb-tab">Activity</button>
</div>

<nav class="eb-nav">
  <button class="eb-nav-item" aria-current="page">Inbox</button>
  <button class="eb-nav-item">Archive</button>
</nav>

<div class="eb-breadcrumb"><span>Home</span><span>/</span><span>Settings</span></div>
```

The selected tab is `aria-selected="true"` or `.active`; the current nav item
is `aria-current="page"` or `.active`.

## Menus, popovers, tooltips

```html
<div class="eb-menu">
  <div class="eb-menu-label">File</div>
  <div class="eb-menu-item">New <kbd class="eb-kbd">⌘N</kbd></div>
  <div class="eb-menu-item danger">Delete</div>
</div>

<div class="eb-tooltip-host">
  <button class="eb-btn outline">Hover me</button>
  <div class="eb-tooltip">Tooltips are pure CSS :hover</div>
</div>
```

`.eb-popover` is an absolutely positioned wrapper whose child pops in; put it
inside a `position: relative` parent and show it with `<Show>`.

## Dialogs

```html
<div class="eb-overlay">
  <div class="eb-dialog" role="dialog">
    <div class="eb-dialog-header">
      <h2 class="eb-dialog-title">Delete file?</h2>
      <p class="eb-dialog-desc">This can't be undone.</p>
    </div>
    <div class="eb-dialog-body">...</div>
    <div class="eb-dialog-footer">
      <button class="eb-btn outline">Cancel</button>
      <button class="eb-btn danger">Delete</button>
    </div>
  </div>
</div>
```

The overlay blurs what's behind it with `backdrop-filter`. Render it inside a
`<Show>` (optionally in a `<Portal>`) to open and close it.

![A centered Electrobun UI dialog with Cancel and Confirm buttons over a blurred Kitchen Sink window on macOS](../../assets/ui/dialog-macos.png)

*Kitchen Sink on macOS: a dialog rendered through a `Portal` over the blurred
GPU-rendered interface.*

## Disclosure

```html
<div class="eb-accordion">
  <details open><summary>What is it?</summary><div>A GPU-rendered UI.</div></details>
  <details><summary>Does it need a webview?</summary><div>No.</div></details>
</div>
```

## Data

```html
<div class="eb-table">
  <div class="eb-tr head"><div class="eb-td">Name</div><div class="eb-td">Status</div></div>
  <div class="eb-tr"><div class="eb-td">build.zig</div><div class="eb-td">ok</div></div>
</div>

<div class="eb-list">
  <div class="eb-list-item">First</div>
  <div class="eb-list-item">Second</div>
</div>
```

## Layout helpers

| Class | Effect |
| --- | --- |
| `eb-row` | Horizontal flex, centered, 8px gap |
| `eb-col` | Vertical flex, 8px gap |
| `eb-grow` | `flex: 1; min-width: 0` |
| `eb-scroll` | `overflow: auto` |
| `eb-muted` | Muted text color |
| `eb-title` | Large page title |

=== FILE: apis/ui/events.mdx ===
---
title: "Events & Input"
description: "Pointer, keyboard, focus, text editing, and accessibility in Electrobun UI."
---
import { Aside } from "@astrojs/starlight/components";

<Aside type="caution" title="Experimental">
Electrobun UI is experimental on macOS, Windows, and Linux (X11).
</Aside>

Input is handled natively by the UI engine: it hit-tests, updates `:hover` /
`:active` / `:focus` styles, edits text, scrolls, toggles checkboxes, and
opens `<select>` popups on its own. Your handlers then receive DOM-style
events.

## Listening

Use `on*` props in JSX (Warren maps `onClick` to the `click` event) or
`addEventListener` on an element:

```tsx
<input
  value={live(name)}
  onInput={(e) => setName(e.target.value)}
  onKeyDown={(e) => e.key === "Enter" && submit()}
/>
```

| Event | Notes |
| --- | --- |
| `pointerdown`, `pointerup`, `pointermove`, `pointerenter`, `pointerleave`, `pointerover`, `pointerout` | `mousedown`/`mouseup`/`mousemove`/... are aliases. |
| `click`, `dblclick`, `contextmenu` | |
| `wheel`, `scroll` | Wheel scrolls the innermost scroll container. |
| `keydown`, `keyup` | `key` uses DOM names (`"Enter"`, `"ArrowDown"`, `"a"`). |
| `input`, `beforeinput`, `change` | `e.target.value` is current. |
| `focus`, `blur`, `focusin`, `focusout` | |
| `compositionstart`, `compositionupdate`, `compositionend` | IME composition. |
| `submit`, `toggle`, `resize` | |

Event objects carry `type`, `target`, `currentTarget`, `clientX`/`clientY`
(and `x`/`y`), `button`, `detail`, `key`, `shiftKey`/`ctrlKey`/`altKey`/`metaKey`,
`deltaX`/`deltaY`, `data`, and `stopPropagation()`. Events bubble from the
target through its ancestors.

<Aside type="note">
Handlers run asynchronously, after the engine has already applied its default
behavior (typing, toggling, focus moves, scrolling). `preventDefault()` is
recorded on the event but does not cancel built-in behavior. Make controlled
inputs explicit instead: write the value back from your state.
</Aside>

## Keyboard and focus

- **Tab** / **Shift+Tab** move focus through focusable elements in document
  order, honoring `tabindex`. Buttons, inputs, selects, textareas, summaries,
  and elements with `tabindex` are focusable.
- **Enter** / **Space** activate the focused button, summary, checkbox, or
  radio.
- `:focus-visible` matches keyboard focus; pointer clicks focus without the
  ring.
- `el.focus()`, `el.blur()`, and `el.scrollIntoView()` work from JavaScript.

Window-level shortcuts: listen for `keydown` on a top-level element (events
from the focused element bubble to it), or use `GlobalShortcut` from
`electrobun/main` for system-wide keys.

## Text editing

`<input>` and `<textarea>` edit natively:

- caret movement with the arrow keys, Home/End, and vertical movement in
  textareas;
- selection with Shift and with the mouse;
- system clipboard and editing shortcuts: Cmd+A/C/X/V/Z on macOS and
  Ctrl+A/C/X/V/Z on Windows/Linux, with Shift+Z or Y for redo;
- input methods with marked text through the native macOS text system,
  Windows IMM32, or Linux XIM;
- font fallback, including supported color emoji; see the
  [portable text limitations](/electrobun/apis/ui/html-css/#text);
- `placeholder`, `maxlength`, `readonly`, `disabled`, and password masking.

## Scrolling and dragging

Elements with `overflow: auto` or `scroll` scroll with the wheel and
trackpad. `-webkit-app-region: drag` on an element makes it drag the window —
useful for frameless and transparent windows; mark interactive children
`no-drag`.

## Accessibility

The engine builds an accessibility tree from the DOM. macOS exposes it through
NSAccessibility (including VoiceOver), and Windows uses UI Automation. Linux
does not yet expose this tree to native assistive technology;
`ui.accessibilityTree()` remains available for inspection on every platform.

Roles come from semantics (`button`,
links, inputs by type, headings, lists, images, `select`, `dialog`, `nav`,
`main`, `form`, `hr`, tables) or an explicit `role` attribute. Names come from
text content, `<label>`, `aria-label`, `alt`, or `title`;
`aria-hidden="true"` hides a subtree, and `aria-checked`, `aria-selected`,
and `aria-expanded` set states.

`ui.accessibilityTree()` returns the tree as text for tests.

=== FILE: apis/ui/html-css.mdx ===
---
title: "HTML & CSS Support"
description: "The HTML elements and CSS features Electrobun UI supports."
---
import { Aside } from "@astrojs/starlight/components";

<Aside type="caution" title="Experimental">
Electrobun UI is experimental on macOS, Windows, and Linux (X11). The
supported subset grows between releases.
</Aside>

Electrobun UI implements a stable, practical subset of HTML and CSS — what app
interfaces use — rather than browser compatibility. Anything not listed here
is either ignored (unknown properties and at-rules don't break a stylesheet) or
listed under [Not supported](#not-supported). Tailwind v4's generated CSS
(cascade layers, `@property`, nested `@media`, `oklch()` colors) works.

## HTML

The engine parses forgiving HTML (implicit `<html>`/`<head>`/`<body>`) and
applies a small user-agent stylesheet with browser-like defaults.

| Elements | Notes |
| --- | --- |
| `div`, `span`, `p`, `section`, `header`, `footer`, `main`, `nav`, `aside`, `article`, `h1`–`h6`, `pre`, `blockquote`, `figure`, `hr`, ... | Block and inline elements with browser default styles. |
| `b`, `strong`, `i`, `em`, `u`, `s`, `code`, `kbd`, `small`, `sub`, `sup`, `mark`, `a` | Inline text styles. Links are styled and clickable (handle `onClick`); they don't navigate. |
| `ul`, `ol`, `li`, `dl`, `dt`, `dd` | Lists with `disc`, `circle`, `square`, `decimal` markers. |
| `button` | Clickable, focusable, activates with Enter/Space. |
| `input` | Text-like types (`text`, `password`, `email`, `search`, ...) with full editing; `checkbox`, `radio`, `range`, `color`, `button`/`submit`/`reset`, `hidden`. |
| `textarea` | Multi-line editing. |
| `select`, `option` | Opens an engine-drawn popup; keyboard navigable. |
| `label` | Clicking a label activates its control (`for=` or nested). |
| `details`, `summary` | Toggle open on click. |
| `dialog` | Shown when it has the `open` attribute. |
| `progress` | Track box; style the bar with CSS. |
| `img` | `data:` URLs and file paths (no network). PNG, JPEG, GIF, and BMP work across platforms; macOS uses ImageIO and can decode additional system-supported formats. |
| `svg` | Inline SVG with `currentColor`, rasterized through CoreGraphics on macOS and the portable rasterizer on Windows/Linux. |
| `table`, `tr`, `td`, `th` | Laid out as flex rows — fine for simple data, not full table layout. |

Elements that don't render: `head`, `script`, `style`, `template`, `title`,
`meta`, `link`, `[hidden]`.

## Selectors

| Feature | Support |
| --- | --- |
| Type, `.class`, `#id`, `*` | ✓ |
| Attributes: `[a]`, `=`, `~=`, `\|=`, `^=`, `$=`, `*=`, `i` flag | ✓ |
| Combinators: descendant, `>`, `+`, `~` | ✓ |
| `:is()`, `:where()`, `:not()`, `:has()` | ✓ |
| `:nth-child()`, `:nth-last-child()`, `:nth-of-type()`, `:nth-last-of-type()` | ✓ |
| `:first-child`, `:last-child`, `:only-child`, `:first-of-type`, `:last-of-type`, `:only-of-type`, `:empty`, `:root` | ✓ |
| `:hover`, `:active`, `:focus`, `:focus-visible`, `:focus-within` | ✓ |
| `:checked`, `:indeterminate`, `:disabled`, `:enabled`, `:required`, `:optional`, `:read-only`, `:read-write`, `:placeholder-shown`, `:open` | ✓ |
| `::before`, `::after` (with `content`), `::placeholder`, `::marker` | ✓ |
| Nesting (`&`) | ✓ |

## Cascade and values

| Feature | Support |
| --- | --- |
| Specificity, source order, `!important`, inheritance, `initial`/`inherit`/`unset` | ✓ |
| `@layer` (named, anonymous, statement form) | ✓ |
| Custom properties and `var()` with fallbacks | ✓ |
| `@property` | ✓ |
| `@media`: `width`/`height` (min/max and range syntax), `prefers-color-scheme`, `prefers-reduced-motion`, `orientation`, `hover`, `pointer` | ✓ |
| `@supports` | ✓ |
| `calc()`, `min()`, `max()`, `clamp()` | ✓ |
| Units: `px`, `%`, `em`, `rem`, `vw`, `vh` (and `dvh`/`svh`/`lvh`, `dvw`/...), `pt`, `pc`, `in`, `cm`, `mm`, `ch`/`ex` (approximated) | ✓ |
| Colors: hex, named, `rgb()`, `hsl()`, `oklch()`, `oklab()`, `lch()`, `lab()`, `currentColor`, `transparent` | ✓ |
| `@keyframes` | ✓ |
| `@font-face` | Parsed; fonts are not loaded (system fonts only) |
| `@container`, `@scope`, `@starting-style` | Ignored |

## Layout

| Feature | Support |
| --- | --- |
| `display`: `block`, `inline`, `inline-block`, `flex`, `inline-flex`, `grid`, `inline-grid`, `list-item`, `none` | ✓ |
| Box model: `margin` (with collapsing), `padding`, `border`, `box-sizing`, `width`/`height`, `min-*`/`max-*`, `aspect-ratio` | ✓ |
| Flexbox: direction, wrap, grow/shrink/basis, `order`, `justify-content`, `align-items`/`-self`/`-content`, `gap` | ✓ |
| Grid: `grid-template-columns`/`-rows`, `repeat()` incl. `auto-fill`/`auto-fit`, `minmax()`, `fr`, line and `span` placement, `grid-auto-flow` (incl. `dense`), `grid-auto-*`, gaps, alignment | ✓ |
| `position`: `relative`, `absolute`, `fixed`; `top`/`right`/`bottom`/`left`/`inset`; `z-index` stacking | ✓ |
| `position: sticky` | Treated as `relative` |
| `overflow`: `visible`, `hidden`, `clip`, `scroll`, `auto` — scroll containers scroll with the wheel/trackpad | ✓ |
| Inline layout: wrapping, baselines, `vertical-align`, `text-align` incl. `justify` | ✓ |

## Visuals

| Feature | Support |
| --- | --- |
| `background-color`, `background-image` (`url()`, gradients), `background-size`/`-position`/`-repeat`/`-clip` | ✓ |
| Gradients: `linear-`, `radial-`, `conic-gradient()` and `repeating-*` | ✓ |
| Borders: per-side width/color, `solid`, `dashed`, `dotted`; `border-radius` per corner | ✓ |
| `box-shadow` (multiple, `inset`), `text-shadow` | ✓ |
| `opacity`, `visibility` | ✓ |
| `filter`: `blur`, `brightness`, `contrast`, `grayscale`, `saturate`, `invert`, `sepia`, `opacity`, `hue-rotate`, `drop-shadow` | ✓ |
| `backdrop-filter` | ✓ |
| `transform` (2D: `translate`, `scale`, `rotate`, `skew`, `matrix`), `transform-origin`, individual `translate`/`scale`/`rotate` | ✓ |
| `outline` (+ `outline-offset`) | ✓ |
| `object-fit` | ✓ |

## Text

| Feature | Support |
| --- | --- |
| `font-family` (system fonts, fallback incl. color emoji), `font-size`, `font-weight`, `font-style`, `font` shorthand | ✓ |
| `line-height`, `letter-spacing`, `word-spacing`, `text-indent`, `tab-size` | ✓ |
| `text-decoration` (underline, overline, line-through, color), `text-transform` | ✓ |
| `white-space`: `normal`, `nowrap`, `pre`, `pre-wrap`, `pre-line`, `break-spaces` | ✓ |
| `word-break`, `overflow-wrap` | ✓ |
| `text-overflow: ellipsis`, `line-clamp` / `-webkit-line-clamp` | ✓ |
| `caret-color`, `accent-color` | ✓ |

Windows and Linux use the portable OpenType text backend, with font fallback,
ligatures, kerning, and supported color-emoji formats. Bidirectional reordering,
complex-script shaping (such as Arabic and Indic), and variable-font instances
are not implemented there. macOS uses CoreText by default. Font coverage depends
on the fonts installed on the system.

## Motion

| Feature | Support |
| --- | --- |
| `transition` (property, duration, delay, timing) — interruptible, reversals shorten like browsers | ✓ |
| `animation` with `@keyframes`: iteration count, direction, fill mode, play state | ✓ |
| Timing functions: `ease`, `ease-in`, `ease-out`, `ease-in-out`, `linear`, `cubic-bezier()`, `steps()`, `step-start`/`-end` | ✓ |

Animatable properties: colors (text, background, borders, outline,
decoration), sizes and offsets (`width`/`height` and their min/max,
`top`/`right`/`bottom`/`left`, margins, paddings, border widths and radii,
gaps), `opacity`, `transform`, `box-shadow`, `filter`, `backdrop-filter`,
`font-size`, `letter-spacing`, `flex-grow`/`-shrink`/`-basis`,
`outline-width`/`-offset`, `visibility`, `z-index`.

## Interaction

| Feature | Support |
| --- | --- |
| `cursor` (all standard keywords) | ✓ |
| `pointer-events: none` | ✓ |
| `user-select` | ✓ |
| `-webkit-app-region: drag` / `no-drag` — drag the window from an element | ✓ |

## Not supported

`float`, `display: contents`, full table layout, 3D transforms, `clip-path`, `mask`,
`mix-blend-mode`, `color-mix()`, `vmin`/`vmax`, container queries, web fonts
(`@font-face` loading), and network images. `position: sticky` lays out as
`relative`.

=== FILE: apis/ui/overview.mdx ===
---
title: "UI API Overview"
description: "Electrobun UI windows, mounting, the UI object, native views, and testing helpers."
---
import { Aside } from "@astrojs/starlight/components";

<Aside type="caution" title="Experimental">
Electrobun UI is experimental on macOS, Windows, and Linux (X11). APIs may
change between releases.
</Aside>

Everything lives in the `electrobun/main/ui` entrypoint. It is import-gated:
apps that never import it pay nothing for it. It works in the Bun and
Cottontail main processes and needs `bundleWGPU: true` for each target OS
(which bundles Dawn and the platform UI engine library). Start with the
[setup guide](/electrobun/guides/electrobun-ui/#hello-world).

```tsx
import {
  createUIWindow, createUI, createUIView, registerUIRoot, isUIAvailable,
  signal, store, live, memo, inert, cleanup, batch,
  Show, For, Switch, Match, Fragment, Portal,
} from "electrobun/main/ui";
```

## How it works

Your JSX is rendered by Warren's DOM renderer into a lightweight DOM shim
(`UIDocument` / `UINode`). Every mutation the renderer makes — create node,
set attribute, insert, set text — is encoded into a command buffer and
applied to the Zig engine's retained DOM in one FFI call. The engine runs the
CSS cascade, layout, and paint on the main thread and presents through the
window's Dawn surface. Input is handled natively by the engine (hover, focus,
text editing, scrolling, form controls) and events are queued back to
JavaScript, where your handlers run.

## createUIWindow

```tsx
const { window, ui, dispose } = createUIWindow(options, () => <App />);
```

Opens a [`GpuWindow`](/electrobun/apis/webgpu/), mounts a `UI` into its
full-window view, and renders the app.

| Option | Type | Default | Purpose |
| --- | --- | --- | --- |
| `title` | `string` | `"Electrobun"` | Window title. |
| `width`, `height` | `number` | `800`, `600` | Initial content size. |
| `x`, `y` | `number` | — | Initial position. |
| `titleBarStyle` | `"hidden" \| "hiddenInset" \| "default"` | `"default"` | `hiddenInset` keeps native window controls over full-size content. |
| `transparent` | `boolean` | `false` | Request an alpha-composited window. See the platform limits below. |
| `alwaysOnTop` | `boolean` | `false` | Keep the window above normal windows. |
| `background` | `string` | white / dark canvas | Page background (`html { background }`). Transparent windows default to none. |
| `css` | `string \| string[]` | — | Stylesheets to add. |
| `components` | `boolean` | `false` | Add the built-in [`eb-*` stylesheet](/electrobun/apis/ui/components/). |
| `dark` | `boolean` | — | Force `prefers-color-scheme: dark` (or light). |

The app argument is optional; you can call `ui.render()` later. Returns:

- `window` — the `GpuWindow` (`setSize`, `setPosition`, `setAlwaysOnTop`,
  `on("close", ...)`, ...).
- `ui` — the [`UI`](#the-ui-object).
- `dispose()` — unmounts the app, destroys the UI, and closes the window.

The UI also tears itself down when its window closes.

A transparent, frameless, rounded panel is just CSS:

```tsx
createUIWindow(
  {
    width: 320, height: 120, transparent: true, titleBarStyle: "hidden",
    css: `.panel { margin: 0; height: 100vh; border-radius: 14px;
                   background: rgba(22, 22, 30, .93); -webkit-app-region: drag; }`,
  },
  () => <div class="panel">Drag me</div>,
);
```

## createUI

```tsx
const ui = createUI(target, { css, components: true });
ui.render(() => <App />);
```

Mounts a `UI` into a `GpuWindow` you created yourself (its full-window
`WGPUView` is used) or into any `WGPUView`. Accepts the `css`, `components`,
and `dark` options. Throws if the view can't be attached — usually because
`bundleWGPU` is off.

## createUIView

```tsx
const { view, ui, dispose } = createUIView(wgpuView, { background: "#1b1b28" }, () => <Panel />);
```

Like `createUIWindow`, but into an existing `WGPUView`. Without a
`background` the page is transparent. This is what
[`registerUIRoot`](/electrobun/apis/ui/ui-tag/) uses for `<electrobun-ui>` tags.

## isUIAvailable

`isUIAvailable()` returns whether the UI engine library could be loaded — for
example to fall back to a webview when the engine was not bundled. It does not
prove that a usable GPU surface can be created; mounting still reports attachment
failures.

## The UI object

| Member | Description |
| --- | --- |
| `render(app)` | Mount a JSX app into `<body>`; returns an unmount function. |
| `body` | The `<body>` element (`UINode`). |
| `document` | The `UIDocument` (`createElement`, `createTextNode`, ...). |
| `addStylesheet(css)` | Add a stylesheet; returns a handle. |
| `removeStylesheet(handle)` | Remove a stylesheet added with `addStylesheet`. |
| `setDark(dark)` | Switch `prefers-color-scheme`. |
| `anchor(element, view, options?)` | Keep a native view positioned over an element; see [below](#anchoring-native-views). |
| `querySelector(sel)` | Find an element created from JavaScript. Supports simple selectors: `tag`, `#id`, `.class`, `[attr]`, `[attr=value]` and combinations of them on one element. |
| `destroy()` | Detach from the view and free the engine instance. |

Elements (`UINode`) implement the DOM subset that Warren's renderer and
typical app code use: `appendChild`/`insertBefore`/`remove`,
`setAttribute`/`getAttribute`/`toggleAttribute`, `className`, `classList`,
`style` (string or object, including `--custom-properties`), `textContent`,
`innerHTML` (parsed by the engine), `value`, `checked`, `selected`,
`disabled`, `focus()`, `blur()`, `scrollIntoView()`,
`getBoundingClientRect()`, and `addEventListener`/`removeEventListener`.
See [Events & input](/electrobun/apis/ui/events/).

## Anchoring native views

The UI renders into one Dawn view. Native views — a `WGPUView` running your
own render loop, or a `BrowserView` webview — sit on top of it.
`ui.anchor(element, view, options?)` keeps such a view positioned over an
element's border box:

```tsx
let panel!: UINode;
const { ui, window } = createUIWindow({ title: "Viewer", components: true }, () => (
  <div class="eb-row" style="height: 100vh">
    <nav class="eb-nav" style="width: 200px">...</nav>
    <div class="eb-grow" style="align-self: stretch" ref={(el) => (panel = el)} />
  </div>
));
const view = new WGPUView({ windowId: window.id, frame: { x: 0, y: 0, width: 1, height: 1 }, autoResize: false });
const stop = ui.anchor(panel, view); // follows layout, scrolling, and resizes
```

The engine reports the element's window rect after every frame in which it
changed — layout, scrolling, window resizes — and when the element is hidden
or removed the view is hidden too. The target can be a `WGPUView`, a
`BrowserView`, or any object with `setFrame(x, y, width, height)` (and
optionally `setHidden(hidden)`); several targets may anchor to one element.
`options.onFrame(rect)` is called after each move with
`{ x, y, width, height, visible }`. Native views draw above the UI and aren't clipped by `overflow: hidden`
ancestors. `anchor` returns a function that stops anchoring. The `ui-wgpu`
template embeds a custom WGPU scene and a webview this way.

## Testing helpers

`UI` includes helpers that drive the engine through the same paths native
input uses. Electrobun's own Kitchen tests use them:

| Member | Description |
| --- | --- |
| `frames` | Number of frames presented so far. |
| `nextFrame(timeoutMs?)` | Resolves after at least one more frame has been presented, without requesting a pixel readback. |
| `pixel(x, y)` | Premultiplied RGBA of the presented frame at a point (CSS px). |
| `accessibilityTree()` | Accessibility nodes as `"role\|name\|value\|flags"` lines. |
| `simulate.move(x, y)` | Pointer move (updates `:hover`). |
| `simulate.click(el \| { x, y }, mods?)` | Press and release at an element's centre or a point. |
| `simulate.wheel(x, y, dx, dy)` | Wheel scroll at a point. |
| `simulate.key(key, mods?)` | Key down and up (`"Enter"`, `"ArrowDown"`, `"a"`, ...). |
| `simulate.type(text)` | Text input into the focused control. |

```tsx
const { ui, dispose } = createUIWindow({ css: "body { background: #fff }" }, () => (
  <button id="b" onClick={() => setClicked(true)}>Go</button>
));
await ui.simulate.click(ui.querySelector("#b")!);
await ui.nextFrame();
const [r, g, b] = await ui.pixel(10, 10);
dispose();
```

`mods` is `{ shift?, ctrl?, alt?, meta? }`.

## Rendering, threading, and frames

The engine runs on the native main thread and renders only when the document
changed or an animation is running. JavaScript mutations are buffered and
flushed before reads (`getBoundingClientRect()`, `value`, ...) and before
each frame. Events produced by native input are queued and delivered to your
handlers asynchronously, right after the engine has applied its own default
behavior.

## Platform support

| Platform | Status |
| --- | --- |
| macOS (x64/ARM64) | Native input and IME, CoreText text, ImageIO images, NSAccessibility. |
| Windows (x64/ARM64) | Native input and IMM32 IME, portable text/images, UI Automation; transparent UI uses DirectComposition. |
| Linux (x64/ARM64, X11) | Native input and XIM, portable text/images; native assistive-technology integration is not implemented. |

Linux WGPU surfaces use X11, including through XWayland when an X11 session
is available; there is no native Wayland UI host. Their alpha support depends
on the surface, and X11/Vulkan commonly exposes an opaque surface. Do not rely
on transparent UI windows or overlays on Linux. macOS and Windows support
alpha-composited UI windows.

The Windows/Linux text backend has
[shaping limitations](/electrobun/apis/ui/html-css/#text). The engine remains
experimental even when it is distributed in a stable Electrobun release.

=== FILE: apis/ui/reactivity.mdx ===
---
title: "Reactivity"
description: "Electrobun UI's reactivity model (Warren): signal, store, live, memo, inert, cleanup, batch, and control flow."
---
import { Aside } from "@astrojs/starlight/components";

<Aside type="caution" title="Experimental">
Electrobun UI is experimental and its APIs may change between releases.
</Aside>

Electrobun UI uses Warren, Electrobun's fine-grained reactivity library. The
same primitives are exported from `electrobun/main/ui` (GPU UI) and
`electrobun/browser/ui` ([DOM renderer](/electrobun/apis/ui/browser-dom/)),
so state and model code is shared between the two.

Warren's reactivity has one rule: **nothing is reactive unless you can see
why.** Component bodies, event handlers, and helpers are inert. Reactivity
exists only inside a scope you can see — `live()` or `memo()` — and within a
scope, tracking follows the dynamic extent: signal calls and store property
reads both subscribe, including inside helpers called from the scope.

## Seven primitives

Every one is a bare verb that takes a function.

| | |
| --- | --- |
| `signal(v)` | reactive value. returns `[get, set]` |
| `store(obj)` | nested reactive state. returns `[proxy, setter]`. proxy is **read-only** |
| `live(fn)` | creates a reactive scope. deferred — runs after commit |
| `memo(fn)` | caching reactive scope. dependents never observe it stale |
| `inert(fn)` | reads without subscribing, inside a scope |
| `cleanup(fn)` | registers teardown for the enclosing scope |
| `batch(fn)` | defers notification until the outermost batch exits |

There is no `createEffect` — an effect is a `live` whose return value nobody
uses. There is no `produce` — store setters take a mutator function; that
behavior is the default.

## Component bodies run once

The body is not a render function. It executes a single time, at mount.
Everything reactive lives in a scope:

```tsx
function Profile() {
  const [tab, setTab] = signal("info");

  const joined = state.user.joinedAt;   // inert. snapshot, taken once.

  live(() => {
    analytics.page(tab());              // tracks — inside a scope
  });

  return (
    <div class="profile">
      <small>Since {joined}</small>                   {/* renders once */}
      <h2>{live(() => state.user.name)}</h2>           {/* live */}
      <button
        class={live(() => (tab() === "info" ? "eb-tab active" : "eb-tab"))}
        onClick={() => setTab("billing")}
      >
        Billing
      </button>
    </div>
  );
}
```

Scanning top to bottom, every dynamic value is marked and everything
unmarked is provably static. Search a file for `live(` to find every
reactive boundary.

## live in three positions

Same primitive, same mechanism — a reactive scope:

```tsx
// 1. statement position — an effect. return value discarded.
live(() => {
  setTitle(`${count()} unread`);
  cleanup(() => resetTitle());
});

// 2. JSX position — a binding. the value becomes the node or attribute.
<h2>{live(() => state.user.name)}</h2>
// A live child may also return elements — the region remounts on change:
// <div>{live(() => open() && <Panel/>)}</div>

// 3. nested inside another tracked scope — redundant (that scope already
//    tracks the dynamic extent); Warren warns and passes the value through.
//    Component bodies are inert, so a live() there is never "nested" — it
//    is a real binding even when the component mounts inside a region.
```

A JSX `live` is disposed when its node unmounts; a body-level `live` when
its component does. Cleanups run before every re-run, not only at disposal.

## memo vs live

They run in different phases, and that is the load-bearing difference:

- **`memo`** derives values. Dependents — including `live` scopes — never
  observe a stale memo (no glitches). Memos are pure: `cleanup()` inside a
  memo is a hard error.
- **`live`** owns resources and side effects. It is deferred — it runs after
  commit, observing a settled graph.

```ts docs=syntax
const socketUrl = memo(() => `wss://${region()}/feed`);   // pure. just a value.

live(() => {
  const ws = new WebSocket(socketUrl());
  cleanup(() => ws.close());                              // owns the resource
});
```

## inert — the escape hatch

Suppresses subscription for a read inside a scope:

```ts docs=syntax
live(() => {
  const plan = inert(() => state.user.plan);   // read, don't subscribe
  log(`${state.user.name} · ${plan}`);         // subscribes to .name only
});
```

`inert` outside a scope is a no-op — inert is already the default there, so
there is no need to sprinkle it at component top level.

## Stores

A signal is one independent value; a store is a group of related values.
Both return tuples, so read and write access separate at the import site:

```ts docs=syntax
export const [state, setState] = store({ user: null, threads: [] });
```

The proxy is **read-only everywhere — enforced in production, not dev-only**.
The setter passes a writable draft and batches that store's writes into one
propagation. Mutation is direct: no immutability, no structural sharing, no
tree copying.

```ts docs=syntax
setState((s) => {
  s.user.name = "ada";
  s.unread = 0;
});   // one propagation
```

## batch

Defers **notification**, never mutation — values are always current inside a
batch; only propagation is queued. Batches nest and collapse to the
outermost exit. `batch` is a rare escape hatch: store setters already batch
their own store, and repeatedly reaching for `batch` to coordinate multiple
stores is a sign those stores want to be one store.

```ts docs=syntax
batch(() => {
  for (const item of items) {
    setTotal((t) => t + item.price);   // each read sees the last write
  }
});   // one propagation
```

Warren never catches or logs exceptions from your functions — they propagate
untouched — but its own ambient state (batch depth, tracking stack, inert
flag) is always restored, so a throw can't silently freeze propagation or
leak phantom subscriptions.

## Control flow

`Show`, `For`, and `Switch`/`Match` are components. A `live()` prop
reconciles on change; a plain value is a frozen snapshot.

```tsx
<>
  <Show when={live(loggedIn)} fallback={<button onClick={login}>Sign in</button>}>
    <Account />
  </Show>

  <For each={live(() => state.todos)} key={(t) => t.id} fallback={<p>Nothing to do.</p>}>
    {(todo, index) => <li class={live(() => (index() === 0 ? "first" : ""))}>{todo.text}</li>}
  </For>

  <Switch>
    <Match when={live(() => status() === "loading")}><div class="eb-spinner" /></Match>
    <Match when={live(() => status() === "error")}><div class="eb-alert danger">Failed</div></Match>
  </Switch>
</>
```

`For` reconciles keyed rows: reordering moves the same elements, so focus,
scroll position, and running transitions survive. `Portal` renders its
children into another parent (`<body>` by default) while keeping reactive
ownership — useful for dialogs and toasts.

## Hard errors

| Condition | Why |
| --- | --- |
| write to a store proxy outside its setter | enforced in prod |
| `cleanup()` with no argument | it registers teardown; it does not "clean up now" |
| `cleanup()` outside a scope | no scope to tear down |
| `cleanup()` inside a `memo` | memos are pure; the phase boundary is structural |
| `live()` outside JSX and outside any scope | no coherent meaning |

## Dev-mode warnings

These make "unmarked means static" a guarantee rather than a hope:

1. **Signal read during render with no scope on the stack** — the
   forgotten-`live` case: `{count()}` would render once and silently freeze.
2. **`live()` that registered zero dependencies** — defensive over-wrapping;
   the expression is static, drop the marker.
3. **Nested `live()`** — the enclosing scope already tracks these reads; the
   marker is redundant there.

Disable with `setDevMode(false)`.

=== FILE: apis/ui/ui-tag.mdx ===
---
title: "UI Tag (<electrobun-ui>)"
description: "Layer Electrobun UI over web content with the <electrobun-ui> custom element."
---
import { Aside } from "@astrojs/starlight/components";

<Aside type="caution" title="Experimental">
Electrobun UI is experimental on macOS, Windows, and Linux (X11). APIs may
change between releases.
</Aside>

`<electrobun-ui>` puts a GPU-rendered Electrobun UI layer *on top of* web
content. The custom element is only an anchor: it reserves space in the page,
Electrobun's native compositor places a Dawn view over it (exactly like
[`<electrobun-wgpu>`](/electrobun/apis/browser/electrobun-wgpu-tag/)), and
the trusted main process renders a UI into that view.

Use it when a webview-based app needs chrome the page shouldn't own —
overlays, HUDs, privileged controls — without giving the page access to them.

## In the page

```html
<electrobun-ui name="inspector"></electrobun-ui>
```

The element behaves like a block element; size and position it with CSS. The
overlay tracks the element through scrolling and layout changes. The `name`
attribute selects which registered UI root mounts here.

## In the main process

```tsx
import { live, signal, registerUIRoot } from "electrobun/main/ui";

const registration = registerUIRoot(
  "inspector",
  {
    background: "#1b1b28",
    css: `body { margin: 0; height: 100vh; display: grid; place-items: center;
                 color: #e4e4f0; font: 13px system-ui }`,
    components: true,
  },
  () => {
    const [clicks, setClicks] = signal(0);
    return (
      <div class="eb-col" style="align-items: center">
        <div>{live(() => `clicks: ${clicks()}`)}</div>
        <button class="eb-btn" onClick={() => setClicks((c) => c + 1)}>Click me</button>
      </div>
    );
  },
);

// later: registration.dispose()
```

`registerUIRoot(name, options, app)` takes the same options as
[`createUIView`](/electrobun/apis/ui/overview/#createuiview) (`css`,
`components`, `dark`, `background`). Without a `background` the layer is
transparent and the web page shows through wherever your UI doesn't paint.

Every `<electrobun-ui name="inspector">` instance — across webviews and
windows — gets its own UI (the app function runs per mount). When the element
is removed from the page, its native view and reactive scope are disposed.
`registration.dispose()` stops accepting new mounts and disposes the live ones.

## Notes

- The UI runs in the **main process** with full privileges; the page can
  position the anchor but cannot reach into the overlay.
- Under the hood this is
  [`createUIView`](/electrobun/apis/ui/overview/#createuiview) mounted into
  the tag's `WGPUView` — you can use that API directly for views you create
  yourself.

=== FILE: apis/ui/zig.mdx ===
---
title: "Electrobun UI from Zig"
description: "Build GPU-rendered UI in a Zig main process: Zig state, HTML templates, CSS."
---
import { Aside } from "@astrojs/starlight/components";

<Aside type="caution" title="Experimental">
Electrobun UI is experimental on macOS, Windows, and Linux (X11). APIs may
change between releases.
</Aside>

A Zig main process can use the same UI engine as TypeScript apps, compiled
directly into your executable. State is a plain Zig struct, markup is an HTML
template with `{bindings}`, and styling is CSS. There is no JavaScript and no
webview, and the compiler leaves out the parts of the engine you don't use.

The fastest start is the template:

```bash
hutch electrobun init my-app --template=zig-ui
```

## How it fits together

The Electrobun Zig SDK ships the engine's source next to `electrobun.zig`
(`.hutch/devkit/zig-sdk/ui/root.zig`). Your `build.zig` adds it as the
`electrobun_ui` module and links system frameworks when targeting macOS. The `zig-ui`
template's `build.zig` does this; copy it as is. With `bundleWGPU: true`,
the app bundle includes Dawn, which the engine renders through.

At runtime you create a window and a full-window WGPU view with the Zig SDK,
then mount your app into the view:

```zig
const std = @import("std");
const electrobun = @import("electrobun");
const ui = @import("electrobun_ui");

var state = App{};

fn run(core: *electrobun.Core, bundle_paths: *const electrobun.BundlePaths) !void {
    const frame: electrobun.Rect = .{ .x = 0, .y = 0, .width = 640, .height = 620 };
    const window_id = try core.createWindow(.{ .title = "Todos", .frame = frame, .centered = true });
    const view_id = try core.createWGPUView(.{ .window_id = window_id, .frame = frame, .auto_resize = true });
    const view = (try core.getWGPUViewPointer(view_id)) orelse return error.NoWGPUView;

    var buf: [std.fs.max_path_bytes]u8 = undefined;
    const dawn = try std.fmt.bufPrintSentinel(&buf, "{s}/{s}",
        .{ bundle_paths.exe_dir, electrobun.wgpu_library_name }, 0);

    _ = try ui.electrobun.mountApp(App, &state, .{ .view = view, .dawn_path = dawn });
}
```

## Writing an app

An app is a struct. The engine reads it at compile time:

- **`Signal(T)` fields** are reactive values (`bool`, integers, floats,
  enums, `[]const u8`). Read with `get()` (tracked) or `peek()`, write with
  `set()`.
- **`List(T)` fields** are keyed lists of item structs for `each={...}`.
  Use `append`, `insert`, `remove`, `removeItem`, `clear`, `at`, `len` and
  `slice`. Item structs can have their own signals and methods.
- **Plain `bool`, number, enum and `[]const u8` fields** are bound once, as
  constants.
- **Methods returning `void`** are event handlers: `onclick={add}`. Extra
  parameters are filled from the call: `*ui.Event` receives the DOM event,
  `*Item` receives a list item (from the `each` scope or an argument such as
  `remove(t)`), and other types convert from literal arguments such as
  `show('active')`.
- **Methods returning a value** are computed values: `{remaining}` re-runs
  when the signals it reads change.
- **`pub const template`** is the markup, `pub const style` (optional) the
  CSS, and `pub fn init` (optional) runs once after binding.

```zig
const Todo = struct {
    title: ui.Signal([]const u8) = .init(""),
    done: ui.Signal(bool) = .init(false),
};

const App = struct {
    draft: ui.Signal([]const u8) = .init(""),
    todos: ui.List(Todo) = .{},

    pub fn add(self: *App) void {
        const text = std.mem.trim(u8, self.draft.peek(), " ");
        if (text.len == 0) return;
        _ = self.todos.append(.{ .title = .init(text) }) catch return;
        self.draft.set("");
    }

    pub fn remove(self: *App, t: *Todo) void {
        self.todos.removeItem(t);
    }

    pub fn remaining(self: *App) i64 {
        var n: i64 = 0;
        for (self.todos.slice()) |t| {
            if (!t.done.get()) n += 1;
        }
        return n;
    }

    pub const template =
        \\<input bind:value={draft} placeholder="What needs to be done?">
        \\<button onclick={add} disabled={draft.length == 0}>Add</button>
        \\<ul>
        \\  <li each={todos} as="t" class:done={t.done}>
        \\    <input type="checkbox" bind:checked={t.done}> {t.title}
        \\    <button onclick={remove(t)}>×</button>
        \\  </li>
        \\</ul>
        \\<p>{remaining} left</p>
    ;

    pub const style =
        \\.done { color: #888; text-decoration: line-through }
    ;
};
```

## Template syntax

| Syntax | Meaning |
| --- | --- |
| `{expr}` | Text or attribute interpolation. |
| `class:name={expr}` | Toggle a class. |
| `style:prop={expr}` | Set one style property. |
| `on<event>={handler}` | Call a handler (`onclick={add}`, `onclick={remove(t)}`) or run a statement (`{count++}`, `{open = !open}`). |
| `bind:value={signal}`, `bind:checked={signal}` | Two-way binding for form controls. |
| `if={expr}`, `else` | Conditional rendering. |
| `each={list} as="item" index="i" key={item.id}` | Keyed list rendering. |

Expressions support literals, paths (`t.title`, `draft.length`), `!`, unary
`-`, arithmetic, comparisons, `&&`/`||` and the ternary operator.

The [HTML & CSS](/electrobun/apis/ui/html-css/) and
[components](/electrobun/apis/ui/components/) references apply unchanged.
Pass `.components = true` to `mountApp` to add the `eb-*` stylesheet.

## mountApp options

| Option | Type | Default | Purpose |
| --- | --- | --- | --- |
| `view` | `*anyopaque` | — | The WGPU view's native pointer (`Core.getWGPUViewPointer`). |
| `dawn_path` | `?[:0]const u8` | `null` | Path to `libwebgpu_dawn`; the bundle puts it next to the executable. |
| `components` | `bool` | `false` | Add the built-in `eb-*` component stylesheet. |
| `css` | `[]const []const u8` | `&.{}` | Extra stylesheets, applied after `style`. |
| `dark` | `?bool` | `null` | Set the color scheme; `null` keeps the engine default (light). Call `setDark` to follow application or system preferences explicitly. |
| `transparent` | `bool` | `false` | Keep unpainted canvas pixels transparent when the native surface supports alpha. |

`mountApp` returns a handle with `setDark(bool)` and `destroy()`.
The [platform support and limitations](/electrobun/apis/ui/overview/#platform-support)
are the same as for TypeScript apps.

## Threads

Handlers, event listeners and rendering run on the main thread with the UI
locked, so handlers can change state freely. To change state from another
thread, such as after a background task finishes, take the lock:

```zig
const mounted = try ui.electrobun.mountApp(App, &state, .{ .view = view });

// on a worker thread
mounted.lock();
defer mounted.unlock(); // schedules a frame
state.status.set("done");
```

=== FILE: apis/updater-native.mdx ===
---
title: "Native Updater"
description: "Queue, observe, and approve core-owned updates from Zig, Go, Odin, and Rust."
---
import { Tabs, TabItem } from "@astrojs/starlight/components";

Zig, Go, Odin, and Rust use the same updater engine as Bun and Cottontail.
Configure `release.baseUrl` for a static host or `release.managed.appId` for
[Managed Deploys](/electrobun/guides/managed-deploys/). The core reads bundle
metadata, derives update paths, and uses the shared installation identity;
applications do not construct helper commands or supply installation IDs.
The existing [release filenames and checksum sidecars](/electrobun/apis/updater/#local-and-update-metadata)
are unchanged.

SDK startup or first use configures local bundle paths and reconciles previous
update results. It does not check the network. The app chooses when to check;
the `dev` channel and `external`/`none` update authority disable direct updates.

## Request, then observe

An accepted request means the core queued the operation. It does not mean the
operation succeeded. Retain its operation ID and poll the matching record in
the snapshot's `operations` list, which includes bounded recent results.
Do not infer your request's completion from the snapshot's current operation:
another request may already be running.

Use a timer or application task to poll while the native event loop continues
running. Requests and snapshots do not wait for network transfers, and the core
worker never calls into your language runtime. The following fragments queue
one check and show one later polling tick; keep the operation ID between ticks.

<Tabs>
<TabItem label="Zig">

```zig
// Inside an error-returning task; std and electrobun are imported.
const request = try core.updaterCheck();
defer request.deinit();
if (!request.value.accepted) return error.UpdateRequestRejected;
const operation_id = try core.allocator.dupe(u8,
    request.value.operationId orelse return error.MissingOperationId);
defer core.allocator.free(operation_id);

// Later polling tick; release each snapshot after reading it.
const snapshot = try core.updaterGetState();
defer snapshot.deinit();
for (snapshot.value.operations) |operation| {
    if (!std.mem.eql(u8, operation.operationId, operation_id)) continue;
    std.debug.print("Update operation: {s}\n", .{@tagName(operation.state)});
    if (operation.state == .completed) {
        if (operation.updateInfo) |info| {
            std.debug.print("Update available: {}\n", .{info.updateAvailable});
        }
    }
}
```

Rejected requests retain the core message in `request.value.@"error"`.
Typed responses are `std.json.Parsed(T)`; their strings remain valid until
`.deinit()`. Copy any ID or message needed beyond that lifetime.

</TabItem>
<TabItem label="Go">

```go
// Inside a function returning error; electrobun and fmt are imported.
request, err := core.UpdaterCheck()
if err != nil { return err }
operationID := request.OperationID

// Later polling tick:
snapshot, err := core.UpdaterGetState()
if err != nil { return err }
for _, operation := range snapshot.Operations {
    if operation.OperationID != operationID { continue }
    fmt.Println("Update operation:", operation.State)
    if operation.State == electrobun.UpdaterCompleted && operation.UpdateInfo != nil {
        fmt.Println("Update available:", operation.UpdateInfo.UpdateAvailable)
    }
}
```

Rejected requests return an `error`. Responses contain Go-owned strings and
slices and need no manual cleanup.

</TabItem>
<TabItem label="Odin">

```odin
// Inside a proc returning electrobun.Error; fmt and strings are imported.
request, err := electrobun.updaterCheck(core)
defer electrobun.updaterRequestResultDeinit(&request)
if err != .None { return err }
request_id, present := request.operationId.?
if !present { return .InvalidJson }
operation_id, clone_err := strings.clone(request_id)
if clone_err != nil { return .AllocationFailed }
defer delete(operation_id)

// Later polling tick:
snapshot, state_err := electrobun.updaterGetState(core)
defer electrobun.updaterStateDeinit(&snapshot)
if state_err != .None { return state_err }
for operation in snapshot.operations {
    if operation.operationId != operation_id { continue }
    fmt.println("Update operation:", operation.state)
    if operation.state == .completed {
        if info, has_info := operation.updateInfo.?; has_info {
            fmt.println("Update available:", info.updateAvailable)
        }
    }
}
```

Deinitialize request results even when the error is `.UpdaterRejected`: that
result owns the core error message. State, local-info, and event responses use
`updaterStateDeinit`, `updaterLocalInfoDeinit`, and `updaterEventsDeinit`.

</TabItem>
<TabItem label="Rust">

```rust
// Inside a function returning Result<_, electrobun::UpdaterError>.
use electrobun::UpdaterOperationState;

let request = core.updater_check()?;
let operation_id = request.operation_id.expect("accepted request has an ID");

// Later polling tick:
let snapshot = core.updater_state()?;
if let Some(operation) = snapshot.operations.iter()
    .find(|operation| operation.operation_id == operation_id)
{
    println!("Update operation: {:?}", operation.state);
    if operation.state == UpdaterOperationState::Completed {
        if let Some(info) = &operation.update_info {
            println!("Update available: {}", info.update_available);
        }
    }
}
```

Rejected requests return `UpdaterError::Rejected`. Responses own their
`String` and `Vec` data and are released normally by Rust.

</TabItem>
</Tabs>

Handle `failed` and `cancelled` records explicitly. A missing record is not
success: operation history is bounded. For a completed check, read that record's
`updateInfo.updateAvailable`; for a completed download, read `updateReady`.
Retain the new operation ID each time you queue the next action.

## Apply approval and shutdown

The sequence is:

1. Queue **check** and wait for its completed record. If an update is available,
   queue **download** and wait for its completed record with `updateReady`.
2. Queue **requestApply**. When the matching current operation reaches
   `awaitingApproval`, read its `approval.id` and `approval.preparedHash`.
   No apply helper has started yet.
3. Evaluate your application's save/veto policy **without stopping the event
   loop**. Keep this decision separate from any quit callback that terminates
   the application. Submit **approveApply** with the
   same operation ID, approval ID, and an explicit Boolean decision. Submit
   each decision once. `false` vetoes the apply and leaves the app running.
4. After approving, keep the event loop alive. Only a snapshot for that same
   operation with `quitReady: true` confirms helper handoff. Then perform
   ordinary application teardown, including UI disposal and core shutdown.

Neither request acceptance nor `completed` alone permits quitting. Native SDKs
never invoke your quit callbacks or force an exit. The helper waits for the old
process to exit before replacing it. A failed or cancelled operation leaves the
application responsible for reporting the outcome; it must not assume an update
was installed. Startup reconciliation reports the helper's later result.

The methods below use `core` as the SDK handle; Odin takes `core` as its first
argument. `op` is the retained operation ID and `approval` is its approval ID.

| Action | Zig | Go | Odin | Rust |
| --- | --- | --- | --- | --- |
| Check | `core.updaterCheck()` | `core.UpdaterCheck()` | `updaterCheck(core)` | `core.updater_check()` |
| Download | `core.updaterDownload()` | `core.UpdaterDownload()` | `updaterDownload(core)` | `core.updater_download()` |
| Request apply | `core.updaterRequestApply()` | `core.UpdaterRequestApply()` | `updaterRequestApply(core)` | `core.updater_request_apply()` |
| Approve/veto | `core.updaterApproveApply(op, approval, approved)` | `core.UpdaterApproveApply(op, approval, approved)` | `updaterApproveApply(core, op, approval, approved)` | `core.updater_approve_apply(op, approval, approved)` |
| Cancel | `core.updaterCancel(op)` | `core.UpdaterCancel(op)` | `updaterCancel(core, op)` | `core.updater_cancel(op)` |
| Reconcile result | `core.updaterReconcile()` | `core.UpdaterReconcile()` | `updaterReconcile(core)` | `core.updater_reconcile()` |

Cancellation is a request, so inspect its response and the operation's terminal
record. It cannot revoke an update already handed off. In Zig, inspect the
request's `accepted` and error fields; Go/Rust return errors for rejection, and
Odin returns `.UpdaterRejected` with an owned result.

## Events and lifetime

Poll events with `core.updaterGetEvents(after, limit)` in Zig,
`core.UpdaterGetEvents(after, limit)` in Go,
`electrobun.updaterGetEvents(core, after, limit)` in Odin, or
`core.updater_events(after, limit)` in Rust. Start with cursor `0` and pass the
returned `nextSequence` (`NextSequence` in Go, `next_sequence` in Rust) unchanged
to the next poll. If `overflow` is true, use a state snapshot to recover retained
operation results. Event batches are bounded; they are not a permanent log.

Events contain status, message, timestamp, operation ID, and optional typed
details such as byte counts and progress. Current preparation helpers report
coarse operation phases, not continuous byte or individual patch-hop progress.
Use an indeterminate indicator when progress is absent. The status names match
the [JavaScript API](/electrobun/apis/updater/#status-reporting).

Use one application Core handle. Zig `Core.close()`, Odin `coreClose`, and Rust
`Core` drop stop updater work configured through that handle before unloading
the library. Go's `RunMainThread` shuts down its configured updater when the
event loop returns. Applications managing a different lifecycle must call
`UpdaterShutdown()` explicitly; the other SDKs also expose explicit shutdown.
Shutdown joins the updater worker but preserves a successfully handed-off helper.

SDK bindings release core-owned response strings internally. Zig raw JSON
methods return copies that must be freed with `core.allocator`; typed response
cleanup follows the examples above. Missing updater symbols in an older core
produce an explicit unavailable error, with no alternative updater engine.

=== FILE: apis/updater.mdx ===
---
title: "Updater"
description: "Check, download, apply, and observe Electrobun application updates."
---
import { Aside } from "@astrojs/starlight/components";

Electrobun's Zig core owns update checks, downloads, preparation, and apply
handoff for Bun, Cottontail, Zig, Rust, Go, and Odin. Bun and Cottontail keep
the existing promise-based `Updater` API shown below. Native applications use
the [typed request and polling API](/electrobun/apis/updater-native/), including
an explicit application approval step before applying an update.

Hutch stable and canary builds create update metadata plus a compressed full
bundle. When a previous release is available, Hutch also creates a delta patch.
Publish the artifact directory
to a static host and configure its public HTTPS base URL:

```ts
import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "Updater Example",
    identifier: "dev.example.updater",
    version: "1.0.0",
  },
  release: {
    baseUrl: "https://downloads.example.com/my-app",
  },
} satisfies ElectrobunConfig;
```

For [Managed Deploys](/electrobun/guides/managed-deploys/), configure
`release.managed.appId` instead. Every SDK uses the same configuration: the core
derives bundled metadata, installation identity, and update paths. Applications
do not need to launch or configure update helpers themselves. Configuring the
updater does not schedule network checks; your app decides when to check.

From 2.0.6, native update preparation requires an HTTPS base URL without
credentials, query parameters, or a fragment. HTTP is allowed only for local
tests on `localhost`, `127.0.0.1`, or `[::1]`. Artifact redirects cannot
downgrade HTTPS to HTTP; HTTP-to-HTTP redirects must stay on the same loopback
host and port. See [Updates](/electrobun/guides/updates/) for migration from
older release hosts.

## Check and install

```ts
import { Updater } from "electrobun/main";

const local = await Updater.getLocalInfo();
console.log(`Running ${local.version} (${local.channel})`);

const update = await Updater.checkForUpdate();
if (update.updateAvailable) {
  await Updater.downloadUpdate();

  if (Updater.updateInfo().updateReady) {
    await Updater.applyUpdate();
  }
}
```

`applyUpdate()` asks the normal `before-quit` handlers for permission before
starting an apply helper. A veto leaves the application running. After approval,
the core arms the helper and confirms handoff before the SDK begins normal
application shutdown. The native helper revalidates the staged bundle,
replaces the installed app transactionally, refreshes platform integration,
and launches the new version. The helper waits for the running app to exit before
swapping its files, including on Windows. If replacement, platform integration,
or the launch operation fails, it attempts to restore the previous app.
The old app is removed after the launch operation succeeds;
this confirms that launch was requested, not that the application completed
startup or passed an application-specific health check.
It does nothing until a prepared download is ready.

Starting with Electrobun 2.0.6, `downloadUpdate()` uses a native helper to
reconstruct the exact current tar in RAM from installed file contents and an
archive recipe. Original tar headers, ordering, and padding come from the
recipe, so filesystem timestamps and tar tool differences do not change the
patch input. File and archive digests must
match before patching. Original signed file bytes are preserved without
re-signing the app.

The helper requests the patch named after the current hash and streams its
output directly into a staged app. It follows intermediate hashes until it
reaches the target release. A missing recipe, changed source file, unavailable
patch, or failed patch attempt falls back to streaming the full archive into
staging. The installed app remains untouched during preparation.

<Aside type="note">
The `dev` channel and `release.updateAuthority: "external"` or `"none"` disable
Electrobun's direct updater. Exercise update installation with a packaged canary
or stable build using direct update authority. Insights remains independent.
</Aside>

## Disk space during preparation

The updater retains `<hash>.recipe.json` under the installed channel's
`self-extraction` directory instead of the full uncompressed tar. When migrating
an older installation, it removes the cached tar only after publishing a recipe
and verifying that the installed app reproduces the original archive.

Delta preparation holds one reconstructed source tar in RAM, plus recipe
metadata and decoder buffers. This allocation is based on the uncompressed tar
size, not the smaller patch download. It writes the downloaded patch and one
replacement app to disk; it does not accumulate the new tar in a second RAM
buffer.
Between patch-chain hops, the intermediate app is reconstructed into RAM and
removed before the next stage is extracted. If allocating the source buffer
fails, the helper attempts full-download fallback, which needs decoder buffers
but no complete source-tar buffer.

Full downloads stream through decompression into the staged app, without keeping
a complete compressed or uncompressed archive on disk. Both paths still need
space for the replacement app, while the old app remains available for rollback.
Preparation can fail if the disk remains full; do not treat a
completed download as an applied update. Observe `updateReady`, status events,
and `error`, and confirm the new version after relaunch.

## Local and update metadata

`checkForUpdate()` requests `<channel>-<os>-<arch>-update.json` from the
configured release host. After validating an available release, it can request
`<channel>-<os>-<arch>-checksum.json` from the same folder. The sidecar contains
`hash`, which must match the release manifest, plus `tarSha256` and `tarSize`
for the exact uncompressed archive. Its fixed name lets uploads replace the
previous checksum for that channel and target. The
canonical manifest keeps its original `artifact: { file }` shape for older
clients.

If the build hashes differ, the updater retries the metadata check to account
for publication between requests, then fails if they still disagree. A missing
fixed-name sidecar (`404`) falls back to
`<channel>-<os>-<arch>-<hash>-checksum.json` for older hosts. If that is also
missing, the existing update behavior is used. Other request failures, invalid
JSON, or an invalid hash/checksum/size fail the check.
Previously published manifests with inline `artifact.tarSha256` and
`artifact.tarSize` remain supported; both fields must be valid when present.
The updater ignores additional manifest fields while validating the fields it
uses.
See [Updates](/electrobun/guides/updates/) for publishing and host migration.

`getLocalInfo()` returns the packaged `version.json` data:

```ts
import { Updater } from "electrobun/main";

const info = await Updater.getLocalInfo();

const version: string = info.version;
const hash: string = info.hash;
const baseUrl: string = info.baseUrl;
const channel: string = info.channel;
const name: string = info.name;
const identifier: string = info.identifier;

void version;
void hash;
void baseUrl;
void channel;
void name;
void identifier;
```

`checkForUpdate()` and `updateInfo()` expose `version`, `hash`,
`updateAvailable`, `updateReady`, and `error`.

Convenience methods under `Updater.localInfo` return the current `version`,
`hash`, `channel`, and `baseUrl`. `channelBucketUrl()` returns the base URL, and
`appDataFolder()` returns the physical installed update workspace. Stable
Electrobun v1.18.1+ and 2.0 apps use the same `stable` root.

## Status reporting

```ts
import { Updater, type UpdateStatusEntry } from "electrobun/main";

Updater.onStatusChange((entry: UpdateStatusEntry) => {
  console.log(entry.status, entry.message, entry.details);
});

const history = Updater.getStatusHistory();
Updater.clearStatusHistory();
Updater.onStatusChange(null);

void history;
```

Statuses cover checking, native update preparation, handoff, relaunch,
completion, and errors. Native preparation currently reports its overall
operation rather than individual patch-hop or byte-progress events.
`UpdateStatusEntry` contains `status`, `message`, `timestamp`, and optional
structured `details`.

Native SDKs poll the same statuses and optional progress fields on their own
application thread; the core worker never calls into a language runtime. See
[native event polling and ownership](/electrobun/apis/updater-native/#events-and-lifetime).

=== FILE: apis/utils.mdx ===
---
title: "Utils"
description: "Cross-platform application, dialog, clipboard, and path utilities."
---
import { Aside, Tabs, TabItem } from "@astrojs/starlight/components";

Import utilities as the `Utils` namespace from the main-process SDK:

```ts
import { Utils } from "electrobun/main";
```

In the native SDKs (Zig, Rust, Go, Odin), the same operations are exposed
directly on `Core`. The tabs below show the native calls where they exist.

## Files and external applications

<Tabs syncKey="runtime">
<TabItem label="Cottontail">

```ts
import { Utils } from "electrobun/main";

const openedUrl = Utils.openExternal("https://example.com");
const openedPath = Utils.openPath("/absolute/path/to/report.pdf");

Utils.showItemInFolder("/absolute/path/to/report.pdf");
Utils.moveToTrash("/absolute/path/to/old-report.pdf");

void openedUrl;
void openedPath;
```

</TabItem>
<TabItem label="Bun">

```ts
import { Utils } from "electrobun/main";

const openedUrl = Utils.openExternal("https://example.com");
const openedPath = Utils.openPath("/absolute/path/to/report.pdf");

Utils.showItemInFolder("/absolute/path/to/report.pdf");
Utils.moveToTrash("/absolute/path/to/old-report.pdf");

void openedUrl;
void openedPath;
```

</TabItem>
<TabItem label="Zig">

```zig
const opened_url = try core.openExternal("https://example.com");
const opened_path = try core.openPath("/absolute/path/to/report.pdf");

try core.showItemInFolder("/absolute/path/to/report.pdf");
const trashed = try core.moveToTrash("/absolute/path/to/old-report.pdf");
```

</TabItem>
<TabItem label="Rust">

```rust
let opened_url = core.open_external("https://example.com")?;
let opened_path = core.open_path("/absolute/path/to/report.pdf")?;

core.show_item_in_folder("/absolute/path/to/report.pdf")?;
let trashed = core.move_to_trash("/absolute/path/to/old-report.pdf")?;
```

</TabItem>
<TabItem label="Go">

```go
openedURL, err := core.OpenExternal("https://example.com")
openedPath, err := core.OpenPath("/absolute/path/to/report.pdf")

err = core.ShowItemInFolder("/absolute/path/to/report.pdf")
trashed, err := core.MoveToTrash("/absolute/path/to/old-report.pdf")
```

</TabItem>
<TabItem label="Odin">

```odin
opened_url := electrobun.openExternal(core, "https://example.com")
opened_path := electrobun.openPath(core, "/absolute/path/to/report.pdf")

_ = electrobun.showItemInFolder(core, "/absolute/path/to/report.pdf")
trashed := electrobun.moveToTrash(core, "/absolute/path/to/old-report.pdf")
```

</TabItem>
</Tabs>

- `openExternal(url)` opens HTTP, HTTPS, mail, and custom-scheme URLs with the
  system handler and returns whether the request succeeded.
- `openPath(path)` opens a file or directory with its default application and
  returns whether the request succeeded.
- `showItemInFolder(path)` reveals a file in Finder, Explorer, or the Linux file
  manager.
- `moveToTrash(path)` moves a file or directory to the system trash.

Use absolute filesystem paths for filesystem operations. `views://` URLs are
for webview content, not native file APIs.

## File dialog

<Tabs syncKey="runtime">
<TabItem label="Cottontail">

```ts
import { Utils } from "electrobun/main";

const paths = await Utils.openFileDialog({
  startingFolder: "~/Documents",
  allowedFileTypes: "png,jpg,jpeg",
  canChooseFiles: true,
  canChooseDirectory: false,
  allowsMultipleSelection: true,
});

for (const path of paths) {
  console.log("Selected", path);
}
```

</TabItem>
<TabItem label="Bun">

```ts
import { Utils } from "electrobun/main";

const paths = await Utils.openFileDialog({
  startingFolder: "~/Documents",
  allowedFileTypes: "png,jpg,jpeg",
  canChooseFiles: true,
  canChooseDirectory: false,
  allowsMultipleSelection: true,
});

for (const path of paths) {
  console.log("Selected", path);
}
```

</TabItem>
<TabItem label="Zig">

```zig
const paths = try core.openFileDialogPaths(.{
    .starting_folder = "~/Documents",
    .allowed_file_types = "png,jpg,jpeg",
    .can_choose_files = true,
    .can_choose_directory = false,
    .allows_multiple_selection = true,
});
defer core.freeDialogPaths(paths);

for (paths) |path| {
    std.debug.print("Selected {s}\n", .{path});
}
```

</TabItem>
<TabItem label="Rust">

```rust
let paths_json = core.open_file_dialog(OpenFileDialogOptions {
    starting_folder: "~/Documents",
    allowed_file_types: "png,jpg,jpeg",
    can_choose_files: true,
    can_choose_directory: false,
    allows_multiple_selection: true,
})?;
// paths_json is a JSON array string of the selected paths.
```

</TabItem>
<TabItem label="Go">

```go
pathsJSON, err := core.OpenFileDialog(electrobun.OpenFileDialogOptions{
    StartingFolder:          "~/Documents",
    AllowedFileTypes:        "png,jpg,jpeg",
    CanChooseFiles:          true,
    CanChooseDirectory:      false,
    AllowsMultipleSelection: true,
})
// pathsJSON is a JSON array string of the selected paths.
```

</TabItem>
<TabItem label="Odin">

```odin
options := electrobun.defaultOpenFileDialogOptions()
options.starting_folder = "~/Documents"
options.allowed_file_types = "png,jpg,jpeg"
options.can_choose_directory = false

paths, err := electrobun.openFileDialogPaths(core, options)
defer electrobun.freeDialogPaths(core, paths)

for path in paths {
	fmt.printfln("Selected %s", path)
}
```

</TabItem>
</Tabs>

`openFileDialog()` resolves to `string[]`. An empty array means the user did not
select a path. Every option is optional; current defaults allow files,
directories, and multiple selections. In Zig and Odin, `openFileDialogPaths`
returns a parsed path list (release it with `freeDialogPaths`); Rust and Go
return the raw JSON array string from `open_file_dialog` / `OpenFileDialog`.
None of the native SDKs currently exposes a save dialog.

## Message boxes

<Tabs syncKey="runtime">
<TabItem label="Cottontail">

```ts
import { Utils } from "electrobun/main";

const { response } = await Utils.showMessageBox({
  type: "question",
  title: "Delete file?",
  message: "This action cannot be undone.",
  detail: "The file will be moved to the system trash.",
  buttons: ["Delete", "Cancel"],
  defaultId: 1,
  cancelId: 1,
});

if (response === 0) {
  console.log("Delete confirmed");
}
```

</TabItem>
<TabItem label="Bun">

```ts
import { Utils } from "electrobun/main";

const { response } = await Utils.showMessageBox({
  type: "question",
  title: "Delete file?",
  message: "This action cannot be undone.",
  detail: "The file will be moved to the system trash.",
  buttons: ["Delete", "Cancel"],
  defaultId: 1,
  cancelId: 1,
});

if (response === 0) {
  console.log("Delete confirmed");
}
```

</TabItem>
<TabItem label="Zig">

```zig
const response = try core.showMessageBox(.{
    .box_type = "question",
    .title = "Delete file?",
    .message = "This action cannot be undone.",
    .detail = "The file will be moved to the system trash.",
    .buttons = &.{ "Delete", "Cancel" },
    .default_id = 1,
    .cancel_id = 1,
});

if (response == 0) {
    // Delete confirmed
}
```

</TabItem>
<TabItem label="Rust">

```rust
let response = core.show_message_box(MessageBoxOptions {
    box_type: "question",
    title: "Delete file?",
    message: "This action cannot be undone.",
    detail: "The file will be moved to the system trash.",
    buttons: &["Delete", "Cancel"],
    default_id: 1,
    cancel_id: 1,
})?;

if response == 0 {
    // Delete confirmed
}
```

</TabItem>
<TabItem label="Go">

```go
response, err := core.ShowMessageBox(electrobun.MessageBoxOptions{
    BoxType:   "question",
    Title:     "Delete file?",
    Message:   "This action cannot be undone.",
    Detail:    "The file will be moved to the system trash.",
    Buttons:   []string{"Delete", "Cancel"},
    DefaultID: 1,
    CancelID:  1,
})

if response == 0 {
    // Delete confirmed
}
```

</TabItem>
<TabItem label="Odin">

```odin
options := electrobun.defaultMessageBoxOptions()
options.box_type = "question"
options.title = "Delete file?"
options.message = "This action cannot be undone."
options.detail = "The file will be moved to the system trash."
options.buttons = {"Delete", "Cancel"}
options.default_id = 1
options.cancel_id = 1

response, err := electrobun.showMessageBox(core, options)
if response == 0 {
	// Delete confirmed
}
```

</TabItem>
</Tabs>

The response is the zero-based index of the selected button. Supported types
are `info`, `warning`, `error`, and `question`.

## Notifications

<Tabs syncKey="runtime">
<TabItem label="Cottontail">

```ts
import { Utils } from "electrobun/main";

Utils.showNotification({
  title: "Export complete",
  subtitle: "Quarterly report",
  body: "The PDF is ready.",
  silent: false,
});
```

</TabItem>
<TabItem label="Bun">

```ts
import { Utils } from "electrobun/main";

Utils.showNotification({
  title: "Export complete",
  subtitle: "Quarterly report",
  body: "The PDF is ready.",
  silent: false,
});
```

</TabItem>
<TabItem label="Zig">

```zig
try core.showNotification(.{
    .title = "Export complete",
    .subtitle = "Quarterly report",
    .body = "The PDF is ready.",
    .silent = false,
});
```

</TabItem>
<TabItem label="Rust">

```rust
core.show_notification(NotificationOptions {
    title: "Export complete",
    subtitle: "Quarterly report",
    body: "The PDF is ready.",
    silent: false,
})?;
```

</TabItem>
<TabItem label="Go">

```go
err := core.ShowNotification(electrobun.NotificationOptions{
    Title:    "Export complete",
    Subtitle: "Quarterly report",
    Body:     "The PDF is ready.",
    Silent:   false,
})
```

</TabItem>
<TabItem label="Odin">

```odin
err := electrobun.showNotification(core, electrobun.NotificationOptions{
	title    = "Export complete",
	subtitle = "Quarterly report",
	body     = "The PDF is ready.",
	silent   = false,
})
```

</TabItem>
</Tabs>

`title` is required. `subtitle` uses the platform's closest available
presentation outside macOS.

## Clipboard

<Tabs syncKey="runtime">
<TabItem label="Cottontail">

```ts
import { Utils } from "electrobun/main";

Utils.clipboardWriteText("Hello from Electrobun");
const text = Utils.clipboardReadText();

const png = new Uint8Array();
Utils.clipboardWriteImage(png);
const image = Utils.clipboardReadImage();

const formats = Utils.clipboardAvailableFormats();
Utils.clipboardClear();

void text;
void image;
void formats;
```

</TabItem>
<TabItem label="Bun">

```ts
import { Utils } from "electrobun/main";

Utils.clipboardWriteText("Hello from Electrobun");
const text = Utils.clipboardReadText();

const png = new Uint8Array();
Utils.clipboardWriteImage(png);
const image = Utils.clipboardReadImage();

const formats = Utils.clipboardAvailableFormats();
Utils.clipboardClear();

void text;
void image;
void formats;
```

</TabItem>
<TabItem label="Zig">

```zig
try core.clipboardWriteText("Hello from Electrobun");
const text = try core.clipboardReadText(); // ?[]u8, null when empty

const formats = try core.clipboardAvailableFormatsCsv();
try core.clipboardClear();
```

</TabItem>
<TabItem label="Rust">

```rust
core.clipboard_write_text("Hello from Electrobun")?;
let text = core.clipboard_read_text()?; // Option<String>, None when empty

let formats = core.clipboard_available_formats_csv()?;
core.clipboard_clear()?;
```

</TabItem>
<TabItem label="Go">

```go
_ = core.ClipboardWriteText("Hello from Electrobun")
text, hasText, err := core.ClipboardReadText()

formats, _ := core.ClipboardAvailableFormatsCSV()
_ = core.ClipboardClear()
```

</TabItem>
<TabItem label="Odin">

```odin
_ = electrobun.clipboardWriteText(core, "Hello from Electrobun")
text, has_text := electrobun.clipboardReadText(core)

formats := electrobun.clipboardAvailableFormatsCsv(core)
_ = electrobun.clipboardClear(core)
```

</TabItem>
</Tabs>

Image methods read and write PNG bytes. Reads return `null` when the requested
clipboard representation is unavailable.

<Aside type="note">
`clipboardWriteImage` and `clipboardReadImage` are TypeScript-only; the native
SDKs expose text read/write, clear, and the available-formats list (as CSV).
</Aside>

## Dock icon

```ts
import { Utils } from "electrobun/main";

Utils.setDockIconVisible(false);
const visible = Utils.isDockIconVisible();
void visible;
```

Dock visibility is a macOS application concept. Unsupported platforms return
their native backend's no-op result. The native SDKs expose the same pair on
`Core` (`setDockIconVisible` / `isDockIconVisible` in Zig and Odin,
`set_dock_icon_visible` / `is_dock_icon_visible` in Rust,
`SetDockIconVisible` / `IsDockIconVisible` in Go).

## Paths

`Utils.paths` resolves standard user directories and app-scoped directories:

```ts
import { Utils } from "electrobun/main";

const {
  home,
  appData,
  config,
  cache,
  temp,
  logs,
  documents,
  downloads,
  desktop,
  pictures,
  music,
  videos,
  userData,
  userCache,
  userLogs,
} = Utils.paths;

void home;
void appData;
void config;
void cache;
void temp;
void logs;
void documents;
void downloads;
void desktop;
void pictures;
void music;
void videos;
void userData;
void userCache;
void userLogs;
```

`userData`, `userCache`, and `userLogs` include the packaged app identifier and
physical install-root name (`<base>/<identifier>/<install-root>`) — the same
layout on every runtime. The install-root name normally matches the packaged
release channel. An app updated from a supported Electrobun v1 release keeps
its existing physical root; this preserves its data, browser profile, and
update state in place. In a development run, malformed or missing package
metadata can produce empty identifier/root path components. The native SDKs
resolve the same fields through their `Paths` type — see the tabbed examples on
the [Paths page](/electrobun/apis/paths/).

For installer builds, these three app-scoped locations are the only user data
included by Electrobun's `App and Data` uninstall action. It is limited to the
current identifier and recorded physical install root; see
[Uninstalling](/electrobun/guides/uninstalling/) for details and platform
availability.

## Quitting

```ts
import { Utils } from "electrobun/main";

function finishShutdown(exitCode = 0) {
  Utils.quit(exitCode);
}

void finishShutdown;
```

`quit(exitCode)` emits the application `before-quit` event, honors a
cancellation, and then performs native cleanup before exiting with the requested
status. The exit code defaults to `0`. Electrobun also routes `process.exit()`
through that cleanup path while the native runtime is active.

<Aside type="note">
The `before-quit` emitter flow is TypeScript-only. Native SDKs shut down with
`stopEventLoop` (plus `quitGracefully` in Zig and Odin) and observe quit
requests through the quit-requested handler registered on `Core`.
</Aside>

<Aside type="caution">
Do not call `process.reallyExit()` or terminate the process from an external
signal handler unless bypassing window and native resource cleanup is
intentional.
</Aside>

=== FILE: apis/webgpu.mdx ===
---
title: "WebGPU"
description: "Render and compute with the native Dawn WebGPU implementation."
---
import { Aside, Tabs, TabItem } from "@astrojs/starlight/components";

Electrobun can bundle Dawn and expose WebGPU to Bun and Cottontail main
processes. It supports native GPU windows, WGPU surfaces embedded in webview
layouts, compute workloads, and direct access to Dawn's C API.

<Aside type="note">
The TypeScript adapter API on this page — `webgpu.createContext()`,
`webgpu.navigator.requestAdapter()`, `GpuWindow`, the canvas shim, and the
three.js/Babylon integrations — is available in the Cottontail and Bun
runtimes only. Native main processes (Zig, Rust, Go, Odin) use the SDK-level
path described in [Native WGPU views](#native-wgpu-views).
</Aside>

## Enable Dawn

Enable `bundleWGPU` on each target that needs it:

```typescript
import type { ElectrobunConfig } from "electrobun";

export const config: ElectrobunConfig = {
  app: {
    name: "GPU Example",
    identifier: "dev.example.gpu-example",
    version: "0.1.0",
  },
  build: {
    mainProcess: "bun",
    mac: { bundleWGPU: true },
    win: { bundleWGPU: true },
    linux: { bundleWGPU: true },
  },
};
```

Hutch packages the platform's Dawn dynamic library beside the application.
The main-process loader locates that packaged library at runtime.

## Create A GPU Window

`GpuWindow` owns a native top-level window and a full-window `WGPUView`.
`webgpu.createContext()` returns the Dawn instance and surface plus the
`GPUCanvasContext` used by the WebGPU API.

```typescript
import { GpuWindow, webgpu } from "electrobun/main";

const win = new GpuWindow({
  title: "WebGPU",
  frame: { width: 800, height: 600 },
});

const created = webgpu.createContext(win);
const adapter = await webgpu.navigator.requestAdapter({
  compatibleSurface: created.context,
});
const device = await adapter.requestDevice();

created.context.configure({
  device,
  format: webgpu.navigator.getPreferredCanvasFormat(),
  alphaMode: "premultiplied",
});
```

Create pipelines, buffers, textures, and command encoders from `device` using
the standard WebGPU API. Present render passes through the configured context.
See the `wgpu` template for a complete render loop and the `wgpu-mlp` template
for compute and buffer readback.

## Window Controls

`GpuWindow` exposes the same window-state operations as `BrowserWindow` where
they apply.

```typescript
import { GpuWindow } from "electrobun/main";

const win = new GpuWindow({
  title: "GPU Tool",
  frame: { x: 160, y: 120, width: 960, height: 640 },
  titleBarStyle: "hiddenInset",
  trafficLightOffset: { x: 12, y: 10 },
  transparent: false,
  activate: false,
});

win.showInactive();
win.activate();
win.setAlwaysOnTop(true);
win.setSize(1024, 720);
win.setPosition(200, 140);
win.setWindowButtonPosition(16, 12);

console.log({
  size: win.getSize(),
  minimized: win.isMinimized(),
  maximized: win.isMaximized(),
  fullScreen: win.isFullScreen(),
});
```

`trafficLightOffset` and `setWindowButtonPosition()` affect macOS windows with
`titleBarStyle: "hiddenInset"`; they are ignored on Windows and Linux.

## Embedded GPU Surfaces

Use [`<electrobun-wgpu>`](/electrobun/apis/browser/electrobun-wgpu-tag) when a
native WGPU surface must follow an element inside a webview layout. The tag
reports a native view ID to the host page, which sends it to the main process
through application RPC.

For native main processes, start from the `zig-wgpu`, `rust-flock-wgpu`,
`go-maze-wgpu`, or one of the Odin WGPU templates. The Odin set covers
data-oriented particles, fluid simulation, soft-body physics, cellular
materials, and procedural tree generation. Each demonstrates the correct
SDK-specific surface bridge and lifecycle.

## Native WGPU views

The native SDKs create a WGPU view directly with `createWGPUView`, load the
bundled Dawn library, and bootstrap instance, surface, adapter, and device in
one call keyed by the WGPU view id.

<Tabs syncKey="runtime">
<TabItem label="Zig">

```zig
const wgpu_view_id = try core.createWGPUView(.{
    .window_id = window_id,
    .frame = .{ .x = 0, .y = 0, .width = 640, .height = 420 },
});

var native = try electrobun.WgpuNative.load(allocator);
defer native.close();
const context = try electrobun.WgpuContext.createForWgpuView(core, &native, wgpu_view_id);
const queue = context.getQueue(&native);

// Per-frame surface calls are marshaled to the main thread:
try core.wgpuSurfaceConfigureMainThread(context.surface_ptr, config_ptr);
try core.wgpuSurfaceGetCurrentTextureMainThread(context.surface_ptr, surface_texture_ptr);
_ = try core.wgpuSurfacePresentMainThread(context.surface_ptr);
```

</TabItem>
<TabItem label="Rust">

```rust
let wgpu_view_id = core.create_wgpu_view(WGPUViewOptions::new(
    window_id,
    Rect::new(0.0, 0.0, 640.0, 420.0),
))?;

let native = WgpuNative::load()?;
let context = WgpuContext::create_for_wgpu_view(core, &native, wgpu_view_id)?;
let queue = context.get_queue(&native)?;

// Per-frame surface calls are marshaled to the main thread:
core.wgpu_surface_configure_main_thread(context.surface_ptr, config_ptr)?;
core.wgpu_surface_get_current_texture_main_thread(context.surface_ptr, surface_texture_ptr)?;
core.wgpu_surface_present_main_thread(context.surface_ptr)?;
```

</TabItem>
<TabItem label="Go">

```go
wgpuViewID, err := core.CreateWGPUView(electrobun.NewWGPUViewOptions(
    windowID,
    electrobun.NewRect(0, 0, 640, 420),
))

native, err := electrobun.LoadWgpuNative()
context, err := electrobun.CreateWgpuContextForWGPUView(core, native, wgpuViewID)
queue, err := context.GetQueue(native)

// Per-frame surface calls are marshaled to the main thread:
_ = core.WgpuSurfaceConfigureMainThread(context.Surface, configPtr)
_ = core.WgpuSurfaceGetCurrentTextureMainThread(context.Surface, surfaceTexturePtr)
_, _ = core.WgpuSurfacePresentMainThread(context.Surface)
```

</TabItem>
<TabItem label="Odin">

```odin
wgpu_view_options := electrobun.defaultWGPUViewOptions(window_id)
wgpu_view_options.frame = {x = 0, y = 0, width = 640, height = 420}
wgpu_view_id, view_err := electrobun.createWGPUView(core, wgpu_view_options)

native, native_err := electrobun.wgpuNativeLoad()
ctx, ctx_err := electrobun.createForWgpuView(core, &native, wgpu_view_id)
queue := electrobun.getQueue(ctx, &native)

// Per-frame surface calls are marshaled to the main thread:
_ = electrobun.wgpuSurfaceConfigureMainThread(core, ctx.surface_ptr, &config)
_ = electrobun.wgpuSurfaceGetCurrentTextureMainThread(core, ctx.surface_ptr, &surface_texture)
_, _ = electrobun.wgpuSurfacePresentMainThread(core, ctx.surface_ptr)
```

</TabItem>
</Tabs>

Surface configure, texture acquisition, and present must go through the
`Core`'s main-thread-marshaled calls shown above. All other Dawn functions
(pipelines, encoders, buffers, queue submission) are resolved by the app
directly from the loaded Dawn library — the native SDKs do not wrap the full
`webgpu.h` API. A WGPU view id can also come from an `<electrobun-wgpu>`
element in a webview, sent to the main process over the bridge.

## Canvas Shim

<Aside type="note">Cottontail/Bun only.</Aside>

Libraries that expect a browser-like canvas can use Electrobun's maintained
canvas shim instead of recreating a partial DOM object. Install the WebGPU
globals before constructing the library renderer.

```typescript
import { GpuWindow, webgpu } from "electrobun/main";

const win = new GpuWindow({
  title: "Library Integration",
  frame: { width: 960, height: 540 },
});

webgpu.install();
const canvas = webgpu.utils.createCanvasShim(win);
const context = canvas.getContext("webgpu");
if (!context) throw new Error("WebGPU context is unavailable");
```

The `wgpu-babylon` and `wgpu-threejs` templates are the source-of-truth
integrations for their respective library versions. Copying their renderer
setup avoids relying on browser DOM methods that do not exist in a native GPU
window.

## Compute And Readback

WebGPU compute uses the standard command encoder and buffer mapping APIs. A
typical readback maps a buffer created with `MAP_READ`, copies its mapped
range, and unmaps it:

```typescript context="webgpu-readback"
await readbackBuffer.mapAsync();
const mapped = readbackBuffer.getMappedRange();
const result = new Uint8Array(new Uint8Array(mapped));
readbackBuffer.unmap();
```

The fragment above assumes `readbackBuffer` is a `GPUBuffer` written by an
already-submitted compute pass. The `wgpu-mlp` template contains the complete
pipeline, dispatch, synchronization, and readback code.

## Raw Dawn FFI

`WGPU.native` exposes the generated Dawn C bindings for low-level renderers or
custom language bridges.

```typescript
import { WGPU } from "electrobun/main";

if (!WGPU.native.available) {
  throw new Error("Dawn was not bundled or could not be loaded");
}

console.log("Dawn symbols are available", Boolean(WGPU.native.symbols));
```

The raw API uses native pointers and C descriptors. Prefer the WebGPU adapter
unless the application deliberately owns that memory and lifecycle. The
`wgpu` and `wgpu-threejs` templates contain checked raw-FFI implementations.

## Runtime Resolution

The loader checks `ELECTROBUN_WGPU_PATH` first, then packaged locations near
the executable. If `WGPU.native.available` is `false`, verify that
`bundleWGPU` is enabled for the current target and that the Dawn library was
included in the packaged application.

=== FILE: guides/architecture/overview.mdx ===
---
title: "Architecture Overview"
description: "How Hutch, main-process runtimes, Electrobun Core, and webviews fit together."
---

This page is the mental model for how an Electrobun app is built, what's
inside it, and what happens when it runs. Nothing here is required reading to
ship an app — but when you want to know *why* the framework is shaped the way
it is, this is the place.

The short version: Hutch does everything at build time and ships nothing;
your main process owns the app at runtime; webviews render UI in isolation
and talk to the main process over bridges; and distribution is a small
self-extractor plus verified transactional updates served from static storage.

## Build-time architecture

Hutch is the only build orchestrator. When you run a build, it:

1. Loads tasks and any optional exact Electrobun or external package-manager
   override from `hutch.config.ts`.
2. Loads the app, build, and distribution description from
   `electrobun.config.ts`.
3. Verifies the selected platform core archive in `~/.hutch` and refreshes the
   generated project `.hutch/devkit` SDK projection.
4. Bundles TypeScript views using dependencies already installed by Hutch's
   built-in resolver or the project's explicitly selected external manager.
5. Bundles a Cottontail or Bun main process, or compiles a Zig, Rust, Go, or
   Odin main process.
6. Assembles the platform application bundle. For Cottontail, scans the bundled
   main process, merges explicit capability includes, and packages the core
   runtime plus selected standard-library modules and their dependencies.
7. For canary and stable builds, creates the self-extracting wrapper,
   compressed update archive, metadata, optional patch, and platform
   installer.
8. Applies configured code signing and notarization.

Hutch and its compiler toolchains are not shipped inside the finished app —
what your users download contains only what the app needs to run.

Hutch's built-in npm-compatible resolver is the JavaScript default:
`hutch install` reads `package.json`, writes `hutch.lock`, and `hutch pm exec`
runs an already-installed binary from the nearest project's
`node_modules/.bin`. The top-level `hutch.config.ts` `packageManager` selection
may instead name npm, Bun, pnpm, Yarn, or a custom executable; in that explicit
mode, `hutch install` and `hutch pm ...` delegate to the selected tool. Cargo,
Go modules, and other language managers keep their normal ownership.

## Runtime architecture

Every Electrobun application contains:

- a small platform launcher
- the selected main-process runtime or native executable
- Electrobun Core and the platform native wrapper
- bundled application code and view assets
- optional CEF and WGPU libraries
- updater metadata and patch tooling

At runtime there's a clear division of authority. The main process owns
application state and privileged native objects; it opens windows, views,
menus, trays, and GPU surfaces through Electrobun Core. Each webview is a
separate native browsing context that communicates with the main process only
through Electrobun's event and RPC bridges — page JavaScript never holds
privileged APIs directly. The renderer controls its exact operating-system
process model.

## Main-thread model

Native GUI frameworks require their event loop on the process main thread,
and Electrobun respects that instead of fighting it. Cottontail and Bun run
your application JavaScript on a worker while Electrobun Core owns the
main-thread event loop. Native SDKs expose the same arrangement directly:
application code initializes the core, starts its work on another thread
where needed, and enters `runMainThread`.

The Go SDK pins the main goroutine to the main OS thread during package
initialization. Call `RunMainThread` from `main()`, keeping application work
on other goroutines as needed.

## Application resources

The exact platform layout differs, but the resource model is consistent:

```text
Resources/
|-- app/
|   |-- bun/             # Bundled JavaScript main process, when selected
|   `-- views/           # Bundled and copied webview assets
`-- version.json         # Installed version and update metadata
```

Use the `views://` URL scheme to load files under `Resources/app/views` —
it resolves to the right place on every platform, so you never construct
filesystem paths to your own assets.

On macOS, executables and dynamic libraries live under `Contents/MacOS`,
assets under `Contents/Resources`, and optional frameworks under
`Contents/Frameworks`. Windows and Linux bundles use equivalent `bin` and
`Resources` directories.

## Webview engines

System views are the default, which is a big part of why Electrobun apps stay
small — the browser engine is already on the user's machine:

- macOS: WKWebView
- Windows: WebView2
- Linux: WebKitGTK 4.1

When a pinned Chromium engine matters more than download size, bundle CEF.
macOS and Windows applications can select the renderer per view. A Linux
process uses its CEF wrapper when CEF is bundled and GTK WebKit otherwise.

Two custom elements extend what a webview can hold. `<electrobun-webview>`
creates a separately composited native browser view — a real independent
browsing context, not an iframe. `<electrobun-wgpu>` places a native GPU
surface in the same layout. Electrobun synchronizes their bounds, visibility,
masking, and input behavior with the host document, so they behave like
ordinary elements on the page.

## Distribution wrapper

A canary or stable release wraps the full runnable app in a small native
self-extractor whose payload is a Zstandard-compressed archive. On first
launch, the wrapper verifies and extracts the application to its managed
location, then starts the inner app — from the user's perspective, the app
just opens.

Hutch emits a DMG on macOS, a Setup ZIP on Windows, and a self-extracting
setup archive on Linux. See
[Bundling and Distribution](/electrobun/guides/bundling-and-distribution/)
for the artifact layout.

## Updates

The installed app compares its local hash with hosted update metadata, follows
available hash-named patches or downloads the named compressed archive. A
native post-exit helper then validates the bundle identity and replaces the app
with rollback protection before relaunching it. The same transaction is used on
Windows, macOS, and Linux; Windows uses Task Scheduler only to run the helper
after locked processes exit.

There's no update server to run — static object storage is sufficient. The
application decides when to check, download, install, and relaunch through
the [Updater API](/electrobun/apis/updater/).

## Development output

Dev builds skip the distribution artifacts and route main-process, webview,
and native diagnostics to the invoking terminal. System webviews and CEF both
forward browser console output in development mode, so `console.log` in a
view shows up next to your main-process logs.

=== FILE: guides/architecture/webview-tag.mdx ===
---
title: "Webview Tag Architecture"
description: "How Electrobun maps a DOM anchor to an isolated native BrowserView."
---

`<electrobun-webview>` is Electrobun's native iframe-style primitive.
The custom element is an anchor in the host DOM; its content is rendered by a
separate native `BrowserView`, not as a DOM descendant.

```html
<electrobun-webview
  src="https://example.com"
  sandbox
  style="display: block; width: 100%; height: 500px"
></electrobun-webview>
```

## Creation

Electrobun injects a preload into each host webview. That preload registers the
custom element and, after it enters the document, sends its initial URL, HTML,
renderer, partition, sandbox state, navigation rules, and bounding rectangle
to the main process. The native core creates the matching `BrowserView` and
returns its numeric ID.

The element remains a lightweight anchor. Removing it destroys the native
view; reinserting it creates a new view and ID.

## Geometry

An overlay controller observes layout and synchronizes the anchor's viewport
rectangle with the native view. It uses animation, resize, scroll, and periodic
checks so ordinary DOM and CSS layout can position the embedded view.

The native surface is a distinct layer. Host `z-index` cannot paint an element
over it. Mask selectors solve this by sending rectangles for matching host DOM
elements to native code, which cuts corresponding holes in the overlay.

## Navigation And Events

Changing `src` or `html`, or invoking methods such as `loadURL()`, sends a
navigation command to the native view. Calls made before initialization are
queued until the native ID exists.

Native navigation, loading, download, new-window, and host-message events are
routed back to the custom element's `on()` listeners. Event payloads cross a
serialization boundary; the embedded page is not directly accessible through
the host DOM.

## Communication

Trusted embedded content can use Electrobun's typed RPC transport. A sandboxed
tag disables application RPC but retains native lifecycle events and the
event-only `window.__electrobunSendToHost()` bridge. This distinction lets an
application observe untrusted content without exposing its request handlers.

Sandbox mode is one layer of the security model, not a blanket guarantee. Use
navigation rules, validate every message payload, avoid injecting secrets into
preloads, and treat remote content as untrusted.

## Renderer Model

The concrete process model belongs to the renderer. WKWebView, WebView2, GTK
WebKit, and CEF use different browser and renderer process arrangements;
Electrobun does not promise one operating-system process per tag. The stable
contract is that the embedded document has its own native webview and browsing
context rather than being a child DOM document.

On macOS and Windows, CEF and native views can coexist when CEF is bundled. A
Linux build selects CEF or GTK WebKit for the process. Renderer-specific mask,
passthrough, and transparent-window constraints are documented in the
[`<electrobun-webview>` API](/electrobun/apis/browser/electrobun-webview-tag).

=== FILE: guides/bundling-and-distribution.mdx ===
---
title: "Bundling And Distribution"
description: "Create stable and canary installers, update archives, and patches."
---

When your app is ready to leave your machine, one command produces everything
distribution needs: the application bundle, a compressed update archive, a
platform installer, update metadata, and optionally a delta patch from your
previous release. This page explains what those artifacts are, what they're
named, and where to put them.

Hutch builds for the current host platform. Use canary builds for testing and
stable builds for user-facing releases — the two channels are
independent, so testers can run prerelease builds alongside the stable
app. A typical project wires both into `hutch.config.ts`:

```ts docs=syntax
export default {
  scripts: {
    install: ["hutch", "install", "--frozen-lockfile"],
    dev: ["hutch", "electrobun", "dev", "--watch"],
    "build:canary": ["hutch", "electrobun", "build", "--env=canary"],
    "build:stable": ["hutch", "electrobun", "build", "--env=stable"],
  },
};
```

`electrobun.version` is optional: npm-launched commands use the installed
package's paired version. A direct Hutch project selects the active release
channel initially, then `prepare`, `build`, `run`, and `dev` preserve its
projected release; an explicit `sync` advances it. An exact pin overrides all
of those defaults.

```bash
hutch run install
hutch run build:canary
hutch run build:stable
```

## Cottontail capability packaging

For `build.mainProcess: "cottontail"`, Hutch scans the final main-process bundle
and packages the core runtime plus selected standard-library capabilities and
their dependencies. Unused optional modules stay out of the app. Keep the
generated runtime directories with the executable when distributing a bundle.

Code loaded dynamically may need explicit includes in
`build.cottontail.capabilities` in `electrobun.config.ts`. These add to automatic
detection; they do not replace it. Before publishing, exercise those code paths
in the built app on every supported platform. See the
[Cottontail guide](/electrobun/guides/cottontail/#modular-standard-library)
for examples and troubleshooting.

## Release Host

Artifacts are flat files and can be served from R2, S3, another object store,
or any static HTTP host. Configure the public folder URL:

```typescript
import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "My Cool App",
    identifier: "com.example.my-cool-app",
    version: "1.0.0",
  },
  build: {
    mainProcess: "cottontail",
    cottontail: { entrypoint: "src/bun/index.ts" },
  },
  release: {
    baseUrl: "https://releases.example.com/my-cool-app",
    generatePatch: true,
  },
} satisfies ElectrobunConfig;
```

Upload the contents of `artifacts/` without renaming the files. The Updater
constructs URLs from this base and the channel/platform prefix.

## Host-Native Matrix

Run the same build on all six targets. Both macOS architectures require macOS
14 or later:

| Runner | Stable installer prefix | Stable updater prefix |
| --- | --- | --- |
| macOS ARM64 | `macos-arm64-` | `stable-macos-arm64-` |
| macOS x64 (Intel) | `macos-x64-` | `stable-macos-x64-` |
| Windows x64 | `win-x64-` | `stable-win-x64-` |
| Windows ARM64 | `win-arm64-` | `stable-win-arm64-` |
| Linux x64 | `linux-x64-` | `stable-linux-x64-` |
| Linux ARM64 | `linux-arm64-` | `stable-linux-arm64-` |

Canary builds prepend `canary-` to both prefixes. The updater keeps the
installed architecture, so an existing x64 app needs an explicit ARM64 install.

## Artifact Names

Hutch removes ASCII spaces from the app name in artifact filenames. For an app
named `My Cool App`, a macOS ARM64 canary build produces:

```text
artifacts/
|-- canary-macos-arm64-update.json
|-- canary-macos-arm64-MyCoolApp-canary.dmg
|-- canary-macos-arm64-MyCoolApp-canary.app.tar.zst
`-- canary-macos-arm64-<previous-hash>.patch
```

A Windows x64 canary build produces:

```text
artifacts/
|-- canary-win-x64-update.json
|-- canary-win-x64-MyCoolApp-Setup-canary.zip
|-- canary-win-x64-MyCoolApp-canary.tar.zst
`-- canary-win-x64-<previous-hash>.patch
```

The Windows zip contains the visible setup executable and a hidden installer
payload. The executable retains the display name's spaces.

A Linux x64 canary build produces:

```text
artifacts/
|-- canary-linux-x64-update.json
|-- canary-linux-x64-MyCoolApp-canary-Setup.tar.gz
|-- canary-linux-x64-MyCoolApp-canary.tar.zst
`-- canary-linux-x64-<previous-hash>.patch
```

The Linux installer archive contains an executable named `installer` and a
README. Stable installer names omit both the channel prefix and `-canary`:

```text
macos-arm64-MyCoolApp.dmg
win-x64-MyCoolApp-Setup.zip
linux-x64-MyCoolApp-Setup.tar.gz
```

Stable update JSON, compressed archives, and patches retain the
`stable-<os>-<arch>-` protocol prefix used by compatible Electrobun v1.18.1+
clients. Installer artifacts do not use that prefix. Keep the app name,
identifier, and existing update base URL unchanged for the first 2.0 release;
see [Updates](/electrobun/guides/updates/).

## Delta Patches

When `release.generatePatch` is true and `release.baseUrl` is present, Hutch:

1. Fetches `<channel>-<os>-<arch>-update.json` from the release host.
2. Downloads that release's `.tar.zst` update archive.
3. Decompresses it and creates a binary patch to the new uncompressed tar.
4. Names the patch after the previous bundle hash.

The first release has no predecessor and therefore no patch. A missing or
invalid previous artifact also skips patch generation while preserving the
full update archive. Set `generatePatch: false` for an intentional build that
must not consult the release host.

Each release contributes one `<previous-hash>.patch`. Static hosts that retain
those immutable files form a patch trail, so an app several releases behind can
apply successive patches until its current hash equals `update.json.hash`. A
missing or failed patch falls back to the full archive named in the metadata.

See [Updater](/electrobun/apis/updater) for application-side checks, downloads,
and installation.

See [Uninstalling](/electrobun/guides/uninstalling/) for the standalone
uninstaller included with installer builds and how it treats application data.

## Platform Packaging

### macOS

Hutch emits a DMG by default and an `.app.tar.zst` update archive. Release
signing and notarization run when configured. Set `build.mac.createDmg: false`
when a release only needs the app and update archive.

### Windows

Hutch emits a zip containing a setup executable and adjacent hidden payload.
The installed application is a GUI-subsystem executable; dev launches attach
to the invoking console.

### Linux

Hutch emits a `.tar.gz` installer containing a self-extracting setup and a
`.tar.zst` update archive. Optional Flatpak configuration emits a separate
expanded payload and `flatpak-builder` manifest; Hutch does not run
`flatpak-builder`.

## Build Hooks

`preBuild`, `postBuild`, `postWrap`, and `postPackage` can validate inputs or
augment the package at defined stages. Their exact timing and environment are
documented in [Build Configuration](/electrobun/apis/cli/build-configuration#build-hooks).

=== FILE: guides/changelog/index.mdx ===
---
title: "Changelog"
---
              <p>A running log of Electrobun releases. The list below is newest first. Each release page calls out behavior changes that affect app developers and end users; pages with a <strong>Migration Notes</strong> section describe steps you may need to take when upgrading.</p>

## Releases

              <ul>
                <li>
                  <a href="/electrobun/guides/changelog/unreleased/"><strong>Unreleased</strong></a>
                </li>
                <li>
                  <a href="/electrobun/guides/changelog/v2-0-6/"><strong>v2.0.6</strong></a> — 2026-11-04
                </li>
                <li>
                  <a href="/electrobun/guides/changelog/v2-0-5/"><strong>v2.0.5</strong></a> — 2026-10-26
                </li>
                <li>
                  <a href="/electrobun/guides/changelog/v2-0-4/"><strong>v2.0.4</strong></a> — 2026-10-18
                </li>
                <li>
                  <a href="/electrobun/guides/changelog/v2-0-2/"><strong>v2.0.2</strong></a> — 2026-09-29
                </li>
                <li>
                  <a href="/electrobun/guides/changelog/v2-x/"><strong>v2.x</strong></a> - Hutch, Cottontail, and native main-process runtimes
                </li>
                <li>
                  <a href="/electrobun/guides/changelog/v1-18-1/"><strong>v1.18.1</strong></a> — 2026-05-04
                </li>
                <li>
                  <a href="/electrobun/guides/changelog/v1-18-0/"><strong>v1.18.0</strong></a> — 2026-05-03
                </li>
                <li>
                  <a href="/electrobun/guides/changelog/v1-16-0/"><strong>v1.16.0</strong></a> — 2026-03-15
                </li>
                <li>
                  <a href="/electrobun/guides/changelog/v1-15-1/"><strong>v1.15.1</strong></a> — 2026-03-05
                </li>
                <li>
                  <a href="/electrobun/guides/changelog/v1-14-4/"><strong>v1.14.4</strong></a> — 2026-02-23
                </li>
                <li>
                  <a href="/electrobun/guides/changelog/v1-14-3/"><strong>v1.14.3</strong></a> — 2026-02-23
                </li>
                <li>
                  <a href="/electrobun/guides/changelog/v1-13-1/"><strong>v1.13.1</strong></a> — 2026-02-19
                </li>
                <li>
                  <a href="/electrobun/guides/changelog/v1-12-3/"><strong>v1.12.3</strong></a> — 2026-02-10
                </li>
                <li>
                  <a href="/electrobun/guides/changelog/v1-12-1/"><strong>v1.12.1</strong></a> — 2026-02-07
                </li>
                <li>
                  <a href="/electrobun/guides/changelog/v1-0-0/"><strong>v1.0.0</strong></a> — Migrating from 0.x to v1
                </li>
              </ul>

=== FILE: guides/changelog/unreleased.mdx ===
---
title: "Unreleased"
---

Changes since [v2.0.6](/electrobun/guides/changelog/v2-0-6/).

## Managed services preview

- [Electrobun Managed Deploys](/electrobun/guides/managed-deploys/) adds staged
  per-runner uploads and separate public/prerelease publication through Dash.
  Hutch's native `upload` command infers release identity and platforms from
  the existing artifact folder; `publish` validates the accumulated release
  without requiring local artifacts or a JavaScript runner.
- Managed update URLs preserve the ordinary flat filenames and hash-named
  patch chain, including full-download fallback. Existing static-hosted apps
  keep their release layout and behavior. Stable and canary remain separate
  builds; optional custom hostnames are bound to one managed app.
- [`app.getInstallationId()`](/electrobun/apis/app/) exposes the persistent
  installation identity shared by managed updates and Insights. Developers can
  show it in About/Help or settings for prerelease enrollment without enabling
  analytics. The equivalent getter is available in every native SDK.
- [Electrobun Insights](/electrobun/guides/insights/) adds opt-in lifecycle,
  duration, version/platform analytics, and custom events through a separate
  endpoint. It is off by default and works independently of hosting. Bun,
  Cottontail, Zig, Rust, Go, and Odin share the native queue, persisted consent,
  offline delivery, and session recovery behavior. Optional user associations
  affect future custom events without splitting app sessions.
- Public docs now have separate Managed Deploys and Insights guides, a
  cross-runtime [Insights API reference](/electrobun/apis/insights/), and upload,
  publish, and build-configuration references. The services remain in preview.

## Shared native updater

- The Zig core now owns updater checks, downloads, preparation, apply handoff,
  and result reconciliation for every SDK. Bun and Cottontail retain their
  existing `Updater` public API and `before-quit` approval behavior.
- [Zig, Go, Odin, and Rust](/electrobun/apis/updater-native/) gain typed queued
  requests, operation snapshots, event polling, cancellation, and explicit
  apply approval or veto. The apply helper starts only after approval; `quitReady`
  confirms handoff before ordinary application teardown. Core workers never
  call language-runtime callbacks or force an application exit.
- Existing static-host update and patch filenames, patch chains, managed
  installation identity, and direct-update authority rules are preserved.
  Older hash-named checksum sidecars remain readable.
  Configuration alone does not schedule network checks.
- Regression coverage checks the JavaScript API facade, native SDK ownership
  and schema handling, missing-symbol errors, approval/veto, worker shutdown,
  and compatibility with the established release protocol.
- Startup reconciliation waits for the helper's completion result even when
  the newly installed app starts after its staging directory has been removed.
  This fixes a race that could hide a successful update from the SDK's events.

## Updater manifest compatibility

- Hutch preserves the original `<channel>-<os>-<arch>-update.json` shape,
  including `artifact: { file }`. A preview change added integrity fields to
  that object and broke updates for already-installed native clients whose
  parsers reject unknown fields. Restoring the original shape lets those
  clients discover updates again.
- Exact archive integrity now lives in
  `<channel>-<os>-<arch>-checksum.json`, containing the build `hash` plus
  `tarSha256` and `tarSize` for the uncompressed tar. Hutch generates one
  fixed-name checksum per channel/target, so rebuilding and uploading to the
  same release folder replaces it instead of accumulating hash-named files.
  Patch filenames still use the source build's hash. Hutch no longer generates
  `*-update-v2.json`.
- The Updater API validates `*-update.json` before reading the checksum sidecar.
  The sidecar's build hash must match; publication between requests triggers
  a bounded metadata retry. A `404` at the fixed filename falls back to the
  older hash-named sidecar. If neither exists, older hosting behavior is
  preserved; malformed checksum data or other request failures fail the check.
  Existing inline integrity fields remain supported by newer clients.
  Additional manifest fields are ignored while recognized fields remain
  validated. Streamed downloads, hash-named patch chains, and full-download
  fallback are unchanged.
- **Checksum cleanup:** After publishing fixed-name sidecars to a self-hosted
  folder, remove old `<channel>-<os>-<arch>-<hash>-checksum.json` files once.
  Hutch does not delete remote files automatically. Earlier updater betas
  requesting the old filename retain their update behavior after a `404`,
  without the optional tar SHA-256 check. Managed Deploys serves compatible
  old checksum URLs for eligible retained builds without storing duplicate
  files. See [checksum cleanup](/electrobun/guides/updates/#remove-old-hash-named-checksum-files).
- **Update-host cleanup:** If you uploaded `*-update-v2.json` to your servers,
  publish the compatible canonical `*-update.json`, checksum sidecar, full
  archive, and patches. Then delete the old
  `<channel>-<os>-<arch>-update-v2.json` files and purge any
  cached copies. Those URLs must return HTTP `404` so previously released
  clients that probe v2 can fall back to `update.json`. Leaving an old v2 file
  in place can hide newer releases from those clients. Keep the current
  `update.json`, checksum sidecar, full archives, and retained patches.

## macOS startup fixes

- Cottontail loads Electrobun's native library and CEF before starting its
  JavaScript worker, preventing a race between CEF allocator initialization and
  JavaScriptCore allocations.
- Native profile-directory lookup safely reads the installation-root override
  while other threads change environment variables during startup, preventing
  an intermittent crash.

## Native UI fixes

- Range sliders now support clicking the track and dragging the thumb, including
  dragging outside the control. Values respect `min`, `max`, and `step`, and
  controlled values stay synchronized with the painted thumb and input events.

## Windows builds

- Zig, Go, and Odin toolchain ZIP downloads use Windows' native archive tool.
  Cold builds no longer depend on compatible PowerShell archive modules being
  inherited from the calling shell.

## Warren UI fixes

- `Show` retains its current branch when reactive data changes without changing
  whether the condition is true. Polling no longer recreates forms or resets
  expanded sections, focus, and selection in that branch.
- Unchanged reactive text leaves its existing text node untouched, preserving
  text selection during repeated data refreshes.

## Validation

- Hardened the Bunny desktop smoke test against neutral startup poses, ambiguous
  tilt projections, and repainting behind transparent windows. It now verifies
  the bunny's rotation and return to neutral within a bounded response deadline.

=== FILE: guides/changelog/v2-x.mdx ===
---
title: "Electrobun v2.x"
description: "The Electrobun 2.0 toolchain, runtime, platform, and API release."
---

Electrobun 2.0 introduces a new build tool and JavaScript runtime, six supported
main-process runtimes, native builds across macOS, Windows, and Linux, and a
large reconciliation of the 1.x issue and pull-request backlog.

> This page describes the original 2.0 release. Bun is now the default main
> process and Hutch script runner; Cottontail is an experimental opt-in runtime.

## By the numbers

- Resolved **138 issues and 47 pull requests** during the 2.0 reconciliation.
- Tracks **8,460 owned Node and Bun compatibility test files** across
  Cottontail and Hutch. The current manifests enable 8,436 files and record 24
  explicit expected failures.
- Backed by roughly **1,800 first-party tests and Kitchen Sink scenarios**, in
  addition to the owned compatibility corpus.
- Supports six main-process runtimes: Cottontail, Bun, Zig, Rust, Go, and Odin.

The original 2.0 size comparison used Cottontail 0.2.3 and Bun 1.3.13.
Cottontail was smaller on every supported release target measured. These
figures are extracted executable sizes, not compressed archive sizes.

| Platform | Cottontail | Bun | Reduction |
| --- | ---: | ---: | ---: |
| macOS ARM64 | 57,714,960 B | 63,072,928 B | 8.5% |
| Linux x64 | 59,480,576 B | 101,814,712 B | 41.6% |
| Linux ARM64 | 55,183,872 B | 101,309,000 B | 45.5% |
| Windows x64 | 55,587,328 B | 117,660,760 B | 52.8% |

## Hutch build tooling

- Hutch replaces the old project-vendored Electrobun CLI for project scripts,
  devkit synchronization, builds, native toolchains, and distribution.
- Hutch's built-in npm-compatible resolver owns JavaScript dependencies and
  `hutch.lock` by default. npm, pnpm, Yarn, or Bun may be selected explicitly;
  Cargo and Go modules remain authoritative for their ecosystems.
- `electrobun.version` is an optional exact override in `hutch.config.ts`.
  Otherwise npm-launched commands use the package's paired release and direct
  Hutch projects float on the release channel, remaining steady between
  explicit syncs. Hutch verifies the resolved platform core archive in
  `~/.hutch`, then copies its SDKs into the generated project `.hutch/devkit`
  sysroot for builds and editor tooling.
- Production and canary Hutch installations can coexist globally. Projects can
  pin Hutch and Cottontail independently with a first-line pragma.
- `hutch electrobun init` now opens an interactive, keyboard-navigable template
  chooser followed by an editable project-name prompt. Template catalogs ship
  per Electrobun channel and are downloaded on demand instead of increasing the
  Hutch executable size.
- `npx electrobun init` and `bunx electrobun init` converge on that same
  initializer. One dependency-free npm bootstrap shares the Electrobun release
  version, downloads, verifies, and caches its paired Hutch archive from that
  GitHub Release when needed, and forwards all arguments. It carries no
  Electrobun core or SDK. Published templates pin the exact release they were
  tested with; framework contributors run repository templates against the
  freshly built local devkit.
- Current Vite templates require Hutch 0.24 or later for catalog tool
  checks and built-in `hutch pm exec`. A global Hutch 0.23 installation cannot
  enforce that catalog declaration and must be advanced with its legacy
  `hutch self update production` command before initializing a current template;
  use `hutch upgrade` for later updates. The npm bootstrap supplies its paired
  Hutch automatically.

## Cottontail runtime

- Cottontail is the default TypeScript main-process runtime and provides broad
  Node.js and Bun compatibility for existing application code and packages.
- `electrobun/main` is the canonical, runtime-neutral main-process SDK
  namespace. `electrobun/bun` remains available as a deprecated alias.
- Bun remains an explicit main-process option for applications that need to
  retain the Bun runtime. Electrobun 2.0 pins Bun 1.4.0 for those applications;
  Hutch acquires and packages that exact runtime.

## Native main processes

Applications can use Zig, Rust, Go, or Odin without shipping a JavaScript
runtime. Hutch uses a compatible system compiler when available and otherwise
acquires Electrobun's pinned toolchain. The SDKs share the same core window,
view, RPC, lifecycle, and WGPU contracts.

Odin is new in 2.0 and includes native WGPU templates for data-oriented
particles, fluid simulation, soft-body bunny physics, a cellular alchemy
sandbox, and procedural tree generation. Windows Odin builds are currently
x64-only and require Visual Studio Build Tools; the pinned compiler is pre-1.0,
and cross-compilation is not yet supported.

## Electrobun UI (experimental)

Electrobun 2.0 ships an experimental reactive UI runtime at
`electrobun/main/ui`: GPU-rendered application UI in plain TypeScript with no
webview, browser DOM, or compile step.

- Warren, an explicit fine-grained reactivity model: `signal`, `store`,
  `live`, `memo`, `inert`, `cleanup`, `batch` — reactivity exists only
  inside visible `live()`/`memo()` scopes — plus JSX with control-flow
  components (`Show`, `For`, `Switch`/`Match`) and no added build tooling
  (Cottontail's built-in transpiler).
- A DOM renderer, `electrobun/browser/ui`: the same Warren core and JSX
  rendered into real DOM inside webviews — any HTML/SVG tag, keyed `For`
  reconciliation over real nodes, `Portal`, explicit two-way inputs — so
  main-process GPU chrome and webview documents share one model (and shared
  store/model code runs unchanged on both sides).
- A retained tree with flex-style layout, hit testing, and invalidation-only
  rendering — one instanced Dawn draw call per dirty frame, zero work while
  idle or hidden.
- Elements: `box`/`row`/`column`, `text`, `spacer`, `dynamic` regions, keyed
  `each` lists, scroll containers, a controlled `textInput`, and native-layer
  elements that position real webviews and WGPU views from the same layout
  tree.
- `createUIWindow` for full-window chrome (including transparent,
  always-on-top, draggable frameless panels), `createUIView` for rendering
  into any WGPU view, and a new `<electrobun-ui>` browser tag that layers
  main-process UI over web content via `registerUIRoot`.
- Three new templates showcase it: `ui-wgpu` (reactive counter with embedded
  webview and Mandelbrot surface), `ui-color-picker` (tray eyedropper with a
  live pixel loupe), and `ui-launcher` (always-on-top command palette with
  fuzzy app search and an inline calculator).

See the [Electrobun UI guide](/electrobun/guides/electrobun-ui/) for a hello
world and current limitations.

## App and platform fixes

Highlights from the 2.0 reconciliation include:

- Shared close cancellation, typed BrowserView creation events, JSON-array
  dialog results, unbounded user-controlled dialog timeouts, window visibility
  fixes, and consistent behavior across all six main-process SDKs.
- System-webview console forwarding in development, CEF lifecycle and shutdown
  cleanup, persistent partition and OPFS corrections, draggable-region fixes,
  and broader WGPU adapter and surface coverage.
- macOS fixes for docked DevTools layout and hover crashes, traffic-light
  positioning across resize, CEF sizing, code signing, and deployment targets.
- Windows wide-character paths and UI text, including WebView2 and CEF data
  directories under non-ASCII user profiles; per-monitor DPI setup, correct
  initial content bounds, permission handling, native window behavior, icon
  embedding, and installer shutdown.
- Linux WebKit and CEF lifecycle fixes, wheel scrolling, GTK grow and shrink
  behavior, native chooser integration, desktop-entry packaging, adjacent
  archive extraction, launch dependency diagnostics, ABI checks, and an
  initial Flatpak output path.
- Isolated Kitchen Sink matrix builds, remote release templates, R2-hosted
  owned dependencies, and cross-platform stable/canary packaging.

## Platforms and channels

The release pipeline builds application bundles and distributable artifacts on
macOS ARM64, Windows x64, Linux x64, and Linux ARM64. Apps can use the system
webview or CEF on each supported operating system.

Hutch's Electrobun build environments are `dev`, `canary`, and `stable`.
Canary and stable are independent release channels.

See [Migrate from Electrobun 1.x](/electrobun/guides/migrating-to-v2/) for the
required project changes.

=== FILE: guides/code-signing.mdx ===
---
title: "Code Signing"
description: "Sign and notarize Electrobun releases on macOS."
---

Hutch can sign, notarize, and staple macOS canary and stable builds. Dev
builds skip Hutch's signing and notarization steps even when
`build.mac.codesign` is enabled. Native executables can still carry an ad-hoc
signature generated by their compiler or linker.

Windows release signing is not currently part of Hutch's packaging pipeline.

## Apple Prerequisites

Install Xcode and its command-line tools, then add your Apple Developer account
under Xcode Settings > Accounts. Create or install a **Developer ID
Application** certificate whose private key is present in the login keychain.

Confirm that macOS can use the identity:

```bash
security find-identity -v -p codesigning
```

The value for `ELECTROBUN_DEVELOPER_ID` is the identity printed by that command,
for example `Developer ID Application: Example Corp (AB12C3D4E5)`.

## Configuration

Enable signing and notarization in `electrobun.config.ts`:

```typescript
import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "Signed App",
    identifier: "com.example.signed-app",
    version: "1.0.0",
  },
  build: {
    mac: {
      codesign: true,
      notarize: true,
      createDmg: true,
    },
  },
} satisfies ElectrobunConfig;
```

Hutch signs nested Mach-O files and code bundles before signing the outer app.
It verifies the result with `codesign`, submits the app and DMG when
notarization is enabled, staples the accepted ticket, and validates it.

## Signing Identity

Signing always requires:

```bash
export ELECTROBUN_DEVELOPER_ID="Developer ID Application: Example Corp (AB12C3D4E5)"
```

Store credentials in the CI secret manager rather than committing them or
placing them in project files.

## Notarization Credentials

Choose one authentication method. App Store Connect API credentials are the
preferred CI option.

### App Store Connect API Key

Create a key in App Store Connect under Users and Access > Integrations. Save
the downloaded `.p8` file and configure all three variables:

```bash
export ELECTROBUN_APPLEAPIKEYPATH="$HOME/private_keys/AuthKey_ABC123DEFG.p8"
export ELECTROBUN_APPLEAPIKEY="ABC123DEFG"
export ELECTROBUN_APPLEAPIISSUER="01234567-89ab-cdef-0123-456789abcdef"
```

`ELECTROBUN_APPLEAPIKEYPATH` must identify an existing file on the build
machine.

### Apple ID And App-Specific Password

Alternatively, create an app-specific password at account.apple.com and set:

```bash
export ELECTROBUN_APPLEID="developer@example.com"
export ELECTROBUN_APPLEIDPASS="xxxx-xxxx-xxxx-xxxx"
export ELECTROBUN_TEAMID="AB12C3D4E5"
```

The team ID is the ten-character Apple Developer team identifier. These three
variables are used together; a partial set is not sufficient.

## Build A Signed Release

Code signing runs for canary and stable builds:

```bash
hutch electrobun build --env=canary
hutch electrobun build --env=stable
```

To diagnose packaging without submitting to Apple, retain `notarize: true` in
the checked configuration and disable notarization for one invocation:

```bash
ELECTROBUN_SKIP_NOTARIZATION=1 hutch electrobun build --env=canary
```

This still signs the release when `codesign` is enabled.

## Dev Builds And Keychain Access

If your app accesses the macOS Keychain from a native main process written in
Zig, Rust, Go, or Odin, rebuilding that executable can affect access to
previously saved credentials. This depends on the executable's signing identity,
not the language itself.

An ad-hoc-signed executable can have a designated requirement based on its
binary hash. When a rebuild changes that hash, macOS may treat the executable
as a different application and prompt again or deny access to existing Keychain
items. This can look like a lost login session even though the credentials
still exist; it does not necessarily mean the session expired or the Keychain
locked itself. Editing JavaScript or TypeScript alone usually leaves the
runtime executable unchanged, so switching to a compiled native main process
can make this behavior more noticeable.

Inspect the executable that actually calls Keychain, which may be your native
main process or a helper. Replace this example path with that executable:

```bash
codesign -dv "MyApp-dev.app/Contents/MacOS/main"
codesign -d -r- "MyApp-dev.app/Contents/MacOS/main"
```

`Signature=adhoc` or `adhoc,linker-signed` identifies an ad-hoc signature. A
designated requirement containing only `cdhash` ties access to that particular
binary. Developer ID-signed releases normally retain access across updates
when their signing requirement remains consistent; changing the signing
identity, identifier, or executable accessing the item can still affect access.

Handle denied Keychain access separately from an expired login, and keep dev
credentials separate from production credentials. If you implement local
credential storage for development, make it an explicit dev-only choice: local
files do not provide the same protection as Keychain. Removing executable
signatures is not a workaround, since macOS requires them for native Apple
Silicon executables.

## Entitlements

Electrobun supplies the JIT and dynamic-library entitlements needed by its
runtime by default. Add application-specific entitlements under
`build.mac.entitlements`; Hutch writes them into the generated entitlements
file used for executable and app signing.

```typescript
import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "Camera App",
    identifier: "com.example.camera-app",
    version: "1.0.0",
  },
  build: {
    mac: {
      codesign: true,
      notarize: true,
      entitlements: {
        "com.apple.security.device.camera": true,
        "com.apple.security.device.microphone": true,
      },
    },
  },
} satisfies ElectrobunConfig;
```

An entitlement does not replace the matching usage-description metadata or
application permission flow.

## Unsigned Downloads

Gatekeeper may reject an unsigned app downloaded from the internet because
the browser adds a quarantine attribute. For internal testing, the recipient
can explicitly remove it:

```bash
xattr -cr /Applications/Signed\ App.app
```

Do not treat this as a production distribution flow. User-facing macOS apps
should be signed and notarized.

=== FILE: guides/compatability.mdx ===
---
title: "Compatibility"
description: "Supported operating systems, architectures, runtimes, and webview engines."
---

## Supported targets

| Operating system | Architecture | System webview | Bundled webview |
| --- | --- | --- | --- |
| macOS 14+ | x64 (Intel) | WKWebView | CEF |
| macOS 14+ | arm64 (Apple Silicon) | WKWebView | CEF |
| Windows | x64 | WebView2 | CEF |
| Windows | arm64 | WebView2 | CEF |
| Linux | x64 | WebKitGTK 4.1 | CEF |
| Linux | arm64 | WebKitGTK 4.1 | CEF |

Windows ARM64 builds run natively. Existing x64 installations continue to run
under emulation; install the ARM64 build explicitly to switch architectures.

Hutch builds for the current host operating system and architecture. Produce a
cross-platform release with native CI runners; native main-process compilers do
not currently cross-compile Electrobun apps.

## Main process runtimes

Bun is the default JavaScript main process. For existing applications, see the
[2.0.6 upgrade guide](/electrobun/guides/migrating-to-v2/#upgrading-from-205-to-206).

| Runtime | Status | Notes |
| --- | --- | --- |
| Bun | Default | Bun 1.4.4, acquired and packaged by Hutch |
| Cottontail | Experimental, opt-in | Node.js and Bun-compatible TypeScript runtime |
| Zig | Supported | Pinned Zig 0.17.0 toolchain |
| Rust | Supported | Pinned Rust 1.99.1 toolchain |
| Go | Supported | Pinned Go 1.26.10 toolchain |
| Odin | Supported | Pinned pre-1.0 Odin dev-2026-07a toolchain |

Odin does not support the Windows ARM64 target. Cottontail on Windows ARM64
supports JavaScriptCore's Baseline, DFG, and FTL JIT tiers and WebAssembly.

Hutch accepts an exact matching system compiler. Otherwise it downloads the
pinned compiler into its shared global toolchain store.

## Webview engines

System webviews produce the smallest bundles and receive browser updates from
the operating system. Set `bundleCEF: true` and select the CEF renderer when an
application needs a pinned Chromium implementation.

Electrobun pins and tests one CEF release with each framework release. Hutch
does not currently expose a per-project CEF version override.

Linux requires GTK 3, WebKitGTK 4.1, Ayatana AppIndicator, and librsvg runtime
packages even when CEF is bundled. See
[Cross-Platform Development](/electrobun/guides/cross-platform-development/)
for package names.

## Native GPU UI

[Electrobun UI](/electrobun/guides/electrobun-ui/) is experimental and supports
macOS, Windows, and Linux. Enable `bundleWGPU: true` in each target's build
configuration to package the GPU renderer and UI engine. See the guide for
supported input, accessibility, and rendering features on each platform.

## JavaScript compatibility

Cottontail targets practical Node.js and Bun compatibility and is exercised
against copied upstream conformance tests on macOS, Windows, and Linux. Runtime
compatibility is separate from package management. Hutch's built-in resolver
owns the JavaScript dependency graph and `hutch.lock` by default; a project may
explicitly select npm, pnpm, Yarn, or Bun to own them instead. Hutch also owns
Electrobun builds, versioned devkits, and compiler toolchains.

Native addons and code that depends on undocumented runtime internals can still
be platform- or runtime-specific. Test the application on every target before a
production release.

Cottontail's optional standard-library APIs are packaged as capability modules.
Hutch detects recognized references in the bundled main process and includes
their dependencies. Dynamic usage may need additive
`build.cottontail.capabilities` entries; runtime API support does not by itself
guarantee that a module is included in a particular app bundle. See the
[modular runtime guide](/electrobun/guides/cottontail/#modular-standard-library).

=== FILE: guides/cottontail.mdx ===
---
title: "Cottontail"
description: "Use Electrobun's experimental JavaScript runtime."
---
import { Aside } from "@astrojs/starlight/components";

Bun is the default runtime for TypeScript main processes and Hutch scripts.
Cottontail is an experimental, opt-in alternative. It's built
with Zig on JavaScriptCore and provides the Node.js and Bun-compatible APIs
Electrobun applications need — which means existing code and npm packages can
work without a Cottontail-based app shipping Node or Bun.

Why a separate runtime at all? Because a desktop app's runtime has a
different job than a general-purpose server runtime. Cottontail carries the
APIs applications actually use and leaves out the rest. Project dependencies
use Hutch's built-in npm-compatible resolver by default, or an explicitly
selected external package manager. Bundling and native build machinery live in
Hutch, so the runtime that ships inside every app stays small.

Bun is also a first-class package-manager choice for a Cottontail project: set
`packageManager: "bun"` in `hutch.config.ts`. That explicitly selects the
external dependency tool. Separately, Cottontail implements Bun-compatible
application APIs including the `Bun.$` shell interface.

Cottontail can be selected independently for build-time work and the app.
Hutch 0.30.0-canary.4 or later defaults configuration, scripts, hooks, and build
helpers to Bun. Set `HUTCH_RUNTIME=cottontail` to use its tested Cottontail
version for those operations, with an optional project version pin. For a
Cottontail main process, the selected Electrobun
devkit separately pins the exact runtime placed in the application bundle; it
does not inherit Hutch's build-time pair. End users install neither one. A Bun
main process bundles the devkit-pinned Bun runtime instead.

## Windows ARM64

On Windows ARM64, Cottontail supports JavaScriptCore's Baseline, DFG, and FTL
JIT tiers and WebAssembly. Native npm addons also need Windows ARM64 binaries
or a working build from source. Existing x64 installations keep receiving x64
updates; users can download and install your ARM64 build to switch architectures.

## Select Cottontail

To opt into experimental Cottontail for an application, set both
`build.mainProcess` and its entrypoint configuration explicitly:

```ts
import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "Cottontail App",
    identifier: "dev.example.cottontail-app",
    version: "0.1.0",
  },
  build: {
    mainProcess: "cottontail",
    cottontail: {
      entrypoint: "src/bun/index.ts",
    },
  },
} satisfies ElectrobunConfig;
```

One naming note: the conventional `src/bun` directory does not select the
runtime. `electrobun/main` is the canonical, runtime-neutral SDK import. With
the configuration above, Cottontail executes this code:

```ts
import { BrowserWindow } from "electrobun/main";

new BrowserWindow({
  title: "My App",
  url: "views://mainview/index.html",
});
```

## Modular standard library

Cottontail 0.6.0 and later separate optional standard-library APIs into
capability modules. Hutch always packages the core runtime. It scans the final,
tree-shaken main-process bundle for recognized module specifiers and namespace
accesses, then includes the selected capabilities and their dependencies from
the runtime's manifest. At runtime, capabilities load on demand.

For example, `import { Database } from "bun:sqlite"` selects `sqlite`, and
`import { gzipSync } from "node:zlib"` selects `compression`. Direct
`Cottontail.sqlite` and `Cottontail.compression` accesses are also recognized.
Your application's bundled dependencies participate in the same scan.

The scanner matches known text in the output bundle; it does not execute your
code or infer every JavaScript access. Computed imports, aliased namespaces,
destructuring, and files loaded later may hide usage. In particular, do not
assume a global compatibility access such as `Bun.SQL` selects `sql`.
Use a recognized module import or explicitly include the capability in
`electrobun.config.ts`:

```ts
import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "Plugin App",
    identifier: "dev.example.plugin-app",
    version: "0.1.0",
  },
  build: {
    mainProcess: "cottontail",
    cottontail: {
      entrypoint: "src/bun/index.ts",
      capabilities: ["sqlite", "sql"],
    },
  },
} satisfies ElectrobunConfig;
```

The list is **additive**: it keeps everything automatically detected and adds
these modules. An empty list does not disable scanning, and there is no
exclusion list. Capability names describe packaging, not a permissions sandbox.
This setting affects Cottontail app bundles, not Bun main processes or Hutch's
build-time runtime.

Each build logs the capabilities discovered by the scan, before explicit
includes and transitive dependencies are added. If a packaged app reports a
missing capability, add the name to this list, rebuild, and exercise that path
in the resulting app on each target platform. See the
[configuration reference](/electrobun/apis/cli/build-configuration/#capability-modules)
for the full list of names.

## Runtime and build ownership

The clean split between Cottontail and Hutch is worth internalizing, because
it explains where every capability lives:

| Concern | Owner |
| --- | --- |
| Execute the bundled TypeScript main process | Cottontail |
| Node.js and Bun-compatible runtime APIs | Cottontail |
| Install packages, execute their binaries, and maintain their lockfile | Hutch by default, or an explicit external package manager |
| Bundle main-process and webview source | Hutch |
| Acquire compilers and native platform artifacts | Hutch |
| Sign, notarize, wrap, and package releases | Hutch |

Everything build-related stays out of the runtime shipped to every user.

## Runtime compatibility

Cottontail is built to run existing Node.js and Bun-oriented application
code, and for typical application code it does. But compatibility isn't the
same as being interchangeable in every case: native addons, runtime-specific
implementation details, and uncommon APIs can expose differences. The
practical advice is the same as for any runtime: commit `hutch.lock` or the
lockfile owned by your explicitly selected package manager, and exercise your
application on every target platform before release.

<Aside type="tip">
If your application intentionally depends on the actual Bun runtime, use the
Bun main-process option — Hutch remains the build tool in that configuration.
</Aside>

## Pin Cottontail

When Cottontail is explicitly selected, Hutch uses the version that release
was built and tested with unless a project pins another one. `hutch upgrade`
advances the tested pair. Pin when that workflow needs a different exact version:

```ts
// @hutch cottontail=0.7.3
```

Inspect the selected Cottontail version with `hutch cottontail version`.

This pragma only selects the build-time Cottontail version; it does not opt in.
Set `HUTCH_RUNTIME=cottontail` to select it for Hutch's configuration, scripts,
hooks, and helpers. The Cottontail shipped for
`build.mainProcess: "cottontail"` remains the exact version declared by the
selected Electrobun devkit.

=== FILE: guides/creating-ui.mdx ===
---
title: "Creating UI"
description: "Bundle a browser view and embed isolated web content."
---

This guide extends [Hello World](/electrobun/guides/hello-world) into a small
working web browser, and in doing so teaches the UI pattern you'll use
constantly in Electrobun: a **host page** you own — plain HTML, CSS, and
TypeScript — with isolated content embedded inside it through
`<electrobun-webview>`. The host page renders the toolbar and controls; the
webview tag holds the untrusted remote page, composited into your layout like
any other element but fully isolated from it.

For a GPU-rendered interface written in HTML/CSS and JSX or Zig, start with
[Electrobun UI](/electrobun/guides/electrobun-ui/). It can render the app
without a webview, or anchor native webviews inside its layout. This tutorial
uses a browser-rendered host page so remote web content stays isolated.

## Browser Code

The host page's script wires the toolbar to the embedded view: navigate on
Go or Enter, move through history with Back and Forward, and keep the URL bar
in sync as the page navigates. Create `src/main-ui/index.ts`:

```typescript
import "electrobun/view";

const input = document.querySelector<HTMLInputElement>("#url-input");
const goButton = document.querySelector<HTMLButtonElement>("#go");
const backButton = document.querySelector<HTMLButtonElement>("#back");
const forwardButton = document.querySelector<HTMLButtonElement>("#forward");
const webview = document.querySelector("electrobun-webview");

if (!input || !goButton || !backButton || !forwardButton || !webview) {
  throw new Error("Browser UI is incomplete");
}

const urlInput = input;
const embeddedView = webview;

function navigate() {
  const value = urlInput.value.trim();
  if (!value) return;
  const url = /^[a-z][a-z0-9+.-]*:/i.test(value)
    ? value
    : `https://${value}`;
  embeddedView.loadURL(url);
}

goButton.addEventListener("click", navigate);
urlInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") navigate();
});
backButton.addEventListener("click", () => embeddedView.goBack());
forwardButton.addEventListener("click", () => embeddedView.goForward());

embeddedView.on("did-navigate", (event) => {
  if (typeof event.detail === "string") urlInput.value = event.detail;
});
```

The side-effect import adds Electrobun's browser types to TypeScript. The
native preload registers the custom element before application code runs.

## HTML

Create `src/main-ui/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width" />
    <title>My Browser</title>
    <link rel="stylesheet" href="index.css" />
  </head>
  <body>
    <nav class="toolbar">
      <button id="back" type="button" aria-label="Back">Back</button>
      <button id="forward" type="button" aria-label="Forward">Forward</button>
      <input id="url-input" type="url" value="https://example.com" />
      <button id="go" type="button">Go</button>
    </nav>
    <electrobun-webview src="https://example.com" sandbox></electrobun-webview>
    <script src="index.js" type="module"></script>
  </body>
</html>
```

Create `src/main-ui/index.css`:

```css
html,
body {
  height: 100%;
  margin: 0;
}

body {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
}

.toolbar {
  display: grid;
  gap: 8px;
  grid-template-columns: auto auto minmax(0, 1fr) auto;
  padding: 8px;
}

electrobun-webview {
  height: 100%;
  width: 100%;
}
```

The webview tag must have stable non-zero dimensions. CSS is preferable to
the obsolete HTML `width` and `height` attributes.

## Build Configuration

Two new things appear in the config compared to Hello World: a `views` entry,
which tells Hutch to bundle the TypeScript for this view, and additional
`copy` lines for its HTML and CSS:

```typescript
import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "My Browser",
    identifier: "dev.example.my-browser",
    version: "0.1.0",
  },
  build: {
    mainProcess: "bun",
    bun: {
      entrypoint: "src/bun/index.ts",
    },
    views: {
      "main-ui": {
        entrypoint: "src/main-ui/index.ts",
      },
    },
    copy: {
      "src/main-ui/index.html": "views/main-ui/index.html",
      "src/main-ui/index.css": "views/main-ui/index.css",
    },
  },
} satisfies ElectrobunConfig;
```

## Main Process

Load the copied host page from `src/bun/index.ts`:

```typescript
import { ApplicationMenu, BrowserWindow } from "electrobun/main";

ApplicationMenu.setApplicationMenu([
  {
    label: "App",
    submenu: [{ role: "quit" }],
  },
  {
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { role: "selectAll" },
    ],
  },
]);

const win = new BrowserWindow({
  title: "My Browser",
  url: "views://main-ui/index.html",
  frame: { width: 1000, height: 700 },
});

void win;
```

Native edit-menu roles enable the expected system copy, paste, undo, and
selection shortcuts in editable web content.

## Run

```bash
hutch run dev
```

You now have a working browser: type a URL, hit Enter, navigate back and
forward. Not bad for two source files and a config.

If you want to take the browser idea further — multiple tabs, partitions,
navigation rules, persistent bookmarks — start from the `multitab-browser`
template rather than extending this minimal example ad hoc.

=== FILE: guides/cross-platform-development.mdx ===
---
title: "Cross-Platform Development"
description: "Build and test Electrobun applications on macOS, Windows, and Linux."
---

Electrobun applications share configuration and application source across
platforms, but Hutch builds for the operating system and architecture on which
it is running. Produce and test each release on a native runner.

## Supported Release Targets

| Platform | Architecture | System renderer |
| --- | --- | --- |
| macOS 14+ | x64 (Intel) and ARM64 (Apple Silicon) | WKWebView |
| Windows | x64 and ARM64 | WebView2 |
| Linux | x64 and ARM64 | GTK WebKit 4.1 |

Windows ARM64 builds use a native ARM64 Zig `0.17.0` host compiler and produce
native ARM64 applications. Test both WebView2 and CEF on ARM64 hardware.
Existing x64 applications remain emulated until the ARM64 build is explicitly installed.
macOS releases include separate Intel x64 and Apple Silicon ARM64 artifacts,
both targeting macOS 14 or later. Build and test each on its native architecture.

On each runner, install Hutch and execute the same stable-release command:

```bash
hutch run install
hutch electrobun build --env=stable
```

Here `install` is normally a project task such as
`["hutch", "install", "--frozen-lockfile"]`; native-only projects without
JavaScript dependencies can omit it. Hutch's built-in resolver reads
`package.json` and `hutch.lock` by default. A project may explicitly select npm,
Bun, pnpm, Yarn, or a custom executable instead.

macOS signing and notarization must run on macOS. Native main-process builds
also require that language's host toolchain and platform linker.

## Platform Configuration

Use the `mac`, `win`, and `linux` objects for differences that belong in the
package rather than branching application code:

```typescript
import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "Cross Platform App",
    identifier: "com.example.cross-platform-app",
    version: "1.0.0",
  },
  build: {
    mac: {
      codesign: true,
      notarize: true,
      icons: "App.icon",
    },
    win: {
      icon: "assets/icon.ico",
    },
    linux: {
      icon: "assets/icon.png",
    },
  },
} satisfies ElectrobunConfig;
```

Runtime branches should use standard platform detection only when behavior
cannot be expressed as build configuration:

```typescript
const platform = process.platform;

if (platform === "darwin") console.log("macOS");
else if (platform === "win32") console.log("Windows");
else if (platform === "linux") console.log("Linux");
```

## Renderer Differences

System webviews are different browser engines and versions. Test layout,
media permissions, keyboard handling, downloads, context menus, and any API
that is sensitive to browser-engine behavior on all three platforms.

Bundle CEF when the application needs a pinned Chromium engine or advanced
native overlay behavior. macOS and Windows can mix CEF and native views when
CEF is bundled. A Linux process uses either its CEF wrapper or GTK WebKit
wrapper, so do not depend on mixed renderers there.

Native overlay surfaces also have renderer-specific transparency,
passthrough, and mask constraints. See the
[`<electrobun-webview>`](/electrobun/apis/browser/electrobun-webview-tag) and
[`<electrobun-wgpu>`](/electrobun/apis/browser/electrobun-wgpu-tag) references.

## Linux Runtime Packages

Electrobun's Linux native wrapper links GTK 3, WebKitGTK 4.1, Ayatana
AppIndicator, and librsvg, including in CEF-enabled builds. Install the runtime
packages for the target distribution:

```bash
# Ubuntu or Debian
sudo apt install libgtk-3-0 libwebkit2gtk-4.1-0 libayatana-appindicator3-1 librsvg2-2

# Fedora or RHEL
sudo dnf install gtk3 webkit2gtk4.1 libappindicator-gtk3 librsvg2

# Arch or Manjaro
sudo pacman -S gtk3 webkit2gtk-4.1 libayatana-appindicator librsvg
```

If startup fails, the launcher reports recognized missing libraries and these
package commands. Use `ldd path/to/libNativeWrapper.so` to inspect the full
dynamic dependency set for a distribution.

## Windows Console Output

Packaged Windows applications use the GUI subsystem and do not open a console
window. Hutch dev launches attach to the invoking terminal. To expose output
from a canary or stable executable for diagnosis, set
`ELECTROBUN_CONSOLE=1` before launch:

```powershell
$env:ELECTROBUN_CONSOLE = "1"
& ".\Cross Platform App.exe"
```

This override has no effect on macOS or Linux, where terminal launches already
inherit standard output and error.

## Test Matrix

Automated tests should cover all six targets: macOS, Windows, and Linux on
x64 and ARM64. Interactive tests that exercise renderer output need a display
session and should cover system
webviews everywhere plus CEF where the application enables it. Native
main-process SDKs share the Electrobun core, but each wrapper should retain a
smoke test for initialization, RPC, event dispatch, and shutdown.

=== FILE: guides/electrobun-ui.mdx ===
---
title: "Electrobun UI"
description: "Build app UI with HTML, CSS, and JSX rendered straight to the GPU from the main process — no webview."
---
import { Aside } from "@astrojs/starlight/components";

<Aside type="caution" title="Experimental">
Electrobun UI is experimental on macOS, Windows, and Linux (X11), on x64 and
ARM64. APIs may change between releases, including stable Electrobun releases.
See [current limitations](#current-limitations).
</Aside>

Electrobun UI renders HTML, CSS, and JSX directly to the GPU from your main
process. There is no webview and no browser engine: a small UI engine written
in Zig parses your markup and CSS, runs layout and text shaping, and draws the
result with instanced SDF quads through Dawn (WebGPU). Your app code drives it
with fine-grained reactivity, so an update touches exactly the nodes that
changed.

![Electrobun UI Kitchen Sink on macOS showing buttons, cards, tabs, gradients, and backdrop blur](../assets/ui/components-macos.png)

*Kitchen Sink on macOS: HTML/CSS components rendered directly by the native
GPU UI engine.*

```text
your JSX + signals/stores (electrobun/main/ui)
        ↓  one DOM mutation per changed binding, batched over FFI
Zig UI core: DOM → CSS cascade → layout → text → paint
        ↓
instanced SDF quads → Dawn surface (WGPUView)
```

Rendering is invalidation-driven: style, layout, and paint only run when
something changed, and frames are only presented while something is
animating or invalidated. An unchanged, idle window does not continuously
repaint.

## A stable subset, not a browser

The engine implements a practical subset of HTML and CSS — the parts app UIs
actually use — and aims to keep that subset stable rather than chase browser
compatibility. Flexbox, grid, positioning, the cascade with `@layer`,
`var()`, nesting, media queries, transitions, keyframes, shadows, gradients,
filters and `backdrop-filter`, form controls, text editing, and IME all work,
and Tailwind v4 output styles correctly. Some browser features are
deliberately absent (floats, real tables, web fonts, network images). The
[HTML & CSS reference](/electrobun/apis/ui/html-css/) lists exactly what is
supported.

The same components and CSS also work in a regular webview through the
[DOM renderer](/electrobun/apis/ui/browser-dom/), so you can move a view
between a GPU window and a webview without rewriting it.

## Hello world

The fastest start is a template:

```bash
hutch electrobun init my-app --template=bun-ui      # Bun main process
hutch electrobun init my-app --template=zig-ui      # Zig main process
```

To set it up by hand, enable `bundleWGPU` for each target OS. It bundles Dawn
and the platform UI engine library into the app. Electrobun UI works with
the Bun and Cottontail main processes; this example uses Bun:

```ts
// electrobun.config.ts
import type { ElectrobunConfig } from "electrobun";

export default {
  app: { name: "hello-ui", identifier: "hello-ui.example.com", version: "0.0.1" },
  build: {
    mainProcess: "bun",
    bun: { entrypoint: "src/main.tsx" },
    mac: { bundleCEF: false, bundleWGPU: true },
    win: { bundleCEF: false, bundleWGPU: true },
    linux: { bundleCEF: false, bundleWGPU: true },
  },
} satisfies ElectrobunConfig;
```

Tell TypeScript which JSX runtime to use. This is type-checking
configuration only — the transpiler already handles `.tsx`:

```jsonc
// tsconfig.json
{ "compilerOptions": { "jsx": "react-jsx", "jsxImportSource": "electrobun/main/ui" } }
```

Then write ordinary HTML-flavoured JSX and CSS:

```tsx
// src/main.tsx
import { createUIWindow, live, signal } from "electrobun/main/ui";

const css = `
  body { margin: 0; height: 100vh; display: grid; place-items: center; }
  .count { font-size: 32px; font-weight: 600; }
`;

function Counter() {
  const [count, setCount] = signal(0);
  return (
    <div class="eb-col" style="gap: 16px; align-items: center">
      <div class="count">{live(() => `Count: ${count()}`)}</div>
      <button class="eb-btn" onClick={() => setCount((c) => c + 1)}>Click me</button>
    </div>
  );
}

createUIWindow(
  { title: "Hello UI", width: 420, height: 260, css, components: true },
  () => <Counter />,
);
```

Run it with `hutch electrobun dev`. `components: true` adds the built-in
[`eb-*` component stylesheet](/electrobun/apis/ui/components/); everything
else is plain CSS you write.

Three rules cover the programming model:

- **Reactivity is explicit.** `live(() => ...)` is a reactive binding that
  updates exactly one thing when its dependencies change. Unmarked values are
  static. See [Reactivity](/electrobun/apis/ui/reactivity/).
- **Components are plain functions** called once — no re-rendering, no hooks
  rules.
- **Handlers are plain functions** (`onClick={() => ...}`) and are never
  tracked.

## Templates

| Template | Main process | Shows |
| --- | --- | --- |
| `bun-ui` | Bun | a starter app: components, forms, reactive state |
| `zig-ui` | Zig | driving the UI engine from a Zig main process |
| `ui-launcher` | Cottontail | transparent always-on-top command palette, global shortcut, keyed list, text input |
| `ui-color-picker` | Cottontail | tray eyedropper in a transparent rounded window |
| `ui-wgpu` | Cottontail | UI with an embedded custom WGPU render and webview |

## Mixing in native views

The UI owns one full-window Dawn view. Native views — your own
[`WGPUView`](/electrobun/apis/webgpu/) render loop, or a webview — can be
positioned over elements so they participate in the layout; see
[anchoring native views](/electrobun/apis/ui/overview/#anchoring-native-views).
To put Electrobun UI *inside* web content instead, use the
[`<electrobun-ui>` tag](/electrobun/apis/ui/ui-tag/).

![The ui-wgpu template on macOS with a GPU-rendered counter, a Mandelbrot WGPUView, and an embedded BrowserView](../assets/ui/native-views-macos.png)

*The `ui-wgpu` template on macOS combines GPU-rendered app controls, a custom
WebGPU scene, and a native webview anchored to the UI layout.*

## Migrating from the 2.0.5 prototype

Electrobun 2.0.6 replaces the experimental UI prototype with the Zig HTML/CSS
engine. Apps using ordinary webviews do not need to change. Apps that used
the experimental `electrobun/main/ui` renderer should migrate their markup
and mounting code:

| Prototype API | Current API |
| --- | --- |
| `<box>`, `<row>`, `<column>`, `<text>`, `<spacer>` and layout props | HTML elements with CSS; use `.eb-row` / `.eb-col` for simple flex containers and `flex-grow` for spacers. |
| `textInput` | Native HTML `<input>` and `<textarea>` with DOM input events. |
| `webview` / `wgpuSurface` components | Create a `BrowserView` or `WGPUView` and position it with `ui.anchor(element, view)`. |
| `createUiContext`, `getUiContext`, `onKey` | The `UI` instance and DOM event listeners, such as `onKeyDown`. |
| `UiTree` and low-level layout/paint helpers | `UI.document`, `UIDocument`, and `UINode`; layout and rendering now live in the Zig engine. |
| `mount.context`, `mount.closed`, `mount.isClosed()` | Access `mount.ui`; observe window closure with `mount.window.on("close", ...)`. |

The reactivity model remains explicit: `signal`, `store`, `live`, `memo`,
and the control-flow components still drive individual bindings. The native
renderer now shares its HTML/JSX renderer with
[`electrobun/browser/ui`](/electrobun/apis/ui/browser-dom/). The mounting
signatures and node interfaces have changed; use the
[API overview](/electrobun/apis/ui/overview/) and updated templates as the
reference when migrating.

## Where to go next

- [API overview](/electrobun/apis/ui/overview/) — windows, mounting, the `UI`
  object, testing helpers.
- [HTML & CSS](/electrobun/apis/ui/html-css/) — the supported subset.
- [Components](/electrobun/apis/ui/components/) — the `eb-*` design system.
- [Reactivity](/electrobun/apis/ui/reactivity/) — signal, store, live, memo.
- [Events & input](/electrobun/apis/ui/events/) — pointer, keyboard, focus,
  text editing, accessibility.
- [Zig](/electrobun/apis/ui/zig/) — using the engine from a Zig main process.

## Current limitations

- **Platform differences:** Linux uses X11, has no native assistive-technology
  bridge yet, and should not rely on transparent UI surfaces. See
  [platform support](/electrobun/apis/ui/overview/#platform-support).
- **Fonts:** system fonts only. `@font-face` rules are parsed but web fonts
  are not loaded. The portable Windows/Linux text backend does not yet
  implement bidirectional reordering, complex Arabic/Indic shaping, or
  variable-font instances.
- **Images:** `<img>` loads `data:` URLs and file paths; there is no network
  loading. Inline `<svg>` is rasterized.
- **Layout gaps:** no floats; `position: sticky` behaves like `relative`;
  tables lay out as flex rows; transforms are 2D.
- **Dark mode** follows the `dark` option / `ui.setDark()`, not the system
  appearance automatically.
- Electrobun UI runs in the privileged main process — use it for trusted app
  UI, not untrusted content (that is what webviews are for).

=== FILE: guides/hello-world-bun.mdx ===
---
title: "Hello World (Bun)"
description: "Build a minimal Electrobun app with the Bun main-process runtime."
---
import { Aside } from "@astrojs/starlight/components";

This guide creates a minimal Electrobun app with **Bun** as the main-process
runtime. The steps mirror the
[Cottontail walkthrough](/electrobun/guides/hello-world/) — the TypeScript
SDK is identical for both JavaScript runtimes — Bun is selected by default. See
[Main Process Runtimes](/electrobun/guides/native-main-process/) for every
runtime option.

## When to choose Bun

Bun is the default main process and provides the full Bun API surface.
Cottontail is an experimental alternative selected explicitly in the build config.
Hutch bundles source and packages the app in either
configuration. Hutch's built-in npm-compatible resolver owns ordinary
JavaScript dependencies by default; select npm, Bun, or another package
manager explicitly when the project needs it.

## 1. Create the project

```bash
mkdir my-app
cd my-app
```

Create `package.json`:

```json
{
  "name": "my-app",
  "private": true,
  "type": "module",
  "devDependencies": {
    "@types/bun": "latest"
  }
}
```

Create `hutch.config.ts`:

```ts docs=syntax
export default {
  packageManager: "bun",
  scripts: {
    install: ["hutch", "pm", "install", "--frozen-lockfile"],
    dev: ["hutch", "electrobun", "dev", "--watch"],
    build: ["hutch", "electrobun", "build", "--env=stable"],
  },
};
```

There is no `electrobun` package dependency in this direct-Hutch example, so an
explicit sync follows the active release channel; an optional exact
`electrobun.version` pin would stop it. Hutch supplies the resolved SDK and core.
`packageManager: "bun"` is a first-class, independent choice: it makes
`hutch install` and `hutch pm ...` delegate to Bun, while
`build.mainProcess: "bun"` separately chooses Bun as the application runtime.

Create `tsconfig.json` so editors and TypeScript resolve the package-free SDK
facade that Hutch projects during sync:

```json
{
  "extends": "./.hutch/devkit/tsconfig.json"
}
```

## 2. Add a webview

Create `src/mainview/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width" />
    <title>Hello Electrobun</title>
  </head>
  <body>
    <h1>Hello from Electrobun</h1>
  </body>
</html>
```

## 3. Add the main process

Create `src/bun/index.ts`:

```ts
import { BrowserWindow } from "electrobun/main";

new BrowserWindow({
  title: "Hello Electrobun",
  url: "views://mainview/index.html",
  frame: {
    width: 800,
    height: 600,
    x: 200,
    y: 200,
  },
});
```

<Aside type="note">
The `electrobun/main` import path is the same TypeScript Electrobun SDK used
with Cottontail. The main-process API is documented in the
[Main API reference](/electrobun/apis/main/).
</Aside>

## 4. Configure the build

Create `electrobun.config.ts`. This is the step that selects the Bun runtime:
`build.mainProcess` is `"bun"` and the entrypoint moves to the `bun` config
field.

```ts
import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "My App",
    identifier: "dev.example.my-app",
    version: "0.0.1",
  },
  build: {
    mainProcess: "bun",
    bun: {
      entrypoint: "src/bun/index.ts",
    },
    copy: {
      "src/mainview/index.html": "views/mainview/index.html",
    },
  },
} satisfies ElectrobunConfig;
```

## 5. Run the app

```bash
hutch install
hutch electrobun sync
hutch run dev
```

The first command delegates to Bun and creates `bun.lock`; commit it. Future
clean checkouts can run the configured `install` task with
`hutch run install`, which delegates `bun install --frozen-lockfile`. Hutch
builds and launches the app, then rebuilds it when watched source files change.
Press Ctrl+C to stop it.

=== FILE: guides/hello-world-go.mdx ===
---
title: "Hello World (Go)"
description: "Build a minimal Electrobun app with a Go main process from scratch."
---
import { Aside } from "@astrojs/starlight/components";

This guide creates a minimal Electrobun app with a **Go** main process and a
normal project-owned Go module. For the default
TypeScript runtime see [Hello World](/electrobun/guides/hello-world/). The
faster path is `hutch electrobun init go-app --template=go-maze-wgpu`,
which scaffolds a complete WGPU-rendering example.

## 1. Create the project

```bash
mkdir hello-go
cd hello-go
```

Create `hutch.config.ts`. Hutch resolves scripts only from this file; this
project does not need a `package.json`:

```ts docs=syntax
export default {
  electrobun: { version: "2.0.6" },
  scripts: {
    dev: ["hutch", "electrobun", "dev", "--watch"],
    build: ["hutch", "electrobun", "build", "--env=stable"],
  },
};
```

Create `tsconfig.json` so editors and TypeScript resolve the config types and
view SDK projected during sync:

```json
{
  "extends": "./.hutch/devkit/tsconfig.json"
}
```

Create `go.mod`:

```go
module hellogo.example.dev

go 1.26.0

require electrobun v0.0.0

replace electrobun => ./.hutch/devkit/go-sdk
```

The replacement is the Go SDK copied from the exact Electrobun devkit.
Hutch does not generate this module or resolve other Go dependencies; add them
normally and let Go own `go.mod` and `go.sum`.

## 2. Add a webview

Create `src/mainview/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width" />
    <title>Hello Electrobun</title>
  </head>
  <body>
    <h1>Hello from Electrobun</h1>
    <script type="module" src="index.js"></script>
  </body>
</html>
```

Create `src/mainview/index.ts` — the view's script entrypoint, bundled to
`views://mainview/index.js`:

```ts
console.log("Hello from the view");
```

## 3. Add the main process

Create `src/go/main.go`:

```go
package main

import (
	"fmt"
	"os"
	"time"

	"electrobun"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintf(os.Stderr, "[hello-go] %s\n", err)
		os.Exit(1)
	}
}

func run() error {
	core, err := electrobun.LoadCore()
	if err != nil {
		return err
	}
	bundlePaths, err := electrobun.ResolveBundlePaths()
	if err != nil {
		return err
	}
	appInfo, err := electrobun.ResolveAppInfoFromBundle(bundlePaths)
	if err != nil {
		return err
	}

	go createUI(core, bundlePaths)

	// Blocks on the native event loop; must run on the main goroutine.
	return core.RunMainThread(appInfo)
}

func createUI(core *electrobun.Core, bundlePaths electrobun.BundlePaths) {
	time.Sleep(150 * time.Millisecond)
	if err := core.ConfigureWebviewRuntimeFromExecutableDir(bundlePaths, 0); err != nil {
		fmt.Fprintf(os.Stderr, "[hello-go] failed to configure webview runtime: %s\n", err)
		return
	}

	windowOptions := electrobun.NewWindowOptions(
		"Hello Electrobun",
		electrobun.NewRect(140, 100, 800, 600),
	)
	windowOptions.Callbacks = electrobun.WindowCallbacks{
		Close: func(uint32) { _ = core.StopEventLoop() },
	}
	windowID, err := core.CreateWindow(windowOptions)
	if err != nil {
		fmt.Fprintf(os.Stderr, "[hello-go] failed to create window: %s\n", err)
		return
	}

	webviewOptions := electrobun.NewWebviewOptions(
		windowID,
		"views://mainview/index.html",
		electrobun.NewRect(0, 0, 800, 600),
	)
	if _, err := core.CreateWebview(webviewOptions); err != nil {
		fmt.Fprintf(os.Stderr, "[hello-go] failed to create webview: %s\n", err)
		_ = core.CloseWindow(windowID)
	}
}
```

A few things to notice: `RunMainThread` owns the main goroutine, so all UI
creation happens on a separate goroutine; the window's `Close` callback
stops the event loop so the process exits when the window closes; and nil
webview callbacks are fine — a nil `DecideNavigation` allows all
navigation.

<Aside type="note">
`import "electrobun"` resolves through the explicit local replacement in
`go.mod`. Run `hutch electrobun prepare` before standalone Go tooling so that
path exists without advancing an existing floating projection.
</Aside>

## 4. Configure the build

Create `electrobun.config.ts`:

```ts
import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "hello-go",
    identifier: "hellogo.example.dev",
    version: "0.0.1",
  },
  build: {
    mainProcess: "go",
    go: {
      package: "./src/go",
    },
    views: {
      mainview: {
        entrypoint: "src/mainview/index.ts",
      },
    },
    copy: {
      "src/mainview/index.html": "views/mainview/index.html",
    },
  },
} satisfies ElectrobunConfig;
```

`mainProcess: "go"` selects the Go runtime, and `go.package` selects the main
package within the project module. Per-platform `bundleCEF` / `bundleWGPU`
flags are only needed if you use CEF rendering or WGPU views.

## 5. Run the app

```bash
hutch electrobun sync
hutch run dev
```

The explicit sync projects the Go SDK and resolves the selected Go toolchain
when no exact match is installed. On Windows it also prepares the Zig C
compiler required by cgo. `hutch run dev` then builds and launches the app and
rebuilds it when watched source files change. Press Ctrl+C to stop it.

## How this differs from TypeScript

- **Normal module ownership.** Hutch runs `go build` from the project module
  with `-mod=readonly`. It does not copy source or synthesize a GOPATH. The
  project owns `go.mod`, `go.sum`, module replacements, and third-party
  dependencies.
- **Version-matched SDK.** `hutch electrobun sync` projects the selected
  release's module into `.hutch/devkit/go-sdk`; the explicit `replace` directive
  makes the SDK import deterministic.
- **cgo is mandatory.** The SDK is a cgo wrapper, so the build runs with
  `CGO_ENABLED=1` and needs a host C toolchain.
- **Dynamic core loading.** `LoadCore()` dlopens `libElectrobunCore` from
  the executable's directory at runtime and resolves its symbols. Nothing
  links at build time, and the binary only runs from inside a hutch-built
  bundle — not via `go run`.
- **Bundle discovery.** `ResolveBundlePaths()` derives the executable and
  `Resources/` directories from `os.Executable()`, and
  `ResolveAppInfoFromBundle()` reads the app identifier, name, and channel
  from `Resources/version.json`.
- **Webview runtime setup.** Call
  `ConfigureWebviewRuntimeFromExecutableDir` once before creating any
  webview; it registers the preload scripts that power the `views://`
  scheme and the bridge.
- **You own the event loop.** `RunMainThread` must be called from the main
  goroutine and blocks until the loop stops. Create windows and webviews
  from another goroutine after a short delay (~150 ms) so the loop is
  running first, and call `StopEventLoop()` from the window close callback
  or the process keeps running.
- **Errors are plain `error` values.** Every core call returns an `error`;
  `core.LastError()` surfaces the core's last error string
  (`electrobun_core_last_error`).
- **Updates run in the shared core.** `UpdaterCheck`, `UpdaterDownload`, and
  `UpdaterRequestApply` queue work; `UpdaterGetState` and `UpdaterGetEvents`
  return typed Go values. Follow the [native updater flow](/electrobun/apis/updater-native/)
  to approve or veto apply and wait for `QuitReady` before normal teardown.
- **Template.** `hutch electrobun init go-app --template=go-maze-wgpu`
  scaffolds a full example with RPC messaging and WGPU rendering.

## Toolchain

Electrobun defaults to Go 1.26.10. Override it exactly with
`build.go.version`; Hutch uses an exact matching system compiler when supported
or downloads it under `~/.hutch/toolchains/go/<version>/<platform>`. Builds
target the host OS and architecture only — cross-compilation is not
supported yet, so use native runners per platform. Because of cgo you need
a host C toolchain: the Xcode Command Line Tools on macOS, the platform
compiler and linker on Linux, and on Windows the build uses the vendored
`zig cc` as the C compiler.

For the full picture of native main processes, see
[Native main process](/electrobun/guides/native-main-process/) and the
[main process APIs](/electrobun/apis/main/).

=== FILE: guides/hello-world-odin.mdx ===
---
title: "Hello World (Odin)"
description: "Build a minimal Electrobun app with an Odin main process from scratch."
---
import { Aside } from "@astrojs/starlight/components";

This guide creates a minimal Electrobun app with an **Odin** main process. It
mirrors the [TypeScript walkthrough](/electrobun/guides/hello-world/) — same
project shape, same webview, but the window and webview are created from Odin
instead of Cottontail. The faster path is
`hutch electrobun init odin-app --template=odin-particles-wgpu`.

## 1. Create the project

```bash
mkdir odin-hello
cd odin-hello
```

Create `hutch.config.ts`. Hutch resolves scripts only from this file; this
project does not need a `package.json`:

```ts docs=syntax
export default {
  electrobun: { version: "2.0.6" },
  scripts: {
    dev: ["hutch", "electrobun", "dev", "--watch"],
    build: ["hutch", "electrobun", "build", "--env=stable"],
  },
};
```

Create `tsconfig.json` so editors and TypeScript resolve the config types
projected during sync:

```json
{
  "extends": "./.hutch/devkit/tsconfig.json"
}
```

## 2. Add a webview

Create `src/mainview/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width" />
    <title>Hello Electrobun</title>
  </head>
  <body>
    <h1>Hello from Electrobun</h1>
  </body>
</html>
```

## 3. Add the main process

Create `src/odin/main.odin`. The SDK is imported as
`import electrobun "electrobun_sdk:electrobun"`. Hutch projects the exact
versioned SDK into `.hutch/devkit/odin-sdk` and passes that directory as the
`electrobun_sdk` collection when it invokes Odin:

```odin
package main

import "core:fmt"
import "core:thread"
import "core:time"

import electrobun "electrobun_sdk:electrobun"

DEFAULT_SECRET_KEY :: "1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32"

g_core: ^electrobun.Core
g_bundle_paths: ^electrobun.BundlePaths

create_ui :: proc() {
	time.sleep(150 * time.Millisecond)

	if err := electrobun.configureWebviewRuntimeFromExecutableDir(g_core, g_bundle_paths, 0);
	   err != .None {
		fmt.eprintfln("[hello] failed to configure webview runtime: %v", err)
		return
	}

	window_options := electrobun.defaultWindowOptions("Hello Electrobun")
	window_options.frame = {x = 160, y = 100, width = 800, height = 600}
	window_id, window_err := electrobun.createWindow(g_core, window_options)
	if window_err != .None {
		fmt.eprintfln("[hello] failed to create window: %v", window_err)
		return
	}

	webview_options := electrobun.defaultWebviewOptions(window_id)
	webview_options.url = "views://mainview/index.html"
	webview_options.frame = {x = 0, y = 0, width = 800, height = 600}
	webview_options.secret_key = DEFAULT_SECRET_KEY
	webview_options.sandbox = false
	webview_options.callbacks = {
		decide_navigation = electrobun.allowAllNavigation,
		event             = electrobun.noopWebviewEvent,
		event_bridge      = electrobun.noopWebviewPostMessage,
	}

	if _, webview_err := electrobun.createWebview(g_core, webview_options); webview_err != .None {
		fmt.eprintfln("[hello] failed to create webview: %v", webview_err)
		_ = electrobun.closeWindow(g_core, window_id)
	}
}

main :: proc() {
	core, core_err := electrobun.load()
	if core_err != .None {
		fmt.eprintfln("[hello] failed to load Electrobun core: %v", core_err)
		return
	}
	defer electrobun.close(&core)

	bundle_paths, bundle_err := electrobun.resolveBundlePaths()
	if bundle_err != .None {
		fmt.eprintfln("[hello] failed to resolve bundle paths: %v", bundle_err)
		return
	}
	defer electrobun.deinit(&bundle_paths, context.allocator)

	owned_app_info, app_info_err := electrobun.resolveAppInfoFromBundle(context.allocator, &bundle_paths)
	if app_info_err != .None {
		fmt.eprintfln("[hello] failed to resolve app info: %v", app_info_err)
		return
	}
	defer electrobun.deinit(&owned_app_info, context.allocator)
	app_info := electrobun.borrowed(owned_app_info)

	g_core = &core
	g_bundle_paths = &bundle_paths
	defer g_core = nil

	thread.create_and_start(create_ui, self_cleanup = true)

	// Blocks running the native event loop until the app quits.
	if err := electrobun.runMainThread(&core, app_info); err != .None {
		fmt.eprintfln("[hello] main thread exited with error: %v", err)
	}
}
```

## 4. Configure the build

Create `electrobun.config.ts`:

```ts
import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "odin-hello",
    identifier: "odinhello.example.dev",
    version: "0.0.1",
  },
  build: {
    mainProcess: "odin",
    odin: {
      entrypoint: "src/odin/main.odin",
    },
    copy: {
      "src/mainview/index.html": "views/mainview/index.html",
    },
  },
} satisfies ElectrobunConfig;
```

The project owns its Odin source package. Hutch builds the directory containing
the configured entrypoint and passes the projected SDK collection; it does not
generate or require a `build.odin` file.

## 5. Run the app

```bash
hutch electrobun sync
hutch run dev
```

Hutch builds and launches the app, then rebuilds it when watched source files
change. Press Ctrl+C to stop it.

<Aside type="note">
The app only works from a hutch-built bundle layout — the SDK loads
`libElectrobunCore` from the directory next to the executable and reads
`version.json` and the preload scripts from `Resources/`. A bare `odin run`
won't work.
</Aside>

## How this differs from TypeScript

The Odin SDK is a faithful port of the Zig SDK: camelCase procs over the
native core's C ABI, taking `^Core` as the first argument
(`electrobun.createWindow(&core, options)`). Some steps Cottontail handles
for you are explicit here:

- **Dynamic core loading.** `electrobun.load()` opens `libElectrobunCore`
  (`.dylib` / `.so` / `ElectrobunCore.dll`) from the executable's directory
  at runtime and resolves every C symbol. Nothing is linked at build time.
- **App identity comes from the bundle.** `resolveBundlePaths` computes the
  executable and `Resources/` directories, and `resolveAppInfoFromBundle`
  parses `Resources/version.json` for the app's `identifier`, `name`, and
  `channel` — identity is read at runtime, not baked in from config at
  compile time.
- **`configureWebviewRuntimeFromExecutableDir` before webviews.** It loads
  the bundled `preload-full.js` / `preload-sandboxed.js` from `Resources/`
  and configures the webview runtime. Skip it and your webviews are missing
  their preload and bridge scripts.
- **`runMainThread` blocks.** It runs the native event loop on the main
  thread until the app quits, so windows and webviews are created from a
  worker thread started before it. The template sleeps 150ms first to let
  the loop start; the core marshals UI calls back to the main thread
  internally.
- **Error handling is Odin-native.** Most procs return an
  `Error` enum (`.None`, `.LibraryLoadFailed`, `.ElectrobunCoreFailure`,
  ...) as a second return value — check `err != .None` as in the example.
- **Callbacks are C ABI.** All Electrobun callbacks are `proc "c"`; inside
  one you must set `context = runtime.default_context()` (from
  `base:runtime`) before calling into Odin runtime features:

  ```odin
  import "base:runtime"

  on_window_resize :: proc "c" (window_id: u32, x: f64, y: f64, width: f64, height: f64) {
  	context = runtime.default_context()
  	fmt.printfln("window %d resized to %.0fx%.0f", window_id, width, height)
  }
  ```

- **Updates run in the shared core.** `updaterCheck`, `updaterDownload`, and
  `updaterRequestApply` queue work; `updaterGetState` and `updaterGetEvents`
  return typed values. Release responses with their `updater*Deinit` proc,
  including rejected request results. See the [native updater flow](/electrobun/apis/updater-native/)
  for approval, veto, and normal teardown after `quitReady`.
- **Some TS APIs have no Odin equivalent.** There is no typed RPC layer (the
  bridge is raw JSON via `sendHostMessageToWebview` and
  `popNextQueuedHostMessage`) and no typed menu builders. See
  [Native main process](/electrobun/guides/native-main-process/) for the
  full comparison.

To start from a working Odin project instead of an empty folder:

```bash
hutch electrobun init odin-app --template=odin-particles-wgpu
```

Focused Odin graphics templates also exist: `odin-fluid-wgpu`,
`odin-jelly-bunny-wgpu`, `odin-alchemy-wgpu`, and `odin-tree-wgpu`.

## Toolchain

Odin is pre-1.0 and ships monthly dev releases with breaking changes;
Electrobun 2.0.6 defaults to **Odin dev-2026-07a** and guarantees the SDK only
against that release. Override it exactly with `build.odin.version`. Hutch uses
a system compiler only on an exact version match; otherwise it downloads the
selected toolchain into
`~/.hutch/toolchains/odin/<version>/<platform>` and reuses it across projects.
The compiler is not bundled into the finished app. The pinned Apple Silicon
compiler requires macOS 15 or later to run; the resulting application can still
target macOS 14.

Platform requirements: macOS needs the Xcode Command Line Tools, Linux needs
`clang`, and Windows needs Visual Studio Build Tools (MSVC `link.exe`) plus
the Windows SDK. Native main processes build for the host OS/arch only —
there is no cross-compilation, so use native CI runners for a release matrix.
Windows is x64 only (Windows-on-ARM runs the x64 build under emulation).

Next: [Native main process](/electrobun/guides/native-main-process/) for the
runtime comparison and deeper build details, and the
[main process APIs](/electrobun/apis/main/) reference.

=== FILE: guides/hello-world-rust.mdx ===
---
title: "Hello World (Rust)"
description: "Build a minimal Electrobun app with a Rust main process from scratch."
---
import { Aside } from "@astrojs/starlight/components";

This guide creates a minimal Electrobun app with a **Rust** main process in a
project-owned Cargo package. For the default TypeScript runtime see
[Hello World](/electrobun/guides/hello-world/). The faster path is
`hutch electrobun init rust-app --template=rust-flock-wgpu`, which scaffolds
a complete WGPU-rendering example.

## 1. Create the project

```bash
mkdir my-rust-app
cd my-rust-app
```

Create `hutch.config.ts`. Hutch resolves scripts only from this file; this
project does not need a `package.json`:

```ts docs=syntax
export default {
  electrobun: { version: "2.0.6" },
  scripts: {
    dev: ["hutch", "electrobun", "dev", "--watch"],
    build: ["hutch", "electrobun", "build", "--env=stable"],
  },
};
```

This project does not need `package.json`. The exact Electrobun release in
`hutch.config.ts` selects an installed devkit, and Hutch copies its Rust SDK to
`.hutch/devkit/rust-sdk`.

Create `tsconfig.json` so editors and TypeScript resolve the config types and
view SDK projected during sync:

```json
{
  "extends": "./.hutch/devkit/tsconfig.json"
}
```

## 2. Add a webview

Create `src/mainview/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width" />
    <title>Hello Electrobun</title>
  </head>
  <body>
    <h1>Hello from Electrobun</h1>
    <script type="module" src="index.js"></script>
  </body>
</html>
```

Create `src/mainview/index.ts` — the view's script entrypoint, bundled to
`views://mainview/index.js`:

```ts
console.log("Hello from the view");
```

## 3. Add the main process

Create `Cargo.toml`:

```toml
[package]
name = "rust-hello"
version = "0.0.1"
edition = "2021"
publish = false

[[bin]]
name = "main"
path = "src/main.rs"

[dependencies]
electrobun = { path = ".hutch/devkit/rust-sdk" }

[profile.dev]
opt-level = 2
debug = 0

[profile.release]
opt-level = "z"
strip = "symbols"
```

That path is the Rust SDK copied from the exact Electrobun devkit. Hutch
does not publish or inject a hidden crate and does not generate the manifest.
Add normal crates here and let Cargo own their versions and lockfile.

Create and commit `Cargo.lock` (the SDK version matches the
`electrobun.version` in `hutch.config.ts`):

```toml
# This file is automatically @generated by Cargo.
# It is not intended for manual editing.
version = 4

[[package]]
name = "electrobun"
version = "2.0.6"

[[package]]
name = "rust-hello"
version = "0.0.1"
dependencies = [
 "electrobun",
]
```

Create `src/main.rs`:

```rust
use electrobun::{
    self, Core, Rect, WebviewCallbacks, WebviewOptions, WindowCallbacks, WindowOptions,
};
use std::sync::OnceLock;
use std::thread;
use std::time::Duration;

// 32 comma-separated bytes; shared secret for the webview preload bridge.
const DEFAULT_SECRET_KEY: &str =
    "1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32";

static CORE: OnceLock<&'static Core> = OnceLock::new();

fn main() {
    if let Err(err) = run() {
        eprintln!("[rust-hello] {err}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let core = Box::leak(Box::new(Core::load()?));
    let bundle_paths = electrobun::resolve_bundle_paths()?;
    let app_info = electrobun::resolve_app_info_from_bundle(&bundle_paths)?;
    CORE.set(core).map_err(|_| "core already set".to_string())?;

    // UI must be created after the event loop starts, so spawn a thread.
    let _ui_thread = thread::spawn(move || create_ui(core, &bundle_paths));

    // Blocks on the native event loop; must run on the main thread.
    core.run_main_thread(&app_info)
}

fn create_ui(core: &Core, bundle_paths: &electrobun::BundlePaths) {
    thread::sleep(Duration::from_millis(150)); // let the event loop start

    if let Err(err) = core.configure_webview_runtime_from_executable_dir(bundle_paths, 0) {
        eprintln!("[rust-hello] failed to configure webview runtime: {err}");
        return;
    }

    let mut window_options =
        WindowOptions::new("Hello Electrobun", Rect::new(140.0, 100.0, 900.0, 640.0));
    window_options.callbacks = WindowCallbacks {
        close: Some(main_window_closed),
        ..WindowCallbacks::default()
    };

    let window_id = match core.create_window(window_options) {
        Ok(id) => id,
        Err(err) => {
            eprintln!("[rust-hello] failed to create window: {err}");
            return;
        }
    };

    let mut webview_options = WebviewOptions::new(
        window_id,
        "views://mainview/index.html",
        Rect::new(0.0, 0.0, 900.0, 640.0),
    );
    webview_options.secret_key = DEFAULT_SECRET_KEY;
    webview_options.callbacks = WebviewCallbacks {
        decide_navigation: Some(electrobun::allow_all_navigation),
        ..WebviewCallbacks::default()
    };

    if let Err(err) = core.create_webview(webview_options) {
        eprintln!("[rust-hello] failed to create webview: {err}");
        let _ = core.close_window(window_id);
    }
}

extern "C" fn main_window_closed(_window_id: u32) {
    if let Some(core) = CORE.get() {
        let _ = core.stop_event_loop();
    }
}
```

A few things to notice: `Box::leak` produces the `&'static Core` that
`extern "C"` callbacks need, the secret key is shared with the webview's
preload bridge, and the window's `close` callback stops the event loop so
the process exits when the window closes.

<Aside type="note">
The Electrobun SDK is an ordinary path dependency supplied by the selected
devkit, so `use electrobun::{...}` works without a generated wrapper. The
Cargo manifest and lockfile remain project-owned.
</Aside>

## 4. Configure the build

Create `electrobun.config.ts`:

```ts
import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "rust-hello",
    identifier: "rusthello.electrobun.dev",
    version: "0.0.1",
  },
  build: {
    mainProcess: "rust",
    rust: {
      manifest: "Cargo.toml",
      binary: "main",
    },
    views: {
      mainview: {
        entrypoint: "src/mainview/index.ts",
      },
    },
    copy: {
      "src/mainview/index.html": "views/mainview/index.html",
    },
  },
} satisfies ElectrobunConfig;
```

`mainProcess: "rust"` selects the Rust runtime. `manifest` and `binary` choose
the project-owned Cargo target; those shown are the defaults. Per-platform
`bundleCEF` / `bundleWGPU` flags are only needed if you use CEF rendering or
WGPU views.

## 5. Run the app

```bash
hutch electrobun sync
hutch run dev
```

The explicit sync creates `.hutch/devkit/rust-sdk` and resolves the selected
Rust toolchain if no exact match is installed. `hutch run dev` then builds with
Cargo's locked dependency graph, launches the app, and rebuilds when watched
source files change. Press Ctrl+C to stop it.

## How this differs from TypeScript

- **Normal Cargo ownership.** The project owns `Cargo.toml`, `Cargo.lock`, its
  binary targets, and crates.io dependencies. Hutch runs Cargo with the
  selected toolchain and `--locked`; it does not generate a wrapper crate.
- **Version-matched SDK.** `hutch electrobun sync` projects the selected
  release's Rust crate into `.hutch/devkit/rust-sdk`, and the normal Cargo path
  dependency makes it part of the build.
- **Dynamic core loading.** `Core::load()` dlopens `libElectrobunCore`
  from the executable's directory at runtime and resolves its symbols.
  Nothing links at build time, and the binary only runs from inside a
  Hutch-built bundle. `cargo build` can compile the binary, but the executable
  needs the packaged core and Resources layout to run correctly.
- **Bundle discovery.** `resolve_bundle_paths()` derives the executable
  and `Resources/` directories from the running executable's path, and
  `resolve_app_info_from_bundle()` reads the app identifier, name, and
  channel from `Resources/version.json`.
- **Webview runtime setup.** Call
  `configure_webview_runtime_from_executable_dir` once before creating any
  webview; it registers the preload scripts that power the `views://`
  scheme and the bridge.
- **You own the event loop.** `run_main_thread` must be called on the
  process main thread and blocks until the loop stops. Create windows and
  webviews from a spawned thread after a short delay (~150 ms) so the loop
  is running first, and call `stop_event_loop` from the window close
  callback or the process keeps running.
- **Fallible calls return `Result`.** Most core calls use `Result<_, String>`
  with error text from the core's `electrobun_core_last_error`.
  Updater calls use the typed `UpdaterError` enum.
- **Updates run in the shared core.** `updater_check`, `updater_download`, and
  `updater_request_apply` queue work; `updater_state` and `updater_events`
  return owned typed values. Follow the [native updater flow](/electrobun/apis/updater-native/)
  to approve or veto apply and wait for `quit_ready` before normal teardown.
- **Template.** `hutch electrobun init rust-app --template=rust-flock-wgpu`
  scaffolds a full example with RPC messaging and WGPU rendering.

## Toolchain

Electrobun defaults to Rust 1.99.1. Override it exactly with
`build.rust.version`; Hutch uses an exact matching system compiler when
supported or downloads the toolchain under
`~/.hutch/toolchains/rust/<version>/<platform>`.
Builds target the host OS and architecture only — cross-compilation is not
supported yet, so use native runners per platform. On Windows, Rust builds
require Visual Studio Build Tools and the Windows SDK; macOS needs the
Xcode Command Line Tools.

For the full picture of native main processes, see
[Native main process](/electrobun/guides/native-main-process/) and the
[main process APIs](/electrobun/apis/main/).

=== FILE: guides/hello-world-zig.mdx ===
---
title: "Hello World (Zig)"
description: "Build a minimal Electrobun app with a Zig main process from scratch."
---
import { Aside } from "@astrojs/starlight/components";

This guide creates a minimal Electrobun app with a **Zig** main process. It
mirrors the [TypeScript walkthrough](/electrobun/guides/hello-world/) — same
project shape, same webview, but the window and webview are created from Zig
instead of Cottontail. The faster path is
`hutch electrobun init my-app --template=zig-wgpu`.

## 1. Create the project

```bash
mkdir hello-zig
cd hello-zig
```

Create `hutch.config.ts`. Hutch resolves scripts only from this file; this
project does not need a `package.json`:

```ts docs=syntax
export default {
  electrobun: { version: "2.0.6" },
  scripts: {
    dev: ["hutch", "electrobun", "dev", "--watch"],
    build: ["hutch", "electrobun", "build", "--env=stable"],
  },
};
```

Create `tsconfig.json` so editors and TypeScript resolve the config types and
view SDK projected during sync:

```json
{
  "extends": "./.hutch/devkit/tsconfig.json"
}
```

## 2. Add a webview

Create `src/mainview/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width" />
    <title>Hello Electrobun</title>
  </head>
  <body>
    <h1>Hello from Electrobun</h1>
  </body>
</html>
```

## 3. Add the main process

Create `src/zig/main.zig`:

```zig
const std = @import("std");
const electrobun = @import("electrobun");

fn sleepMs(ms: u64) void {
    electrobun.defaultIo().sleep(.fromMilliseconds(@intCast(ms)), .awake) catch {};
}

fn createUi(core: *electrobun.Core, bundle_paths: *const electrobun.BundlePaths) void {
    // Give the native event loop a beat to start before creating UI.
    sleepMs(150);

    // Required before any createWebview: loads the bundled preload scripts.
    core.configureWebviewRuntimeFromExecutableDir(bundle_paths, 0) catch |err| {
        std.debug.print("failed to configure webview runtime: {s}\n", .{@errorName(err)});
        return;
    };

    const window_id = core.createWindow(.{
        .title = "Hello Electrobun",
        .frame = .{ .x = 160, .y = 100, .width = 800, .height = 600 },
    }) catch |err| {
        std.debug.print("failed to create window: {s}\n", .{@errorName(err)});
        return;
    };

    _ = core.createWebview(.{
        .window_id = window_id,
        .renderer = .native,
        .url = "views://mainview/index.html",
        .frame = .{ .x = 0, .y = 0, .width = 800, .height = 600 },
        .callbacks = .{
            .decide_navigation = electrobun.allowAllNavigation,
            .event = electrobun.noopWebviewEvent,
            .event_bridge = electrobun.noopWebviewPostMessage,
        },
        .sandbox = false,
    }) catch |err| {
        std.debug.print("failed to create webview: {s}\n", .{@errorName(err)});
        core.closeWindow(window_id) catch {};
    };
}

pub fn main() !void {
    const allocator = std.heap.c_allocator;

    var core = try electrobun.Core.load(allocator);
    defer core.close();

    var bundle_paths = try electrobun.resolveBundlePaths(allocator);
    defer bundle_paths.deinit(allocator);

    var owned_app_info = try electrobun.resolveAppInfoFromBundle(allocator, &bundle_paths);
    defer owned_app_info.deinit(allocator);
    const app_info = owned_app_info.borrowed();

    // runMainThread blocks the main thread, so build UI from a worker thread.
    const ui_thread = try std.Thread.spawn(.{}, createUi, .{ &core, &bundle_paths });
    ui_thread.detach();

    try core.runMainThread(app_info);
}
```

Create the project-owned `build.zig`:

```zig
const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});
    const electrobun_sdk = b.option(
        []const u8,
        "electrobun-sdk",
        "Absolute path to the Electrobun Zig SDK projected by Hutch",
    ) orelse @panic("missing -Delectrobun-sdk; build this project through Hutch");

    const electrobun = b.createModule(.{
        .root_source_file = .{ .cwd_relative = electrobun_sdk },
        .target = target,
        .optimize = optimize,
    });

    const exe = b.addExecutable(.{
        .name = "main",
        .root_module = b.createModule(.{
            .root_source_file = b.path("src/zig/main.zig"),
            .target = target,
            .optimize = optimize,
            .link_libc = true,
            .imports = &.{
                .{ .name = "electrobun", .module = electrobun },
            },
        }),
    });

    b.installArtifact(exe);
}
```

The build owns its source root, output name, modules, and linker settings.
Hutch invokes it with
`-Delectrobun-sdk=<project>/.hutch/devkit/zig-sdk/electrobun.zig`; it never
generates or rewrites `build.zig`.

## 4. Configure the build

Create `electrobun.config.ts`:

```ts
import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "hello-zig",
    identifier: "hellozig.example.dev",
    version: "0.0.1",
  },
  build: {
    mainProcess: "zig",
    zig: {
      version: "0.17.0",
    },
    copy: {
      "src/mainview/index.html": "views/mainview/index.html",
    },
  },
} satisfies ElectrobunConfig;
```

## 5. Run the app

```bash
hutch electrobun sync
hutch run dev
```

Hutch builds and launches the app, then rebuilds it when watched source files
change. Press Ctrl+C to stop it.

<Aside type="note">
The app only works from a hutch-built bundle layout — the SDK loads
`libElectrobunCore` from the directory next to the executable and reads
`version.json` and the preload scripts from `Resources/`. Don't try to run the
binary produced by a plain `zig build` on its own.
</Aside>

## How this differs from TypeScript

The Zig SDK is a thin, allocator-explicit wrapper over the native core, so the
main process makes some steps explicit that Cottontail handles for you:

- **Dynamic core loading.** `electrobun.Core.load(allocator)` opens
  `libElectrobunCore` (`.dylib` / `.so` / `ElectrobunCore.dll`) from the
  executable's directory at runtime and resolves its symbols. Nothing is
  linked at build time. Almost every API is a method on the returned `Core`.
- **App identity comes from the bundle.** `resolveBundlePaths` computes the
  executable and `Resources/` directories, and `resolveAppInfoFromBundle`
  parses `Resources/version.json` for the app's `identifier`, `name`, and
  `channel` — identity is read at runtime, not baked in from config at
  compile time.
- **`configureWebviewRuntimeFromExecutableDir` before webviews.** It loads the
  bundled `preload-full.js` / `preload-sandboxed.js` from `Resources/` and
  hands them to the core. Skip it and your webviews are missing their preload
  and bridge scripts.
- **`runMainThread` blocks.** It runs the native platform event loop on the
  main thread until the app quits, so windows and webviews are created from a
  spawned worker thread. The template sleeps ~150ms first to let the loop
  start; the core marshals UI calls back to the main thread internally.
- **Error handling is Zig-native.** Fallible calls return Zig error unions;
  native failures commonly use `error.ElectrobunCoreFailure` with detail on
  stderr. Updater requests also return an `accepted` flag and core error text.
- **Updates run in the shared core.** `updaterCheck`, `updaterDownload`, and
  `updaterRequestApply` queue operations; `updaterGetState` and
  `updaterGetEvents` return owned typed snapshots. Call `.deinit()` on each
  response. See the [native updater flow](/electrobun/apis/updater-native/)
  for approval, veto, and normal teardown after `quitReady`.
- **Some TS APIs have no Zig equivalent.** There is no typed RPC layer (the
  bridge is raw JSON via `sendHostMessageToWebview` and
  `popNextQueuedHostMessage`) and no typed menu builders. See
  [Native main process](/electrobun/guides/native-main-process/) for the full
  comparison.

To start from a working Zig project instead of an empty folder:

```bash
hutch electrobun init my-app --template=zig-wgpu
```

## Toolchain

Electrobun defaults to Zig **0.17.0**. Override it exactly with
`build.zig.version`. Hutch uses a system Zig only on an exact version match;
otherwise it downloads the selected toolchain into
`~/.hutch/toolchains/zig/<version>/<platform>` and reuses it across projects. The
compiler is not bundled into the finished app.

Native main processes build for the host OS/arch only — there is no
cross-compilation, so use native CI runners for a release matrix. Windows
targets include x64 and ARM64.

Next: [Native main process](/electrobun/guides/native-main-process/) for the
runtime comparison and deeper build details, and the
[main process APIs](/electrobun/apis/main/) reference.

=== FILE: guides/hello-world.mdx ===
---
title: "Hello World (Cottontail)"
description: "Build a minimal Electrobun app with the Cottontail main-process runtime."
---
import { Aside } from "@astrojs/starlight/components";

This guide builds a minimal Electrobun app by hand, without a template, so you
can see exactly what each piece is for. The main process
runs on **Cottontail**. Every runtime has its
own version of this walkthrough:
[Bun](/electrobun/guides/hello-world-bun/),
[Zig](/electrobun/guides/hello-world-zig/),
[Rust](/electrobun/guides/hello-world-rust/),
[Go](/electrobun/guides/hello-world-go/), and
[Odin](/electrobun/guides/hello-world-odin/).

## 1. Create the project

```bash
mkdir my-app
cd my-app
```

Create `package.json`:

```json
{
  "name": "my-app",
  "private": true,
  "type": "module",
  "devDependencies": {
    "@types/bun": "latest"
  }
}
```

There is deliberately no `electrobun` npm dependency in this direct-Hutch
example. Hutch's built-in resolver owns ordinary JavaScript dependencies and
`hutch.lock`; Hutch supplies the versioned Electrobun SDK through
`.hutch/devkit`.

Create `hutch.config.ts` for project tasks:

```ts docs=syntax
export default {
  scripts: {
    install: ["hutch", "install", "--frozen-lockfile"],
    dev: ["hutch", "electrobun", "dev", "--watch"],
    build: ["hutch", "electrobun", "build", "--env=stable"],
  },
};
```

Hutch reads scripts and package-manager overrides only from this file. With no
`packageManager` field, the `install` task reads `package.json`, resolves
packages with Hutch's built-in resolver, and owns `hutch.lock`. See
[Hutch](/electrobun/guides/hutch/) for the boundary and external-manager option.

Create `tsconfig.json` so editors and TypeScript resolve the package-free SDK
facade that Hutch projects during sync:

```json
{
  "extends": "./.hutch/devkit/tsconfig.json"
}
```

<Aside type="note">
Cottontail is experimental. This guide selects it explicitly in the build
configuration. See the [Cottontail guide](/electrobun/guides/cottontail/) for
supported APIs.
</Aside>

## 2. Add a webview

This is your app's UI — plain HTML, rendered in a native webview. Create
`src/mainview/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width" />
    <title>Hello Electrobun</title>
  </head>
  <body>
    <h1>Hello from Electrobun</h1>
  </body>
</html>
```

Anything you'd put in a web page works here: CSS, TypeScript, React, whatever
you like. For hello world, a heading is plenty.

## 3. Add the main process

The main process runs on Cottontail and creates your app's windows.
Create `src/main/index.ts`:

```ts
import { BrowserWindow } from "electrobun/main";

new BrowserWindow({
  title: "Hello Electrobun",
  url: "views://mainview/index.html",
  frame: {
    width: 800,
    height: 600,
    x: 200,
    y: 200,
  },
});
```

The `views://` URL is Electrobun's scheme for assets bundled into the app —
this one points at the HTML file from the previous step, wherever the bundle
ends up on disk.

## 4. Configure the build

The last piece is telling Hutch how these files become an app. Create
`electrobun.config.ts`:

```ts
import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "My App",
    identifier: "dev.example.my-app",
    version: "0.0.1",
  },
  build: {
    mainProcess: "cottontail",
    cottontail: {
      entrypoint: "src/main/index.ts",
    },
    copy: {
      "src/mainview/index.html": "views/mainview/index.html",
    },
  },
} satisfies ElectrobunConfig;
```

Reading it top to bottom: `app` names and identifies the application,
`mainProcess: "cottontail"` selects Cottontail as the runtime,
`cottontail.entrypoint` points at the
main process you just wrote, and `copy` places the HTML file into the bundle at
the path the `views://` URL expects. With no explicit `electrobun.version`, a
direct Hutch sync resolves the active channel and then reuses that projected
core and SDK until the next sync.

## 5. Run the app

```bash
hutch install
hutch electrobun sync
hutch run dev
```

The first command uses Hutch's built-in resolver and creates `hutch.lock`. Sync
resolves an exact Electrobun release under `~/.hutch` and creates
`.hutch/devkit`; future clean checkouts can use `hutch run install` with the
committed lockfile. Hutch then builds the app, launches it, and a window titled "Hello Electrobun"
opens with your heading in it. Leave it running — edits to watched source
files trigger a rebuild. Press Ctrl+C to stop.

That's the whole loop: a main process that opens windows, HTML that fills
them, and a config that binds the two. From here, the natural next steps are
talking between the two sides with RPC ([Main Process
API](/electrobun/apis/main/)) and building real UI
([Creating UI](/electrobun/guides/creating-ui/)).

=== FILE: guides/hot-reloading.mdx ===
---
title: "Hot Reloading"
description: "Understand hot module replacement, webview reloads, and whole-app watch mode in Electrobun."
---

Electrobun supports two development loops that are often both called "hot
reload," but they have different behavior:

- **Whole-app watch mode** rebuilds and relaunches the application. It works
  with every main-process runtime and with bundled webview assets.
- **Webview hot module replacement (HMR)** updates browser modules through a
  development server such as Vite without relaunching the application.

The important boundary is the main process. It owns native windows, menus,
trays, RPC, and application lifecycle. Webviews are isolated browsing contexts,
so their UI can reload independently from the main process.

## At a glance

| Code being edited | Development loop | What happens after save |
| --- | --- | --- |
| Cottontail or Bun main process | `hutch electrobun dev --watch` | The app is rebuilt and relaunched. Main-process state resets. |
| Zig, Rust, Go, or Odin main process | `hutch electrobun dev --watch` | The native main process is rebuilt and the app is relaunched. State resets. |
| Webview bundled by Hutch | `hutch electrobun dev --watch` | The view bundle is rebuilt and the app is relaunched. |
| Webview served by Vite | `hutch run dev:hmr` in a Vite template | Vite applies HMR when the change is accepted, or reloads the page otherwise. The native app is not relaunched. |
| Electrobun UI (`electrobun/main/ui`) | `hutch electrobun dev --watch` | The main process and its GPU-rendered UI restart together. |
| Warren DOM renderer (`electrobun/browser/ui`) | Your webview bundler's development server | It can use the webview reload pipeline, but Electrobun does not currently provide Warren-specific state-preserving HMR. |

## Whole-app watch mode

Run the watched development build directly:

```bash
hutch electrobun dev --watch
```

Published templates expose the same command as a task:

```bash
hutch run dev
```

Hutch builds and launches the app, watches its inputs, and then stops, rebuilds,
and relaunches the app after a change. This is reliable across Cottontail, Bun,
Zig, Rust, Go, and Odin main processes, but it is not in-process HMR. Expect
main-process memory, open windows, and other transient application state to
reset.

On macOS and Linux, Hutch stops the running development app before rebuilding.
On Windows, it currently asks you to close the app so it can rebuild without
leaving a runtime process behind.

The default watch set includes the configured main-process source, native build
inputs, view entrypoint directories, and files in `build.copy`. Add other inputs
with `build.watch` and exclude generated or high-churn paths with
`build.watchIgnore`:

```ts docs=syntax
import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "Watched App",
    identifier: "com.example.watched-app",
    version: "0.1.0",
  },
  build: {
    watch: ["scripts", "vendor/native-library"],
    watchIgnore: ["**/*.generated.*", "data/cache/**"],
  },
} satisfies ElectrobunConfig;
```

See the [`dev --watch` CLI reference](/electrobun/apis/cli/cli-args/#hutch-electrobun-dev)
and [watch configuration](/electrobun/apis/cli/build-configuration/#watch-mode)
for the complete input and ignore rules.

### Cottontail and Bun runtime reload modes

Cottontail and Bun both have runtime-level reload modes for standalone scripts.
Electrobun does not currently pass those modes to an application main process.
The supported Electrobun main-process development loop is the whole-app
rebuild/relaunch described above.

This distinction also applies when the main process is TypeScript: choosing
Cottontail or Bun changes the bundled runtime, not the lifecycle of
`hutch electrobun dev --watch`. See [Cottontail](/electrobun/guides/cottontail/)
and [main-process runtimes](/electrobun/guides/native-main-process/).

## Webview HMR with Vite

For a browser-framework UI, use one of the Vite templates and run:

```bash
hutch run dev:hmr
```

`dev:hmr` is a task supplied by those templates, not a built-in Hutch command.
The template starts a Vite development server on `http://localhost:5173`, then
starts Electrobun in development mode. The main process detects the server and
loads it instead of the packaged `views://` URL. Vite can then replace changed
view modules without restarting the native application. Vite and the selected
framework plugin decide whether a change is accepted through HMR or requires a
full page reload, and whether component state can be preserved.

The template catalog includes HMR setups for:

- `angular`
- `react-tailwind-vite`
- `solid`
- `svelte`
- `tailwind-vanilla`
- `vanilla-vite`
- `vue`

For example:

```bash
hutch electrobun init my-app --template=react-tailwind-vite
cd my-app
hutch run dev:hmr
```

The React and Svelte templates include a walkthrough of the setup in their
project README. The underlying pattern is the same in all seven templates. For
external-bundler SDK aliases, see
[Project Ownership and Devkit: External bundlers](/electrobun/guides/project-ownership/#external-bundlers).

### What `dev:hmr` does not watch

The stock `dev:hmr` task is webview-only. It starts the main process once while
Vite watches the browser UI. After changing main-process code, stop and rerun
the task. Conversely, ordinary `hutch run dev` in a Vite template builds the
view once, then watches main-process and other Electrobun-owned inputs. It
relaunches the app for those changes, but does not keep rebuilding the Vite UI.

Production and canary builds never depend on the development server. They load
the webview assets copied into the application bundle through `views://` URLs.

## Electrobun UI and the DOM renderer

The two UI entrypoints have different reload boundaries:

- [`electrobun/main/ui`](/electrobun/guides/electrobun-ui/) renders GPU UI from
  the main process. Changes use whole-app watch mode and reset the UI with the
  rest of the main process.
- [`electrobun/browser/ui`](/electrobun/apis/ui/browser-dom/) renders DOM inside
  a webview. It can be served by Vite like other browser code, but there is no
  first-party Warren HMR adapter that promises component-state preservation.

The `bun-ui`, `zig-ui`, `ui-wgpu`, `ui-color-picker`, and `ui-launcher`
templates demonstrate Electrobun UI. Use `hutch run dev` in those projects for
automatic rebuild and relaunch.

## Which loop should I use?

- Use **`hutch run dev`** for main-process work, native main-process languages,
  Electrobun UI, or a simple project that does not need browser HMR.
- Use **`hutch run dev:hmr`** in a Vite template when most edits are in the
  webview and you want the fastest UI feedback loop.
- Restart **`dev:hmr`** after changing main-process code or configuration.
- Restart either development loop after changing `electrobun.config.ts` or
  `hutch.config.ts`.
- Test a normal bundled build before release. HMR uses an HTTP development
  server, while shipped applications use packaged `views://` assets.

For the broader project setup, see the [Quick Start](/electrobun/guides/quick-start/),
[Creating UI](/electrobun/guides/creating-ui/), and
[Bundling and Distribution](/electrobun/guides/bundling-and-distribution/).

=== FILE: guides/hutch.mdx ===
---
title: "Hutch"
description: "Install and use Electrobun's native build and workspace CLI."
---
import { Aside } from "@astrojs/starlight/components";

Hutch is Electrobun 2.x's native build and workspace CLI. It runs project
scripts, bundles TypeScript, resolves exact Electrobun devkits and compiler
toolchains, and packages applications for distribution. It also installs
JavaScript dependencies with a minimal built-in npm-compatible resolver, so a
JavaScript project needs no separately installed package manager; projects
that prefer npm, Bun, pnpm, or Yarn can delegate to them instead. Non-JS
dependencies stay with their own tools: Cargo for Rust, Go modules for Go,
and so on.

Hutch 0.30.0-canary.4 or later defaults to Bun for configuration evaluation,
JavaScript/TypeScript scripts, tests, string shell tasks, hooks, and build
helpers. Electrobun also defaults to Bun for the packaged application main
process. These are independent selections: changing Hutch's runtime does not
change `build.mainProcess`.

Cottontail remains an experimental option. Set `HUTCH_RUNTIME=cottontail` for
Hutch configuration, scripts, hooks, and build helpers, or
`build.mainProcess: "cottontail"` with a `build.cottontail`
entrypoint for an application. `HUTCH_RUNTIME=bun` explicitly selects Bun even
when a local Cottontail override is present. The `// @hutch ... cottontail=...`
pragma pins a Cottontail version; it does not select that runtime. Default Bun
workflows do not need to download Cottontail. Hutch stays out of the finished
application bundle.

## Install Hutch

Regular npm commands need no separate machine-wide installation. There is one
dependency-free `electrobun` package, with no `@electrobun/hutch-*` platform
packages and no postinstall script. Electrobun releases carry six
platform archives from their exact paired Hutch release, including Intel Macs
and Windows ARM64. `hutch-artifacts.json` binds every host archive to its
immutable GitHub Release URL, declared byte size, and SHA-256 digest. On first use the npm command reads that index, downloads and
verifies the host archive, safely caches the extracted launcher and engine, then
runs it.
`npx electrobun` and package.json scripts that call `electrobun ...` therefore
need no shell-profile changes. The dependency version supplies exact paired
Hutch and Electrobun defaults, with Hutch resolving its selected build runtime, so
updating the one dependency moves the tested set tracked by your lockfile.
Direct `hutch` commands use the machine-wide installation below;
`electrobun init` ensures that compatible global launcher is present for the
generated project's `hutch run ...` tasks while running init through the exact
private cache.

For machine-wide use outside npm, install the current production channel on
macOS or Linux:

```bash
curl -fsSL https://hutch.blackboard.sh/hutch/install.sh | sh
```

On Windows PowerShell:

```powershell
& ([scriptblock]::Create((irm https://hutch.blackboard.sh/hutch/install.ps1)))
```

The installers also accept an exact semantic version or build revision.
Installed releases live side by side under `~/.hutch/releases`, with launchers
in `~/.hutch/bin` and their exact local selections in
`~/.hutch/state/selections.json`. Set
`HUTCH_HOME` to relocate the store. `stable` is accepted as an alias for the
production channel.

Coming from npm or Bun? `npx electrobun init` and `bunx electrobun init` both
work, defaulting `init` to stable templates; pass `--beta` explicitly for beta
templates. Each published template pins the exact Electrobun release it was
tested with. The npm bootstrap still supplies its paired Hutch automatically;
direct Hutch validates the template catalog and, when needed, downloads its
matching Hutch toolchain before initializing the project.

<Aside type="caution" title="Upgrade global Hutch before using current Vite templates">
The current Vite templates require Hutch 0.24 or later for built-in
`hutch pm exec` and catalog tool-version checks. Hutch 0.23 does not understand
those catalog requirements, so existing global users must first run the legacy
`hutch self update production` command. Once upgraded, prefer `hutch upgrade`
for future Hutch releases. The npm bootstrap selects its paired Hutch
automatically and needs no separate migration step.
</Aside>

## Everyday commands

```bash
# Choose a template from the invoking launcher's default catalog
hutch electrobun init

# Opt into the current beta template catalog
hutch electrobun init --beta

# Run the project's reproducible install task, if it has one
hutch run install

# Install package.json dependencies (built-in resolver, or the
# delegated manager when hutch.config.ts selects one)
hutch install

# Run an installed project-local package binary
hutch pm exec -- vite --version

# Run a script declared in hutch.config.ts
hutch run dev

# Build and launch an Electrobun app
hutch electrobun dev --watch

# Prepare the selected Electrobun devkit and toolchain without building
hutch electrobun prepare

# Update the nearest exact Electrobun pin to the latest stable release
# and sync this app's generated devkit
hutch electrobun update

# Deliberately advance an unpinned project to the current channel head
hutch electrobun sync

# Create distributable builds
hutch electrobun build --env=canary
hutch electrobun build --env=stable
```

Hutch's Electrobun build environments are `dev`, `canary`, and `stable`.

For [Managed Deploys](/electrobun/guides/managed-deploys/), run
`hutch electrobun upload` after building on each runner, then run
`hutch electrobun publish --app=<app-id> --release=<channel-version>` after all
uploads finish. Upload discovers platforms from the generated artifacts;
publish needs no local artifacts. Both commands run natively in Hutch and do
not require a JavaScript runtime or package manager.

Template channels are separate from Hutch's release channel. Electrobun beta
templates can require stable Hutch; `--beta` selects the template catalog,
not a Hutch release version. Follow any minimum-version error from init and
upgrade the appropriate launcher. See [init's channel behavior](/electrobun/apis/cli/cli-args/#hutch-electrobun-init).

The publisher guarantees that a published template's exact Electrobun pin
matches its catalog. After extracting it, `init` syncs that release and the
required native toolchain, then runs the template's configured `install` task
when one exists.
Pass `--skip-install` to defer that task. An unpinned hand-written template uses
the npm-paired default when supplied, otherwise the selected catalog release.
Initialization always requires network access because Hutch fetches the current
template catalog and chosen template instead of keeping persistent copies of
either one.

Scripts come only from the nearest `hutch.config.ts`. Running one does not infer
`package.json` scripts, add `node_modules/.bin` to `PATH`, or emulate npm
lifecycle hooks. Package installation and local-binary lookup happen only when
a task explicitly calls `hutch install`, `hutch pm exec`, or a selected external
manager. When a name is unambiguous, `hutch <name>` works as shorthand:

```ts docs=syntax
// hutch.config.ts
export default {
  // Optional exact override:
  // electrobun: { version: "2.0.6" },
  scripts: {
    install: ["hutch", "install", "--frozen-lockfile"],
    ui: ["hutch", "pm", "exec", "--", "vite", "build"],
    dev: ["hutch", "electrobun", "dev", "--watch"],
    build: ["hutch", "electrobun", "build", "--env=stable"],
  },
};
```

String values are shell expressions: pipelines, redirects, environment
expansion, and operators such as `&&` are interpreted, as in
`"hutch pm exec -- vite build && hutch electrobun dev"`. Argument arrays spawn
the first element with the remaining elements as exact arguments—there is no
shell parsing or implicit quoting—and are preferable for a single command.
Non-JavaScript projects do not need a `package.json` at all.

Its first line can also carry the [version pragma](#pin-a-project) that pins
Hutch and Cottontail per project.

Without a `packageManager` selection, `hutch install` uses Hutch's built-in
npm-compatible resolver. It installs `package.json` registry, `file:`, and git
dependencies (`github:owner/repo#ref` and `git+<url>#ref`, pinned to exact
commits and installed as checked out) into `hutch.lock` — the only lockfile
Hutch reads or writes; foreign lockfiles such as `bun.lock` or
`package-lock.json` are ignored, never migrated. Lifecycle scripts never run:
no `postinstall`, no `prepare`. Packages that must build on install belong to
an explicitly selected external manager.

In this built-in mode, `hutch pm exec [--] <command> [args...]` resolves only
the nearest package project's `node_modules/.bin/<command>` and preserves its
arguments and exit status. It rejects path-like command names and never uses a
global executable, falls back to `PATH`, contacts a registry, or behaves like
`npx`. Bare `hutch pm` shows help, and `hutch pm --version` reports Hutch's
version.

The top-level `packageManager` may be `"npm"`, `"bun"`, `"pnpm"`, `"yarn"`, or
a custom `{ name, executable? }` selection. Selecting `"bun"` without an
explicit executable uses a Hutch-vendored Bun toolchain, so nothing extra needs
to be on `PATH`. With an external manager selected, `hutch install` spawns its
`install` command and `hutch pm ...` forwards raw arguments to it — for
example, with npm selected, `hutch pm install zod` and
`hutch pm exec -- tsc --version` delegate those operations to npm.

## Paired toolchain

Each Electrobun release declares its paired Hutch version. Hutch also records
a tested Cottontail version for projects that explicitly opt in. For example,
Electrobun 2.0.6 paired Hutch 0.29.0 with Cottontail 0.7.3. That Cottontail
pairing does not change the Bun default in Hutch 0.30.0-canary.4 or later.
Hutch uses Zig `0.17.0` and selects a native
ARM64 compiler on Windows ARM64 even when the caller is an emulated x64 process.

Native Zig app builds retain their compiler cache under
`.hutch/cache/zig/<os>-<arch>` across bundle rebuilds. The install output is
still regenerated inside the build directory. Keep `.hutch` generated and
untracked; a clean bundle does not require deleting this compiler cache.

## Versions and updates

The global launcher's selection names an exact installed release. Hutch engines
and Cottontail runtimes are stored side by side, so one project can pin an
older release without replacing your global selection.

```bash
hutch upgrade
hutch self version
hutch cottontail version
```

Interactive use checks for updates periodically. CI and other non-interactive
invocations never prompt.

When Cottontail is explicitly selected for Hutch, an unpinned project uses the
Cottontail version tested with that Hutch release, and `hutch upgrade` advances
the pair together. Configuration, scripts, hooks, and build helpers otherwise
use Bun by default. (`hutch self update` remains as the explicit long form of
`hutch upgrade`.) This pairing covers the optional build-time runtime only —
the Cottontail bundled into an app by `mainProcess: "cottontail"` is a
runtime component pinned by the selected Electrobun release's devkit
manifest, exactly like the bundled Bun. Projects that install through npm
receive their exact Hutch and Electrobun defaults from the one `electrobun`
dependency and its GitHub Release assets — updating it moves the tested set
tracked by your lockfile.

Updating moves only the global selection. A project whose pragma pins an exact
version keeps running that version — `hutch upgrade` says so and suggests
`hutch self pin` when the pin now trails the selection it just advanced.
`hutch status` shows the current directory's pragma, the version it resolves
to, and the active channel's selection side by side.

## Local store and cleanup

Hutch keeps verified installations and authoritative local state under its
home directory:

```text
~/.hutch/
|-- bin/
|-- releases/
|   |-- hutch/
|   |-- cottontail/
|   `-- electrobun/
|-- toolchains/
|-- npm/
|   `-- electrobun/
`-- state/
    |-- selections.json
    |-- projects/
    |-- leases/
    |-- locks/
    |-- trash/
    `-- tmp/
```

Remote channel manifests, template catalogs, artifact indexes, and template
indexes are fetched fresh and are not stored persistently. There is no local
channel directory tree. A download may use `state/tmp/` while Hutch verifies
and installs it, but only the installed release or toolchain remains.

Hutch registers the exact releases and managed toolchains used by each prepared
project. The currently executing Hutch release, local selections, resolvable
registered projects, and live leases protect those installations. Missing
projects and project dependency records that cannot be resolved protect
nothing.

Every ordinary Hutch invocation lazily removes releases and toolchains after
they have remained unreachable for 10 days. The explicit cleanup commands use
no retention period:

```bash
# Preview every currently unreachable release and toolchain without mutation
hutch prune --dry-run

# Remove every currently unreachable release and toolchain immediately
hutch prune

# Recreate the Hutch home immediately, without a prompt
hutch reset
```

Reset reseeds the launcher, engine, and exact Hutch selection used to run it,
so Hutch itself remains usable. It removes every other Hutch-managed release,
toolchain, selection, project registration, lease, temporary object, and the
`npm/electrobun` bootstrap cache. Prune does not manage that bootstrap cache.
Neither command touches project files or package-manager caches owned outside
the Hutch home by npm, Bun, pnpm, Yarn, Cargo, or Go.

Offline use is limited to exact releases and managed toolchains that are already
installed, including an exact release named by a local selection. A missing
release or toolchain requires a fresh network lookup and download. Builds can
run offline when every required Hutch, selected JavaScript runtime, Electrobun, and toolchain
installation is present and JavaScript dependencies are already materialized.
An explicitly selected external manager applies its own offline and cache
rules. `hutch electrobun init` always requires the network.

## Pin a project

Need a project to build the same way for everyone, regardless of what's
installed globally? Place an optional pragma on the first line of
`hutch.config.ts`:

```ts
// @hutch cli=production cottontail=production
```

Use `production`, `stable`, `latest`, an exact semantic version, or
`build:<full-git-revision>` as a selector. `stable` and `latest` resolve to
`production`:

```ts
// @hutch cli=0.29.0 cottontail=0.7.3
```

The pragma selects versions only for that project. It never rewrites the global
installation's local selections. A Cottontail version pin takes effect when
Cottontail is explicitly selected; it does not opt configuration, scripts, or
helpers into that runtime.

The pragma is optional. npm-launched commands use the exact Hutch and
Electrobun defaults paired with the installed `electrobun` dependency. A direct
Hutch invocation instead uses its active channel. With Hutch 0.30.0-canary.4 or
later, both use Bun by default;
explicit Cottontail workflows use Hutch's tested Cottontail version unless
pinned. An unpinned Electrobun project follows the
release channel when explicitly synced and stays on the projected version
between syncs. Every explicit pin wins over these defaults.

The pin commands rewrite the pragma so it never needs hand editing:

```bash
# Pin the nearest hutch.config.ts to the exact version currently
# selected for the active channel
hutch self pin
hutch cottontail pin

# Pin an explicit selector, including the floating `latest`
hutch self pin 0.29.0
hutch self pin latest

# Walk the tree below the current directory and move every config whose
# pragma already pins an exact version or build — configs that track a
# channel or carry no pragma are left alone
hutch self pin --recursive
hutch cottontail pin --recursive
```

The recursive form is made for monorepos with many pinned projects — for
example, bumping every explicitly pinned project after a Hutch release with one
command.

## Select, prepare, and sync Electrobun

`electrobun.version` is an optional exact override in `hutch.config.ts`,
alongside tasks and an optional external package-manager selection:

```ts docs=syntax
export default {
  // Optional: omit this object to use the npm or channel default.
  electrobun: { version: "2.0.6" },
  scripts: {
    dev: ["hutch", "electrobun", "dev", "--watch"],
  },
};
```

When present, the version must be exact; npm tags and semver ranges are not
Electrobun release selectors. Otherwise an npm-launched command uses the
installed package's exact paired version. A direct Hutch command floats on the
active release channel: `hutch electrobun sync` advances to its current head,
while `prepare`, `build`, `run`, and `dev` reuse the version already projected
into `.hutch/devkit` so builds remain stable between syncs. An explicit pin
always wins.

Run `hutch electrobun update` from an app directory to upgrade an exact pin.
Hutch finds the nearest parent `hutch.config.ts`, resolves the latest stable
Electrobun release, rewrites only its exact `electrobun.version` string literal,
and then syncs the current app. The command always targets stable, including
projects initialized from beta templates. It requires network access and fails
instead of guessing when the pin is missing, computed, or ambiguous.

`hutch electrobun prepare` resolves and verifies the selected release in the global
`~/.hutch/releases/electrobun` store, then copies its SDKs and editor facade into
the project's generated `.hutch/devkit` sysroot. It also resolves the selected
native compiler under `~/.hutch/toolchains` when the project needs one. It
preserves an existing valid projection for a floating direct-Hutch project.

`build`, `run`, and `dev` prepare implicitly. The explicit command is useful
after changing the version pin, for editor setup, before Vite or a standalone
typecheck, or for preparing a build that will later run without network access.
Use `hutch electrobun sync` only when you intend to advance an unpinned
direct-Hutch project to the current channel head. `init` performs its initial
sync to a published template's exact pin; npm or catalog defaults apply only to
an unpinned template.

Templates ignore `.hutch/` by default. Hutch owns this generated state and may
replace it during sync; direct SDK edits and committing the projection are not
supported workflows. See
[Project Ownership and the Devkit](/electrobun/guides/project-ownership/) for
the complete boundary and external-bundler recipe.

## Toolchains and installed releases

For Zig, Rust, Go, and Odin main processes, you don't need to install the
compiler yourself. The selected Electrobun devkit declares a default exact
version for each language; `build.zig.version`, `build.rust.version`,
`build.go.version`, and `build.odin.version` can override it per project. Hutch
accepts an exact matching system compiler when supported, otherwise downloads
the selected toolchain into
`~/.hutch/toolchains/<language>/<version>/<platform>` and shares it across
projects.

The project still owns its build description and language dependencies:
`build.zig` for Zig, `Cargo.toml`/`Cargo.lock` for Rust, and `go.mod`/`go.sum`
for Go. Odin builds the configured project package directory. Hutch uses the
matching SDK copy in `.hutch/devkit` and passes its path to those normal build
tools; it does not generate build files or synthesize a GOPATH.

<Aside type="note">
Hutch is build-time tooling. The resulting application contains its selected
main process and Electrobun runtime files; it does not require the user's
global Hutch installation.
</Aside>

=== FILE: guides/insights.mdx ===
---
title: "Electrobun Insights"
description: "Opt into app lifecycle analytics and custom events through Electrobun's native core."
---

Electrobun Insights is a preview analytics service managed through your Dash
account. It reports app opens, approximate open duration, OS/architecture, and
app versions/builds, and accepts custom events from your app.

Insights is **off by default**. It uses its own ingestion endpoint and does
not piggyback on update checks. You can use it with
[Managed Deploys](/electrobun/guides/managed-deploys/), a self-hosted release
folder, or a build that disables Electrobun's direct updater. Hosting, Insights,
and directory registration are independent choices; these services require
Dash Pro during the preview.

## Configure Insights without starting collection

Create an app in [Electrobun Apps in Dash](https://docs.electrobun.dev/dash/electrobun-apps/)
and enable its Insights service.
Add its app ID to your existing `electrobun.config.ts`:

```typescript
import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "My App",
    identifier: "com.example.my-app",
    version: "2.0.0",
  },
  insights: {
    appId: "YOUR_APP_ID",
    enabled: false,
  },
} satisfies ElectrobunConfig;
```

For an installation without a saved runtime choice, this configures the native
client but leaves collection disabled until your app enables it. An existing
saved choice takes precedence. Omitting `enabled` has the same default. Omitting the entire
`insights` block leaves the reporter unconfigured, so a later `setEnabled(true)`
has no configured service to enable.

Your app owns its collection policy and any consent or settings UI. The SDK
provides configuration and runtime controls; it does not require a particular
prompt, toggle, or choice of build-channel defaults. For Bun and Cottontail,
your app can change collection at runtime:

```typescript
import { Insights } from "electrobun/main";

// Call when the user chooses to enable analytics.
Insights.setEnabled(true);

// Call when the user chooses to disable analytics.
Insights.setEnabled(false);
```

If your app should collect by default, set `insights.enabled: true` explicitly.
An installation's persisted `setEnabled` choice takes precedence over that build
default across restarts and updates. `setEnabled(false)` stops **all** collection,
including basic lifecycle events and custom events, and clears queued events
and the active session journal. Requests already sent may finish. Server policy
cannot override this local setting.

The same native client is available through the Bun, Cottontail, Zig, Rust, Go,
and Odin SDKs. Normal bundled SDK startup reads the configuration and normal
teardown saves session state. See the [Insights API](/electrobun/apis/insights/)
for the language-specific calls.

### Choose defaults by build channel

Hutch supplies `ELECTROBUN_BUILD_ENV` when evaluating `electrobun.config.ts`.
For example, an app can collect by default in canary while leaving stable
collection disabled until its own runtime flow enables it:

```typescript
import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "My App",
    identifier: "com.example.my-app",
    version: "2.0.0",
  },
  insights: {
    appId: "YOUR_APP_ID",
    enabled: process.env.ELECTROBUN_BUILD_ENV === "canary",
  },
} satisfies ElectrobunConfig;
```

This is an app-chosen policy, not the SDK default. A persisted runtime choice
still overrides the configured default: shipping a later build with
`enabled: false` does not reset an installation that previously enabled it.
Use `setEnabled` when your app needs to change the current local setting, and
keep any settings UI synchronized with the choice your app passes to the SDK.

## Automatic lifecycle data

While collection is enabled, the Zig core records:

- An app/profile installation ID, app version and build hash, channel, OS, and
  architecture.
- `electrobun.app.open` and `electrobun.app.close` events, with a shared
  `appSessionId` and original session times.
- Approximate process-open duration while the machine is awake.
- `electrobun.app.interrupted` on the next launch when the previous run did not
  record a clean end.

Open duration does not measure foreground attention. An interrupted session is
not a crash diagnosis: a process kill, power loss, or another unclean shutdown
can produce it. There is no crash-report upload in this preview.

One app-open period is one session. Your app does not need user accounts or a
sign-in integration for this data. Signing in is not an automatic analytics
event and does not start a new duration segment.

Duration is checkpointed locally roughly once a minute, without a network
heartbeat. Normal shutdown saves final duration and the close event without
waiting for network delivery. The next launch delivers queued records and
recovers an interrupted session's last checkpoint with its original timestamps
and app version. Time between launches is not counted. Session/day totals are
cumulative so delivery retries cannot count the same duration twice.

## Custom events and optional user association

Use events for app-specific actions:

```typescript
import { Insights } from "electrobun/main";

const queued = Insights.track("export_completed", {
  format: "pdf",
  pages: 3,
});
```

`true` means the event was accepted into the local queue, not that the server
received it. A disabled client, invalid payload, or disabled custom collection
returns `false`. Prefer event names and properties that describe behavior
without including private document contents, passwords, or tokens.

If your app has its own user accounts, you may associate **future custom
events** with an opaque ID from that system:

```typescript
import { Insights } from "electrobun/main";

Insights.identify("user_123");
Insights.track("workspace_created", { template: "blank" });

// Clear the association when appropriate for your app.
Insights.reset();
```

`identify` and `reset` do not create or split sessions, change open duration, or
replace the installation ID. Send your own login/logout events only if your
application needs them.

See [event limits](/electrobun/apis/insights/#event-limits) for supported names,
flat scalar properties, and payload size limits.

## Installation identity

Use [`app.getInstallationId()`](/electrobun/apis/app/) to display or copy the
installation ID in an About/Help menu or settings. It works independently of
Insights and returns the same identity used by managed updates and prerelease
routing.

The ID is randomly generated and persisted in the local app profile; it is not
a hardware serial number, a Dash account, or an authenticated app user. Restarts
and updates retain it. Separate profiles have separate IDs; deleting local
data can create a new ID, and copying a profile can copy its ID.

## Offline delivery and local storage

The shared core owns queuing, session recovery, and delivery for every SDK.
The current preview keeps at most 128 queued events or 512 KiB of event payload,
expires queued events after 30 days, and drops oldest queued entries when the
queue fills. The persisted active-session journal is additional to that event
queue. The service also discards events outside its retained detail window.

This is best-effort analytics. Offline records may arrive later than current
events, and an app that never opens again may leave its final session incomplete.
Calling `flush()` requests background delivery; it is not a network-delivery
acknowledgement.

Local identity and queued/session state use versioned authenticated encryption,
with the key stored beside the files. This obscures casual inspection and
detects corruption; it does not hide data from the machine's owner. Existing
plain JSON state migrates when next persisted. One app process should own a
user-data profile at a time: independent concurrent processes sharing that
directory can overwrite queued state. Use separate profiles for those instances.

## Collection policy and dashboard data

In Dash, use the app's Insights view to inspect installation activity, approximate
duration, OS/architecture, version/build adoption, and custom events. Queued
delivery and interrupted-session recovery mean these are approximate, eventually
received observations rather than an exact count of people currently online.

While the app has locally enabled collection, basic lifecycle, duration,
version, and platform collection continues when the developer's custom-event
allowance is exhausted or the paid subscription expires. Analytics responses
carry `collection.customEvents`; the core persists that server policy and drops
disabled custom events without blocking basic events. A subsequent ordinary
response can reactivate custom events. This policy controls only custom events;
it cannot start basic or custom collection when the app has disabled Insights
locally. There is no separate policy-polling endpoint or hourly heartbeat.

Use the app's dashboard for its current service limits and retention.

## Endpoint configuration

The default public ingestion endpoint is automatic:

```text
https://api.electrobun.dev/v1/electrobun/apps/<appId>/insights
```

The app contains a public app ID and ingestion URL, never a deploy API key.
An installation ID helps group events; it is not a secret that authenticates
the sender. Owner dashboard access and upload/publication keys are separate.

If the same app configures a
[managed custom origin](/electrobun/guides/managed-deploys/#custom-domains),
Insights uses that origin with the same app-scoped Insights path unless
`insights.apiUrl` explicitly overrides it. The hostname is bound to one app.
`release.managed.apiUrl` does **not** become the Insights endpoint override;
when testing both services against staging, override both settings.

Dev builds require explicit `insights.enabled: true` **and** a loopback HTTP
test endpoint. The hosted service accepts packaged stable/canary builds, not
dev-build traffic. Use a local service when developing ingestion behavior.

For external-store builds, `release.updateAuthority: "external"` or `"none"`
disables direct updates without disabling Insights. Those settings do not
implement a store integration.

=== FILE: guides/managed-deploys.mdx ===
---
title: "Electrobun Managed Deploys"
description: "Upload each runner's artifacts, review a release in Dash, and publish to prerelease installs or everyone."
---

Electrobun Managed Deploys is a preview hosting service managed through your
Dash account. It stages the files Hutch builds, lets you review the accumulated
release, and publishes them through Electrobun's ordinary update URLs.

Managed Deploys, [Electrobun Insights](/electrobun/guides/insights/), and an app's
directory listing are independent services. Enable the ones you want in
[Electrobun Apps in Dash](https://docs.electrobun.dev/dash/electrobun-apps/).
These services require Dash Pro during the preview;
hosting does not enable analytics or create a public directory listing.

Your app controls Insights collection and any consent/settings UI, including
different canary and stable defaults. Neither publishing a release nor adding
an installation to the prerelease group enables collection. See
[Insights collection controls](/electrobun/guides/insights/#choose-defaults-by-build-channel).

You can continue hosting Electrobun releases on any static HTTPS host. The
[self-hosted update workflow](/electrobun/guides/updates/#static-release-hosting),
artifact names, and patch-chain behavior are unchanged.

## Configure an app

Open **Electrobun Apps** from Dash's Quick Access, create an app, and enable
Managed Deploys. Copy its app ID into your existing `electrobun.config.ts`:

```typescript
import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "My App",
    identifier: "com.example.my-app",
    version: "2.0.0",
  },
  release: {
    managed: { appId: "YOUR_APP_ID" },
  },
} satisfies ElectrobunConfig;
```

The service URL is automatic. You do not need a custom domain, an app-specific
subdomain, or an `apiUrl` value. Insights is still off with this configuration.

Keep the base app name and identifier in `app`. Hutch derives the canary app
name and managed canary identifier so canary and stable can coexist. There is
no separate canary identity to configure.

## Build and upload on each runner

Create an app-scoped deploy key in Dash and store it in your CI secrets or local
shell environment as `ELECTROBUN_API_KEY`. Never put it in app configuration,
source code, or the packaged application.

Run these commands on each OS/architecture you ship:

```sh
hutch electrobun build --env=canary
hutch electrobun upload --dry-run
hutch electrobun upload
```

For stable, build with `--env=stable`; upload is the same command. Dev builds
do not produce release artifacts. Stable and canary are separate builds and
cannot point at one another's artifacts.

Upload reads the artifact filenames and update manifests to discover the app
version, channel, and targets. Every runner with the same version and channel
contributes to one release; no target list or upload environment is required.
Hutch validates and hashes the files, then uploads their bytes directly to R2
with short-lived signed upload URLs scoped to that app's files. Retry the same
upload command to resume an interrupted upload.

The upload and publish commands run in Hutch's native core. They do not run
JavaScript, evaluate `electrobun.config.ts`, or require Bun, Cottontail, npm,
pnpm, or Yarn. Your normal build may still use its chosen runtime and package
manager. A managed build saves public upload defaults in
`.hutch/managed-deploy.json` and includes `managed-deploy.json` in the artifact
folder. These files contain no deploy key. Keep the artifact sidecar when
copying the folder to another machine, then use `--artifacts=<folder>`.

Uploads appear in the app's release view as runners finish. Review the files,
platforms, and validation results there. Uploading alone does not make a
release visible to installed applications.

## Publish after all uploads finish

Use a separate CI job that depends on every intended build/upload job
succeeding. The publish job needs only Hutch and the deploy key:

```sh
hutch electrobun publish --app=YOUR_APP_ID --release=canary-2.0.0 --audience=public --dry-run
hutch electrobun publish --app=YOUR_APP_ID --release=canary-2.0.0 --audience=public
```

The release ID is `<channel>-<version>`, also printed by upload. The publish
job reads and validates the release already stored on the server; it needs no
local artifact folder or project checkout. The service checks the files it
has, while your CI dependencies determine when all intended runners are done.
You can also review and publish the same release in Dash.

Once published to either audience, a release no longer accepts uploads or
replacement files. Use a new app version for a changed managed build. This
managed-hosting rule does not change self-hosted Electrobun's existing
hash-based behavior when a version number is reused.

Publishing changes which uploaded release the update URL serves. It does not
rename or copy the artifact files. Publishing only macOS leaves Windows and
Linux on their existing releases. All main-process runtimes check and install
through the same core-owned [Updater API](/electrobun/apis/updater/).
[Zig, Rust, Go, and Odin](/electrobun/apis/updater-native/) use typed queued
operations and explicitly approve application shutdown before apply handoff.
The core supplies metadata, shared installation identity, paths, and helper
integration. Enabling hosting does not schedule update checks inside the app.

## Publish to prerelease installs first

Most projects can test with canary builds and publish their stable builds
directly. A prerelease group is useful when you need to try a stable build on
production machines or share it with selected early adopters before everyone
sees it.

The following example assumes you have built and uploaded version `2.0.0`
with `--env=stable` on each intended runner.

1. Show [`app.getInstallationId()`](/electrobun/apis/app/) in your app's About,
   Help, or settings screen, ideally with a copy action.
2. Register those installation IDs in the app's **Prerelease installs** group
   in Dash. Labels can help you recognize them later.
3. Publish the uploaded release to that group:

```sh
hutch electrobun publish --app=YOUR_APP_ID --release=stable-2.0.0 --audience=prerelease
```

After testing, publish the same release publicly:

```sh
hutch electrobun publish --app=YOUR_APP_ID --release=stable-2.0.0 --audience=public
```

Stable/canary are build channels. Prerelease/public are audiences within either
channel. Uploading a newer version does not automatically select it for the
prerelease group. Group membership persists after public publication; an
independently selected newer prerelease also stays selected when another
release is published publicly.

The installation ID is a persisted app/profile identity shared with Insights;
retrieving it does not enable analytics. It is a routing hint, not a password
or private-download credential. The app ID in the URL, or the verified custom
hostname, selects the app before installation membership is checked.

This preview does not provide percentage rollouts or automated smoke tests.
Use a new version for forward fixes.

## Update URLs and patch chains

The default base URL is supplied by the managed app configuration:

```text
https://api.electrobun.dev/v1/electrobun/apps/<appId>/updates/
```

The updater requests ordinary flat filenames beneath it:

| File | Example |
| --- | --- |
| Current update metadata | `stable-macos-arm64-update.json` |
| Optional checksum for the selected build | `stable-macos-arm64-checksum.json` |
| Next patch from the installed hash | `stable-macos-arm64-<currentHash>.patch` |
| Full download | The exact archive filename in `update.json` |

There is one `update.json` per channel/target, with no separate managed
manifest format. The app never adds a version folder to this URL. At each
patch step it requests the current hash's patch from the same base URL; the
service locates that patch among retained releases. Missing or unusable
patches retain Electrobun's full-download fallback. Hutch generates patches
using the publicly selected release; the hosting service does not generate
patches for you.

The checksum file contains the selected build's `hash`, `tarSha256`, and
`tarSize`. Rebuilding a staged release replaces that target's checksum file;
each retained release folder keeps its own copy. The public checksum URL uses
the same platform and prerelease selection as `update.json`. Older updater
betas can still request a hash-named checksum URL: the service resolves it to
that eligible retained build without requiring another stored sidecar.

Managed requests send `X-Electrobun-Installation-Id`. Registered prerelease
installs receive their selected prerelease, and other installs receive the
public selection. The header is stripped when a redirect leaves the configured
origin. Self-hosted update requests do not acquire this managed header.

## Storage and cleanup

Dash groups original artifact filenames by channel and version. The managed
service keeps the current and previous public release for each platform and
the selected prerelease. It can retire full downloads and manifests from older
unreferenced releases while keeping their patches available. A platform omitted
from a newer release keeps its existing files and selection.

Patches remain by default. Use **Delete** with confirmation to remove individual
files, or **Prune** in the app's **Settings → Advanced** to preview patch files
by version cutoff or age and optional platform. Review the selected file count
and bytes before deleting. An optional patch-age retention setting enables
automatic pruning; it is off by default. Deleting a needed patch makes older
clients fall back to a full download. Deleting an active manifest or required
full archive withdraws that release's target from update routing; it does not
automatically promote an older release into the vacated selection.

## Custom domains

Register and verify a custom hostname in the app's Dash settings, then set its
HTTPS origin alongside the managed app ID:

```typescript
import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "My App",
    identifier: "com.example.my-app",
    version: "2.0.0",
  },
  release: {
    managed: { appId: "YOUR_APP_ID" },
    baseUrl: "https://updates.example.com",
  },
} satisfies ElectrobunConfig;
```

For managed hosting, `baseUrl` is an HTTPS origin on the standard port, with no
path, credentials, query, or fragment. Files are requested from its root, such
as `https://updates.example.com/stable-macos-arm64-update.json`.

Dash provides the DNS ownership proof and CNAME target. A CNAME maps a hostname,
not a URL folder; the service must also verify the app binding and activate
HTTPS. Each hostname serves only its bound app. The default app-scoped hosted
URL remains available.

If Insights is configured with the same app ID and no explicit
`insights.apiUrl`, it uses this origin at
`/v1/electrobun/apps/<appId>/insights`. Upload and publication continue using
the management API; the custom delivery origin does not receive deploy keys.

You can instead operate your own HTTPS reverse proxy outside this service.
Terminate TLS there and rewrite root artifact requests to the canonical
app-scoped update path. Forward range/conditional headers and the installation
ID header, and forward Insights POST bodies to the app's Insights path. Use an
upstream proxy request, not a cross-origin redirect, because redirects strip
the installation ID. A DNS CNAME alone cannot perform this rewrite.

## Other distribution methods

`release.updateAuthority` defaults to `"direct"`. Setting it to `"external"`
or `"none"` disables Electrobun's direct updater without disabling Insights.
An app-store update check or action that opens a store must be implemented
separately; this setting does not add store submission or distribution support.

Keep a self-hosted endpoint available for existing clients when moving an app
to managed hosting: those clients still know the URL embedded in their current
build. Publish a bridge release at that endpoint with the managed configuration
in the new app, then test a subsequent update from the upgraded installation.

=== FILE: guides/migrating-to-v2.mdx ===
---
title: "Migrate to Electrobun 2.x"
description: "Upgrade the npm dependency, run your scripts, and fix what the validator reports."
---

Electrobun 2.x moves build orchestration to Hutch. Electrobun 2.0.6 uses Bun
as the default JavaScript main process; 2.0.2 defaulted to Cottontail.
Application code and RPC schemas usually need
little or no change, and the npm package remains the front door. There is one
dependency-free package: its first command downloads the exact paired Hutch
archive from the same-version Electrobun GitHub Release, verifies and caches it,
then forwards through Hutch. Existing-project npm commands have no prerequisite
machine-wide Hutch installation, shell-profile change, or postinstall script,
and there is no separate platform npm package. Initialization is intentional:
`electrobun init` still ensures a compatible global launcher for the generated
project's later direct `hutch` tasks, while init itself runs through the exact
private cache.

## The short version

```bash
npm install electrobun@2      # or: bun add electrobun@2
npm run dev                   # your existing `electrobun ...` scripts still work
```

1. **Bump the dependency.** Keep the one `electrobun` package in
   `devDependencies`; its version now *selects your default toolchain*. The
   command first reads `hutch-artifacts.json` from that version's GitHub Release,
   then downloads the host's paired Hutch archive and checks the bytes against
   the index entry's immutable release URL, declared size, and SHA-256 digest.
   Hutch resolves the selected build runtime and paired Electrobun version,
   so updating the dependency moves the set tracked by your
   lockfile.

2. **Run your scripts.** `electrobun dev`, `electrobun build`, and friends
   forward through Hutch. On first run the Electrobun core and devkit
   download into the shared `~/.hutch` store (the same way Electron caches
   its binaries) and the SDK is projected into your project's
   `.hutch/devkit/`.

3. **Fix what stops you.** The configuration validator names each removed
   v1 field precisely (see below); delete them and rerun.

4. **Point TypeScript at the devkit** so editors resolve `electrobun/*`
   imports:

   ```json
   {
     "extends": "./.hutch/devkit/tsconfig.json",
     "include": ["src", "electrobun.config.ts"]
   }
   ```

That's the whole migration for most apps. The sections below cover the
details and the situational cases.

## Returning to a single update manifest

The compatibility fix described in the
[unreleased changelog](/electrobun/guides/changelog/unreleased/) preserves one
`<channel>-<os>-<arch>-update.json` release manifest with its original
`artifact: { file }` shape. Its sidecar,
`<channel>-<os>-<arch>-checksum.json`, contains the matching build `hash` and
the exact uncompressed tar's SHA-256 and byte size as `tarSha256` and `tarSize`.
Uploading another build replaces this fixed checksum filename. New updaters
fall back to the older hash-named checksum file if the fixed filename returns
`404`, and retain older hosting behavior if neither file exists.

An earlier preview put these integrity fields inside `artifact`. Some shipped
native clients reject unknown fields, so that change prevented them from
checking for updates. Publish the compatible manifest shape and its checksum
sidecar to restore their update path. Newer clients still accept the inline
fields for compatibility with hosts that already published them.

If your previous toolchain uploaded `*-update-v2.json`, publish the new
compatible canonical manifests, checksum sidecars, and their artifacts, then
delete the old v2 objects and purge cached copies. The removed URLs must return
`404` so existing clients that check v2 first can fall back. See
[the update-host cleanup instructions](/electrobun/guides/updates/#remove-previously-published-v2-manifests).

Once your self-hosted folder serves the fixed checksum filename, old
hash-named checksum files can be removed in a one-time cleanup. Earlier betas
that only request those old names still update after a `404`, without their
optional tar SHA-256 check. See
[checksum cleanup and compatibility](/electrobun/guides/updates/#remove-old-hash-named-checksum-files).

## Upgrading from 2.0.5 to 2.0.6

Update the npm dependency and any explicit Electrobun pin:

```bash
npm install --save-dev electrobun@2.0.6
```

If `hutch.config.ts` sets `electrobun.version`, change it to `2.0.6` as well.
An exact project pin takes precedence over the installed npm package. A
first-line Hutch pragma also overrides the npm defaults: update it to
`cli=0.29.0 cottontail=0.7.3`, or remove it to use the release's paired tools.
Direct Hutch users should run `hutch upgrade` before rebuilding.

### Update publishing

Keep the application's identity and update channel, and continue publishing at
the URL known to existing installations. New builds require an HTTPS
`release.baseUrl`, except for loopback HTTP in local development; see the
[release-host migration guidance](/electrobun/guides/updates/#upgrading-to-the-206-updater)
if older clients use a remote HTTP host. Publish the complete generated
`artifacts/` directory, making its manifests available after its bundles,
checksum sidecars, and patches. The original 2.0.6 toolchain, paired with Hutch
0.29, emitted an additional `*-update-v2.json` alongside `*-update.json`. When
adopting the single-manifest fix, follow the [cleanup steps above](#returning-to-a-single-update-manifest)
so those old v2 files do not hide subsequent updates.

Apps built with 2.0.6 reconstruct the original release tar in memory from the
installed files and an archive recipe, then stream patch output into a staged
replacement. The application-side `Updater` API stays the same. An older
installed app still uses its older updater to receive this release; test a
subsequent update from the new installation to exercise the new path. See
[Updates](/electrobun/guides/updates/) for the hosting contract and
[Updater disk space](/electrobun/apis/updater/#disk-space-during-preparation)
for the staging and memory requirements.

### Native GPU UI and embedded frames

[Electrobun UI](/electrobun/guides/electrobun-ui/) is an optional experimental
API for GPU-rendered interfaces on macOS, Windows, and Linux. Follow its setup
guide to enable `bundleWGPU` for each target and choose the native UI or webview
DOM renderer. The experimental API status applies even when using a stable
Electrobun release.

In macOS system webviews, native bridge access and custom preloads are scoped
to the main frame. If an embedded iframe needs to communicate with the app,
relay its messages through the parent with `postMessage` and validate the
sender there. See [BrowserView](/electrobun/apis/browser-view/) for navigation
and preload behavior.

<span id="upgrading-from-202-to-204"></span>

## Upgrading from 2.0.2 to 2.0.5

Install the release dependency:

```bash
npm install --save-dev electrobun@2.0.5
```

If `hutch.config.ts` pins `electrobun.version`, update that exact pin to the
release you installed as well. An explicit project pin wins over the npm
version. `hutch electrobun update` updates the project to the latest stable
release; set `electrobun.version` to `2.0.5` to select this release exactly.

An older first-line `// @hutch` pragma also overrides the npm defaults. Update
it to `cli=0.28.2 cottontail=0.7.3`, or remove it when using the npm bootstrap
so the release can select its paired toolchain. Direct Hutch users can run
`hutch upgrade` to update their global installation.

Electrobun 2.0.5 includes native Intel Mac support on macOS 14 or later.
Build Intel apps on an Intel Mac or native Intel CI runner; cross-compiling
from Apple Silicon is not supported.

Choose the app runtime explicitly when migrating:

- To adopt the new default, set `build.mainProcess: "bun"` and move the entrypoint
  and shared bundler options from `build.cottontail` into `build.bun`. Omit
  Cottontail-only `capabilities` and bytecode settings.
- To retain experimental Cottontail, set `build.mainProcess: "cottontail"` and
  keep `build.cottontail`.

An older config that omits `mainProcess` and supplies only a `cottontail` or
`main` block now fails with a migration error. The conventional `src/bun`
source directory and runtime-neutral `electrobun/main` imports can stay as they
are. Existing explicitly selected runtimes remain explicit.

Hutch 0.30.0-canary.4 or later defaults configuration, scripts, tests, shell
tasks, build hooks, and build helpers to Bun. App runtime selection does not
change that choice. Use `HUTCH_RUNTIME=cottontail` for workflows that explicitly
require Cottontail; putting `cottontail=...` in the version pragma does not
select it.

The updated Zig SDK requires Zig `0.17.0`. Update an older explicit
`build.zig.version` pin along with the devkit.

## Configuration: what changed

Keep application and distribution settings in `electrobun.config.ts`:

```ts
import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "My App",
    identifier: "dev.example.my-app",
    version: "2.0.0",
  },
  build: {
    mainProcess: "bun",
    bun: {
      entrypoint: "src/bun/index.ts",
    },
  },
} satisfies ElectrobunConfig;
```

For the lowest-risk bridge release from a v1 Bun app, keep
`build.mainProcess: "bun"` and its existing `build.bun.entrypoint`; migrating
the main process to experimental Cottontail is optional. The directory may
remain `src/bun` — its name does not select the runtime.

Remove the v1-only `build.targets`, `build.useAsar`, `build.asarUnpack`,
`build.cefVersion`, `build.wgpuVersion`, `build.bunVersion`,
`build.bunnyBun`, and `build.locales` settings. Hutch builds for the current
host, and the exact Electrobun release supplies its bundled runtime versions.

Main-process code should use the runtime-neutral SDK entrypoint; the v1
`electrobun/bun/*` specifiers remain valid aliases:

```ts
import { BrowserWindow } from "electrobun/main";
```

## Versions: pinned or floating

Nothing needs a version pin. Without one, your project's toolchain comes from
the installed npm dependency (exact, lockfile-tracked), and a project without
the npm dependency floats on the release channels. To pin explicitly —
reproducible builds independent of the npm dependency — create
`hutch.config.ts`:

```ts docs=syntax
// @hutch cli=0.29.0 cottontail=0.7.3
export default {
  electrobun: {
    version: "2.0.6",
  },
};
```

Explicit pins always win over the npm-supplied defaults. An npm version, tag,
or range never replaces an exact pin — the config pin is authoritative when
both exist.

## Dependencies and lockfiles

Hutch ships a minimal built-in npm-compatible resolver and uses it by
default: `hutch install` resolves `package.json` (registry, `file:`, and git
dependencies), verifies integrity, and writes `hutch.lock`. An existing
`bun.lock`, `package-lock.json`, `pnpm-lock.yaml`, or `yarn.lock` is ignored
— never read, migrated, or modified. Lifecycle scripts never run.

With that built-in resolver, `hutch pm exec -- <command> [args...]` runs only a
matching binary already installed in the nearest package project's
`node_modules/.bin`; it never downloads one or falls back to `PATH`.

To keep your existing package manager instead, declare it in
`hutch.config.ts` — the only selection Hutch honors:

```ts docs=syntax
export default {
  packageManager: "npm", // or "bun" | "pnpm" | "yarn"
};
```

## Monorepos

One root `hutch.config.ts` can supply a pragma, pins, package manager, and
tasks to every nested app. Hutch walks upward from the current directory and
loads the nearest config; it does not merge multiple configs. Each Electrobun
command treats its invocation directory as the app root: that directory
contains `electrobun.config.ts` and receives its own build, artifacts, and
`.hutch/devkit` state. Ignore every generated `.hutch/` directory.

## External bundlers

Hutch injects the selected devkit aliases into Electrobun's own bundles. An
external bundler has a separate resolver and must receive equivalent aliases.
For Vite, use the helper projected with the devkit:

```ts docs=syntax
// vite.config.ts
import { resolve } from "node:path";
import { defineConfig } from "vite";
import { electrobunViteAliases } from "./.hutch/devkit/api/config/electrobun-vite";

export default defineConfig({
  resolve: {
    alias: electrobunViteAliases(resolve(__dirname, ".hutch/devkit")),
  },
});
```

For another bundler, derive exact aliases from the generated
`.hutch/devkit/package.json` export map and reject targets outside its `api/`
tree. Do not let Electrobun imports fall through to `node_modules/electrobun`
— the npm package deliberately exports only an error that points here.

## Coming from a 2.x prerelease: `stable`, not `production`

The Electrobun build environments are `dev`, `canary`, and `stable`; packaged
updater channels are `canary` and `stable`, matching v1. The temporary
`production` spelling used by earlier 2.x prereleases is retired and is not
an alias. Replace `--env=production` with `--env=stable` in scripts and CI
where the value represents the Electrobun channel; unrelated infrastructure
may keep the name `production`.

## Shipping to existing v1 users

If users already have a stable app built with Electrobun v1.18.1 or later,
the first 2.x release can be delivered through that app's existing updater.
For this bridge release:

- keep `app.name` and `app.identifier` unchanged;
- keep the same `release.baseUrl` embedded in the installed 1.x app;
- build the new release with `--env=stable`; and
- publish the complete `artifacts/` directory without renaming its files.

Hutch emits the `stable-*` metadata and payload names requested by compatible
1.x stable clients. After the old updater places the 2.x payload, its first
launch preserves the physical `stable` state root; existing user data and
browser state do not move. Earlier Electrobun 2.x prereleases used updater or
payload layouts that are not universally bridgeable — distribute the normal
2.x installer to those users. See
[Updates](/electrobun/guides/updates/) for the hosted artifact contract.

## Delete v1 package-layout assumptions

Delete migration helpers that locate or symlink `node_modules/electrobun`,
walk up from `require.resolve("electrobun")`, or expect platform directories
such as `dist-macos-arm64`. Those were v1 npm package internals. Use
`.hutch/devkit` for SDK source and types, and do not replace the old
assumptions with paths into `~/.hutch`; that store is Hutch-owned.

## Verify

```bash
npx electrobun sync
npx electrobun config --env=stable
npx electrobun dev
npx electrobun build --env=stable
```

Hutch builds for the current host. Verify startup, RPC, webviews, signing,
installers, and updates on native runners for every platform you distribute.

=== FILE: guides/native-main-process.mdx ===
---
title: "Main Process Runtimes"
description: "Choose Cottontail, Bun, Zig, Rust, Go, or Odin for an Electrobun main process."
---
import { Aside } from "@astrojs/starlight/components";

The main process doesn't have to be JavaScript. Electrobun exposes the same
native core to six runtimes — so a team that thinks in Rust, or an app whose
main process is really a simulation loop, can skip the JS layer entirely and
still get Electrobun's windows, webviews, RPC, and packaging. Hutch is the
build tool for every option, and switching runtimes is a config change, not a
different framework.

The practical decision is simpler than six options suggests: start with
Bun (the default), try experimental Cottontail explicitly, or
reach for a native language when you want compiled performance or a
smaller-than-JavaScript footprint. Each runtime has a dedicated walkthrough:
[Cottontail](/electrobun/guides/cottontail/),
[Bun](/electrobun/guides/hello-world-bun/),
[Zig](/electrobun/guides/hello-world-zig/),
[Rust](/electrobun/guides/hello-world-rust/),
[Go](/electrobun/guides/hello-world-go/), and
[Odin](/electrobun/guides/hello-world-odin/) — and the
[Main Process API](/electrobun/apis/main/) page shows what the SDK looks like
in every language, including a per-feature coverage matrix.

| Runtime | `build.mainProcess` | Project build input | Default toolchain |
| --- | --- | --- | --- |
| Cottontail (experimental) | `"cottontail"` | `src/bun/index.ts` | Downloaded runtime |
| Bun (default) | `"bun"` | `src/bun/index.ts` | Downloaded runtime |
| Zig | `"zig"` | `build.zig` | Zig 0.17.0 |
| Rust | `"rust"` | `Cargo.toml` / binary `main` | Rust 1.99.1 |
| Go | `"go"` | `go.mod` / package `./src/go` | Go 1.26.10 |
| Odin | `"odin"` | package containing `src/odin/main.odin` | Odin dev-2026-07a |

## Cottontail

Cottontail is experimental and opt-in. It executes TypeScript and supports the Node.js and
Bun-compatible APIs used by Electrobun applications.

```typescript
import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "Cottontail App",
    identifier: "dev.example.cottontail-app",
    version: "0.1.0",
  },
  build: {
    mainProcess: "cottontail",
    cottontail: { entrypoint: "src/bun/index.ts" },
  },
} satisfies ElectrobunConfig;
```

```typescript
import { BrowserWindow } from "electrobun/main";

new BrowserWindow({
  title: "Hello Electrobun",
  url: "views://mainview/index.html",
});
```

## Bun

Bun is the default JavaScript and TypeScript runtime. Hutch bundles source and packages the app; its built-in resolver owns
JavaScript dependencies by default, or the project's explicitly selected
package manager owns them instead.

```typescript
import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "Bun App",
    identifier: "dev.example.bun-app",
    version: "0.1.0",
  },
  build: {
    mainProcess: "bun",
    bun: { entrypoint: "src/bun/index.ts" },
  },
} satisfies ElectrobunConfig;
```

The TypeScript Electrobun SDK remains `electrobun/main` for both JavaScript
runtimes.

## Native main processes

Zig, Rust, Go, and Odin applications load `ElectrobunCore` through their SDK,
create native windows and views, and run the platform event loop. They are
normal projects in their language rather than source snippets generated by
Hutch:

```typescript
import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "Native App",
    identifier: "dev.example.native-app",
    version: "0.0.1",
  },
  build: {
    mainProcess: "zig",
    zig: { version: "0.17.0" },
    copy: {
      "src/mainview/index.html": "views/mainview/index.html",
    },
  },
} satisfies ElectrobunConfig;
```

The Zig project owns `build.zig`; Hutch invokes it with the projected SDK path.
Rust owns `Cargo.toml` and `Cargo.lock`, with the Electrobun SDK referenced at
`.hutch/devkit/rust-sdk`. Go owns `go.mod` and `go.sum`, with a local `replace`
to `.hutch/devkit/go-sdk`. Odin compiles the configured source package with the
projected `electrobun_sdk` collection. Hutch does not generate any of those
build descriptions or synthesize a GOPATH.

The fastest way to see real native SDK code is to generate a template — each
one contains complete SDK initialization, window, webview, RPC, and
event-loop examples you can copy from:

```bash
hutch electrobun init zig-app --template=zig-wgpu
hutch electrobun init rust-app --template=rust-flock-wgpu
hutch electrobun init go-app --template=go-maze-wgpu
hutch electrobun init odin-app --template=odin-particles-wgpu
```

Odin also has focused native graphics templates for fluid simulation,
soft-body physics, cellular materials, and procedural plants:

```bash
hutch electrobun init fluid-lab --template=odin-fluid-wgpu
hutch electrobun init jelly-lab --template=odin-jelly-bunny-wgpu
hutch electrobun init alchemy-lab --template=odin-alchemy-wgpu
hutch electrobun init tree-studio --template=odin-tree-wgpu
```

## Toolchain resolution

Each resolved Electrobun devkit declares default compiler versions. The release
may come from an exact `electrobun.version` pin, the npm-paired default, or the
active channel. A project may override one with the matching
`build.<language>.version` field in `electrobun.config.ts`. Hutch checks for an
exact matching system compiler where supported; otherwise it downloads that
toolchain into
`~/.hutch/toolchains/<language>/<version>/<platform>` and reuses it across
projects. The compiler is not bundled into the finished application.

`hutch electrobun prepare` downloads and verifies the matching Electrobun core
and SDK release under `~/.hutch/releases/electrobun`, copies its SDKs into the
project's generated `.hutch/devkit` sysroot, and resolves the native toolchain
under `~/.hutch/toolchains` without advancing a valid floating projection. Go
builds on Windows also resolve Zig for cgo. `build`, `run`, and `dev` call the
same preparation automatically; use `sync` to advance an unpinned direct-Hutch
project to the current channel head.

## Updates

All native SDKs support the [shared updater](/electrobun/apis/updater-native/).
Configure `release.baseUrl` or `release.managed.appId` as for Bun/Cottontail;
the core handles metadata, installation identity, downloads, and helpers.
Native code queues work, polls typed operation results, and approves or vetoes
apply before waiting for `quitReady` and performing normal app teardown.
No network checks or application exits happen automatically.

## Native limitations

- Native main processes currently build for the host operating system and
  architecture. Use native CI runners for a release matrix.
- Windows supports x64 and ARM64 for Zig, Rust and Go main
  processes. Odin remains Windows x64-only.
- Windows Rust and Odin builds require Visual Studio Build Tools and the Windows
  SDK.
- macOS needs Xcode Command Line Tools. Linux needs the platform compiler and
  linker packages documented in [Cross-Platform Development](/electrobun/guides/cross-platform-development/).
- Odin is pre-1.0. Electrobun guarantees the SDK against its pinned Odin release,
  not arbitrary Odin versions. The pinned Apple Silicon compiler requires
  macOS 15 or later to run; applications still target macOS 14.

<Aside type="note">
The TypeScript SDK has the broadest high-level API. Native SDKs mirror the
underlying core contract and may require more explicit lifecycle and callback
management.
</Aside>

=== FILE: guides/project-ownership.mdx ===
---
title: "Project Ownership and the Devkit"
description: "Where Electrobun configuration, SDKs, tasks, and dependencies live."
---
import { Aside } from "@astrojs/starlight/components";

Electrobun keeps workspace orchestration separate from application
configuration. The split is intentional: `hutch.config.ts` owns optional
release pins, tasks, and package-manager policy, while `electrobun.config.ts`
describes the application and build that Hutch produces.

## Responsibility map

| Concern | Owner |
| --- | --- |
| Electrobun release | Exact `hutch.config.ts` → `electrobun.version` in published templates; optional in hand-written projects, which may use an npm or channel default |
| Hutch and optional Cottontail version pins | Optional first-line `// @hutch` pragma; a Cottontail pin does not select the runtime |
| Configuration, script, hook, and build-helper runtime | Bun by default in Hutch 0.30.0-canary.4 or later; `HUTCH_RUNTIME=cottontail` explicitly selects Cottontail |
| Project tasks | `hutch.config.ts` → `scripts` |
| JavaScript package-manager policy | Hutch built-in resolver by default; optional external `hutch.config.ts` → `packageManager` |
| Native toolchain resolution and shared installations | Hutch |
| Native compiler version overrides | `electrobun.config.ts` → `build.<language>.version` |
| App identity and app version | `electrobun.config.ts` → `app` |
| Main-process choice and build inputs | `electrobun.config.ts` → `build` |
| Views, copied assets, signing, updates, and distribution | `electrobun.config.ts` |
| JavaScript dependency graph and lockfile | Hutch (`hutch.lock`) by default, or the explicitly selected external manager |
| Rust and Go dependencies | Cargo and Go modules |
| Electrobun runtime and language SDKs | Core assets on the selected Electrobun GitHub Release, installed and projected by Hutch |

A minimal project makes the boundary visible:

```ts docs=syntax
// hutch.config.ts
export default {
  electrobun: { version: "2.0.6" },
  scripts: {
    install: ["hutch", "install"],
    "build:view": ["hutch", "pm", "exec", "--", "vite", "build"],
    dev: ["hutch", "electrobun", "dev", "--watch"],
    build: ["hutch", "electrobun", "build", "--env=stable"],
  },
};
```

```ts
// electrobun.config.ts
import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "My App",
    identifier: "dev.example.my-app",
    version: "0.1.0",
  },
  build: {
    mainProcess: "bun",
    bun: {
      entrypoint: "src/bun/index.ts",
    },
  },
} satisfies ElectrobunConfig;
```

Published templates include an exact `electrobun.version`, making the selected
runtime and SDK durable in source control. A hand-written project may omit it:
npm-launched commands then use the exact Electrobun version paired with the
installed `electrobun` dependency, while direct Hutch commands float on the
active release channel and reuse the projected version between explicit syncs.
When present, the exact release pin overrides either default.

## Where the SDK comes from

Each platform-specific `electrobun-core-*.tar.gz` archive on the selected
Electrobun GitHub Release contains that platform's runtime, devkit manifest,
JavaScript API, and Zig, Rust, Go, and Odin SDKs. There is no separate SDK npm
package. The single dependency-free `electrobun` package on npm is only a thin
command: it reads `hutch-artifacts.json`, downloads and verifies the host's
paired Hutch archive from that same GitHub Release when needed, and caches the
extracted launcher and engine under
`~/.hutch/npm/electrobun/<electrobun-version>/<platform>/` before invoking it.
That paired-Hutch asset is separate from the core archive and never owns or
supplies the SDK.

When Hutch prepares a project, it verifies and stores the selected platform
archive under `~/.hutch/releases/electrobun`. It then **copies**
the SDK trees into the project as a generated sysroot:

```text
.hutch/devkit/
|-- api/                  # JavaScript/TypeScript SDK source and config types
|-- zig-sdk/
|-- rust-sdk/
|-- go-sdk/
|-- odin-sdk/
|-- package.json          # electrobun/* export map for this release
|-- tsconfig.json         # TypeScript paths into api/
`-- projection.json       # version, platform, and manifest identity
```

All Electrobun SDK imports resolve to this project copy. TypeScript projects
normally extend `.hutch/devkit/tsconfig.json`; native builds point Cargo, Go,
Zig, or Odin at their matching directory under `.hutch/devkit`.

Templates ignore `.hutch/` by default. Hutch owns this generated projection and
may replace it during synchronization. Directly editing SDK files or committing
the projection is not a supported customization or dependency-management
workflow. Do not edit the shared installed release either.

<Aside type="note" title="Installed releases can be reused">
Each Electrobun GitHub Release keeps its published core archives plus the six
paired Hutch mirrors. `electrobun-artifacts.json` indexes the core assets and
`hutch-artifacts.json` indexes the Hutch assets; both bind each archive's
immutable release URL, byte size, and SHA-256 digest. Canonical Hutch and
Cottontail channel artifacts remain on their independent release hosts. Hutch
can reuse an exact release and managed toolchains that are already installed,
including for an offline build, and regenerates the project devkit from that
installation when needed. Anything missing requires a fresh network lookup and
download. Remote manifests and indexes are never persisted, and template
initialization always requires the network. Projects do not need to vendor
`.hutch/devkit`.
</Aside>

## External bundlers

Hutch injects exact aliases for the project devkit into its Electrobun bundles.
An external bundler such as Vite has its own resolver, so use the helper shipped
inside the projected SDK instead of installing `electrobun` as an application
dependency.

Run `hutch electrobun prepare` before Vite loads its config, then install every
project-SDK alias with `electrobunViteAliases()`:

```ts docs=syntax
// vite.config.ts
import { resolve } from "node:path";
import { defineConfig } from "vite";
import { electrobunViteAliases } from "./.hutch/devkit/api/config/electrobun-vite";

export default defineConfig({
  resolve: {
    alias: electrobunViteAliases(resolve(__dirname, ".hutch/devkit")),
  },
});
```

An explicit Hutch task keeps non-advancing preparation and the compatibility
build together:

```ts docs=syntax
// hutch.config.ts (excerpt)
export default {
  scripts: {
    "build:view":
      "hutch electrobun prepare && hutch pm exec -- vite build",
  },
};
```

The helper reads the selected devkit's export map, creates exact aliases for
every `electrobun/*` entry, and rejects targets outside the projected `api`
tree. `node_modules` remains outside the SDK path.

## Default path and compatibility edge

Bun is the default JavaScript main process. Hutch 0.30.0-canary.4 or later also
defaults configuration, scripts, hooks, and build helpers to Bun. Cottontail
remains an experimental, explicit option: `HUTCH_RUNTIME=cottontail` selects it
for Hutch, while `build.mainProcess: "cottontail"` selects it for the application.
A version pin alone does neither. Package-manager selection is independent of
both runtime choices. Node-compatible packages, npm, and Vite
are supported, but none becomes the owner or source of Electrobun's SDK.

=== FILE: guides/quick-start.mdx ===
---
title: "Quick Start"
description: "Create and run an Electrobun 2.x app with Hutch."
---

This page takes you from nothing to a running desktop app. You'll install
Hutch — Electrobun's build and workspace CLI — scaffold a project from a
template, and run it. A couple of minutes, start to finish.

## Install Hutch

On macOS or Linux:

```bash
curl -fsSL https://hutch.blackboard.sh/hutch/install.sh | sh
```

On Windows PowerShell:

```powershell
& ([scriptblock]::Create((irm https://hutch.blackboard.sh/hutch/install.ps1)))
```

Restart the terminal if needed, then check that it's on your path:

```bash
hutch --version
```

That's the only Electrobun-specific global install you need. Hutch handles
scripts, builds, devkits, toolchains, and releases. Its built-in npm-compatible
resolver handles ordinary JavaScript dependencies by default; a project can
explicitly select npm, Bun, pnpm, Yarn, or a custom executable instead. A Rust
or Go project uses Cargo or Go modules. When a project needs a compiler, Hutch
fetches its exact configured version.

## Create a project

```bash
hutch electrobun init
```

This opens an interactive picker: arrow keys to browse templates, Enter to
choose. Hutch downloads the current stable template catalog and creates
the project. Templates range from a minimal hello-world to full app skeletons
with React, Solid, Vue, Svelte, or GPU-rendered UI — the picker is a nice way
to browse what exists.

Already know what you want? Skip the picker:

```bash
hutch electrobun init my-app --template=hello-world
```

For experimental native GPU-rendered interfaces, start with `bun-ui` or
`zig-ui` and follow the [Electrobun UI guide](/electrobun/guides/electrobun-ui/).

Add `--beta` to scaffold from the latest **beta** templates instead of stable:

```bash
hutch electrobun init my-app --beta
```

:::note
`bunx electrobun init` and `npx electrobun init` work too. The npm package is a
single dependency-free bootstrap that downloads and verifies its exact paired
Hutch archive from the same-version Electrobun GitHub Release, caches it, and
forwards every argument. It defaults to stable templates unless you pass
`--beta`; the installed package supplies paired Hutch and Electrobun defaults
unless the project adds an explicit pin. The initializer also ensures a
compatible global Hutch launcher is present, so the generated `hutch run ...`
tasks and the rest of this page work afterward.
:::

## Run the app

```bash
cd my-app
hutch run dev
```

A window should open on your desktop. That's your app.

`init` already ran the template's explicit `install` task after extraction and
devkit preparation. For the default JavaScript templates that task calls
Hutch's built-in resolver; native-only templates do not define it. If you
initialized with `--skip-install`, run `hutch run install` before `dev` when the
selected template provides that task. Initialization requires network access
for the current template catalog and selected template.

The `dev` task builds the app, launches it, and rebuilds when you edit source
files. Hutch resolves both tasks only from `hutch.config.ts`. Its built-in
resolver owns `package.json` dependency resolution and `hutch.lock` unless the
config explicitly selects an external package manager.

The published template's `hutch.config.ts` contains the exact Electrobun
release it was tested and shipped with:

```ts docs=syntax
export default {
  electrobun: {
    version: "2.0.6",
  },
  scripts: {
    install: ["hutch", "install", "--frozen-lockfile"],
    dev: ["hutch", "electrobun", "dev", "--watch"],
  },
};
```

The template publisher guarantees that this pin matches the chosen catalog.
During `init`, Hutch installs that exact core and SDK release under
`~/.hutch/releases/electrobun`, copies its SDKs into the generated project
`.hutch/devkit` sysroot, and resolves any required native compiler under
`~/.hutch/toolchains`. `dev`, `run`, and `build` refresh that preparation
automatically. To upgrade a generated project to the latest stable release, run
`hutch electrobun update` from the app directory. Hutch updates the nearest
parent `hutch.config.ts` exact pin and syncs the app. Hand-written projects may
omit the pin; those use an npm-launched command's paired default or the active
direct-Hutch channel.

A typical project looks like this:

```text
my-app/
|-- src/
|   |-- bun/
|   |   `-- index.ts        # Bun main process
|   `-- mainview/
|       |-- index.html
|       |-- index.css
|       `-- index.ts
|-- electrobun.config.ts
|-- hutch.config.ts
|-- package.json
|-- hutch.lock
`-- tsconfig.json
```

The split under `src/` mirrors how the app actually runs. `src/bun/index.ts`
is the **main process** — it runs on Bun, owns windows and native
state, and is where the privileged side of your app lives. `src/mainview/` is
the **webview UI** — ordinary HTML, CSS, and TypeScript rendered in a native
webview. `hutch.config.ts` owns tasks and any optional release or package-manager
override; `hutch install` resolves `package.json` into `hutch.lock` with Hutch's
built-in resolver unless the config selects an external package manager.
`electrobun.config.ts` tells Hutch how to put the two
processes together into an app bundle. The full split is in
[Project Ownership and the Devkit](/electrobun/guides/project-ownership/).

## Build a release

When you're ready to share it:

```bash
hutch electrobun build --env=canary
hutch electrobun build --env=stable
```

This produces a distributable build — installer, self-extracting wrapper, and
update metadata included — and signs it when signing is configured. Canary and stable are independent
channels, so you can ship prerelease builds to testers without touching your
stable release line.

Hutch builds for the operating system and architecture it's running on, so a
complete cross-platform release means running the build on native CI runners
for each target.

## Next steps

- [Hello World](/electrobun/guides/hello-world/) builds the smallest app from
  scratch, so you see what every file is for.
- [Hutch](/electrobun/guides/hutch/) explains commands, channels, and project
  pins.
- [Project Ownership and the Devkit](/electrobun/guides/project-ownership/)
  explains the config split, generated SDK projection, and external bundlers.
- Bun is the default runtime; [Cottontail](/electrobun/guides/cottontail/) is an experimental alternative.
- [Main Process Runtimes](/electrobun/guides/native-main-process/) covers
  Cottontail, Bun, Zig, Rust, Go, and Odin.
- [Bundling and Distribution](/electrobun/guides/bundling-and-distribution/)
  covers signed release artifacts and updates.

=== FILE: guides/uninstalling.mdx ===
---
title: "Uninstalling"
description: "How Electrobun removes an installed application and its managed data."
---

Electrobun installer builds include an uninstaller that remains available even
when the application bundle cannot start. It is a standalone manager, separate
from the app bundle and runtime: uninstalling never needs to execute your app
or load its dependencies.

## The uninstall prompt

Launching the installed uninstaller interactively shows the same choices on
macOS, Windows, and Linux:

- **Title:** `Uninstall <App>?`
- **Message:** `The application will be removed.`
- **Actions:** `App`, `App and Data`, and `Cancel`

`App` is the default, safe choice. It removes the installed application,
Electrobun's installation/update state, and Electrobun-owned system integration
such as shortcuts, while keeping the user's data. `Cancel` or closing the
prompt leaves the installation unchanged.

Choose `App and Data` to also remove the app's managed per-user directories.
It removes only the directories recorded for this app's packaged identifier
and physical install root:

| Managed directory | API path |
| --- | --- |
| Application data | `Utils.paths.userData` |
| Cache | `Utils.paths.userCache` |
| Logs | `Utils.paths.userLogs` |

Those paths resolve under their platform's normal data, cache, and log roots
as `<base>/<identifier>/<install-root>`:

| Platform | `userData` | `userCache` | `userLogs` |
| --- | --- | --- | --- |
| macOS | `~/Library/Application Support` | `~/Library/Caches` | `~/Library/Logs` |
| Windows | `%LOCALAPPDATA%` | `%LOCALAPPDATA%` | `%LOCALAPPDATA%` |
| Linux | `$XDG_DATA_HOME` | `$XDG_CACHE_HOME` | `$XDG_STATE_HOME` |

On Windows, all three APIs name the same channel root, so `App and Data`
removes that root once. Linux uses `~/.local/share`, `~/.cache`, and
`~/.local/state` when the corresponding XDG variable is unavailable or not a
valid absolute root. The Linux installer records the roots it used so changing
the environment later does not redirect uninstall cleanup.

The install-root name normally matches the app's release channel. A supported
Electrobun v1 install keeps its existing physical root after updating to 2.x.
The uninstaller follows that recorded root so the migrated app and its data
remain one installation.

Other applications, other identifiers, and separately installed channel roots
are never removed. See [Paths](/electrobun/apis/paths/) for the path API and
layout.

Electrobun records the managed-root policy with the installation so a newer
runtime can continue to clean up earlier Electrobun-managed locations if that
policy changes in a future release. It does not scan arbitrary files or run
application configuration during uninstall.

## Launching an uninstall

The installed standalone manager is the reliable entry point. As a convenience,
an installed application may also be launched with `--uninstall`; the launcher
hands that request to the standalone manager before starting the application.

The manager is installed at:

| Platform | Location |
| --- | --- |
| macOS | `~/Library/Application Support/<identifier>/<install-root>/uninstall` |
| Windows | `%LOCALAPPDATA%\<identifier>\<install-root>\uninstall.exe` |
| Linux | `$XDG_DATA_HOME/<identifier>/<install-root>/uninstall` |

The Linux location falls back to
`~/.local/share/<identifier>/<install-root>/uninstall`. The manager is tied to
that installation and should not be moved or copied elsewhere.

For non-interactive automation, use:

```bash
# Remove the application and Electrobun installation state; preserve data.
<uninstaller> --quiet

# Also remove this identifier and channel's managed data, cache, and logs.
<uninstaller> --quiet --delete-data
```

`--quiet` intentionally has the same conservative meaning as selecting
`App`. Automated jobs must opt in to data deletion with `--delete-data`, which
is only accepted after `--quiet`. Unknown, reordered, duplicate, or incomplete
uninstall arguments are rejected before cleanup begins.

## Platform integration

The unified standalone manager, interactive choices, and quiet flags are
available in macOS, Windows, and Linux installer builds.

On Windows, Electrobun registers each identifier and release channel separately
in Windows Installed Apps. Choosing Uninstall there opens the same native Task
Dialog. The registered quiet uninstall action uses the conservative `App`
behavior and preserves user data. Migrated apps retain their validated
physical install root in the registration metadata.

On Linux, Electrobun uses KDialog first on KDE/Plasma and Zenity first on other
desktops, then tries the other graphical helper if necessary. If neither helper
works, it offers the same choices in an attached terminal. With neither a
working graphical helper nor a terminal, interactive uninstall exits without
changing anything and asks for an explicit `--quiet` invocation.

Package-managed distributions, such as Flatpak, should be removed through
their package manager rather than Electrobun's standalone installer manager.

## Application cleanup

There is no `electrobun.config.ts` setting for arbitrary uninstall paths.
Electrobun deliberately limits cleanup to its app-scoped managed directories,
which keeps an uninstall from deleting unrelated user files. Store removable
application data under `Utils.paths.userData`, `Utils.paths.userCache`, or
`Utils.paths.userLogs`; users can then choose whether that data is removed.

If your application writes data elsewhere, document its removal separately for
your users. Support for additional declarative cleanup locations is deferred;
it will be constrained to paths beneath Electrobun-managed app roots.

=== FILE: guides/updates.mdx ===
---
title: "Updates"
description: "Publish update artifacts and automate cross-platform releases."
---

Shipping updates in Electrobun doesn't require an update server — updates are
just static files. Hutch creates the update metadata, checksum sidecar,
compressed full bundle, and an optional delta patch at build time; the
application-side `Updater` checks, downloads, and installs them. Anything that
serves files over HTTPS works as the host: R2, S3, GitHub Releases, or a plain
static server.

This page covers the publishing side — where artifacts go and how to automate
building them for every platform. The application-side API lives in the
[Updater](/electrobun/apis/updater/) reference.

## Configure The Release Host

### Electrobun Managed Deploys preview

[Electrobun Managed Deploys](/electrobun/guides/managed-deploys/) stages each
runner's ordinary artifacts and lets you review and publish a release through
Dash. Upload discovers the version, channel, and platforms; a separate publish
step selects the release for prerelease installs or the public audience.
The client keeps the same flat update filenames and patch-chain behavior.

### Use a custom managed domain

Managed hosting includes an app-scoped URL automatically. For your own
hostname, see [custom domains](/electrobun/guides/managed-deploys/#custom-domains)
for app binding, DNS verification, HTTPS, and configuration.

### Electrobun Insights preview

[Electrobun Insights](/electrobun/guides/insights/) is an independent, optional
analytics service. It is off by default and uses a separate endpoint from
update checks. You can use it with managed hosting, static hosting, or direct
updates disabled. See its [SDK API](/electrobun/apis/insights/) for lifecycle
collection, custom events, and opt-in controls.

### Static release hosting

Point `release.baseUrl` at the directory where every target's artifacts will
be uploaded. Use an HTTPS URL without credentials, query parameters, or a
fragment:

```typescript
import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "My App",
    identifier: "com.example.my-app",
    version: "2.0.0",
  },
  release: {
    baseUrl: "https://downloads.example.com/my-app",
  },
} satisfies ElectrobunConfig;
```

For local packaged-update tests, HTTP is also accepted on `localhost`,
`127.0.0.1`, or `[::1]`. Remote and LAN HTTP hosts are not supported by the
2.0.6 preparation helper. Artifact redirects cannot downgrade HTTPS to HTTP;
redirects that stay on HTTP must keep the same loopback host and port.

A stable macOS ARM64 build checks `stable-macos-arm64-update.json`; a
canary Windows x64 build checks `canary-win-x64-update.json`. Hutch emits one
release manifest per target, preserving its original `schemaVersion: 1` shape
with an `artifact` object containing only `file`. Older native updaters reject
unknown fields, so archive integrity metadata lives in a separate
`<channel>-<os>-<arch>-checksum.json` file.

The sidecar contains `hash`, matching the manifest's build hash, plus
`tarSha256` and `tarSize`: the SHA-256 and byte size of the exact uncompressed
tar, including its signed/stapled files, headers, and padding. Its fixed filename
means another build for the same channel and target replaces the checksum
alongside the full download and `update.json`; only patch history needs to grow.

The updater validates the release manifest before requesting this sidecar and
checks that their build hashes match. If publication changes the metadata
between requests, it retries the metadata check; a persistent mismatch fails
the check. A `404` at the fixed filename falls back to the older
`<channel>-<os>-<arch>-<hash>-checksum.json` filename. If both are missing,
older hosting behavior is preserved. Other request failures or invalid checksum
data fail the check rather than dropping integrity validation. Previously
published manifests with a valid inline `artifact.tarSha256` and
`artifact.tarSize` pair remain supported by newer clients.

Upload all of `artifacts/` without renaming its files, including the checksum
sidecar. Publish each `*-update.json` after its full bundle, checksum, and patches
are available.

### Remove old hash-named checksum files

After publishing the fixed checksum filename for each channel and target on a
self-hosted release folder, you can remove its old
`<channel>-<os>-<arch>-<hash>-checksum.json` files. This is a one-time cleanup;
later uploads replace the fixed checksum file. Hutch does not delete those
remote objects for you. Keep `*-checksum.json` files without a build hash in
their names, current manifests and full downloads, and retained patches.

Earlier updater betas only request the hash-named checksum. If that URL returns
`404`, they still update using the existing behavior, without the optional tar
SHA-256 check. The current updater understands both filenames. Managed Deploys
also serves the old checksum URL for an eligible retained build, so old clients
can read its checksum without storing a second file. Retained managed releases
keep their own checksum alongside their other artifacts.

### Remove previously published v2 manifests

If you previously uploaded `*-update-v2.json` files, publish the new full
bundles, patches, checksum sidecars, and compatible canonical `*-update.json`
manifests first. Then delete the old `<channel>-<os>-<arch>-update-v2.json`
objects from your update host and purge any cached copies. Keep the current
`*-update.json`, its checksum sidecar,
archives, and retained patches.

The removed URLs must return HTTP `404`. Previously released updaters that
check v2 first can then fall back to `update.json`; the current updater uses
`update.json` and the optional checksum sidecar. Merely stopping v2 uploads
leaves stale objects on hosts such as R2, which can prevent those existing
clients from discovering new releases.

The metadata names the exact `.tar.zst` artifact. When Hutch can reach the
previous release it also creates a patch named after that release's bundle
hash. The updater reconstructs the current release's tar in RAM from the
installed files and a small archive recipe, preserving its original headers,
entry order, and padding byte for byte. It applies
`<channel>-<os>-<arch>-<current-hash>.patch` and streams the result into a staged
application. It reads the next hash from that stage and follows the chain until
it reaches the manifest's target hash.
A missing or failed edge discards the attempted chain and downloads the latest
full archive instead. Hosts should retain old hash-named patches and return a
normal `404` for unavailable ones.

New installations retain `<hash>.recipe.json` instead of a complete tar. An
existing retained tar can be converted into a recipe after its reconstruction
has been verified. Missing or modified source files trigger full-download
fallback. Both delta output and full downloads stream into the staging
directory without writing another complete tar. The installed app stays in
place until the prepared replacement is activated; see
[Updater disk space](/electrobun/apis/updater/#disk-space-during-preparation).
Linux builds use USTAR for compatibility with installed update extractors;
packaging fails if an archive path cannot be represented in that format.

The bundle hash is a release-routing identifier. The checksum sidecar's tar
digest checks the exact payload; it is not a signature of the release metadata.
Serve updates over HTTPS and sign distributed
applications with the platform's normal code-signing system when authenticity
is required.

## Upgrading to the 2.0.6 updater

Archive recipes and streamed update preparation are available in Electrobun
2.0.6 on macOS, Windows, and Linux. Build your next app release with Electrobun
2.0.6 or later and its paired Hutch version, keeping the app identity unchanged.
Continue publishing at the URL embedded in existing installations so those
clients can discover the release.

If existing clients use a remote HTTP host, publish a bridge release at that
host with an HTTPS `release.baseUrl` embedded in the new app. Keep the old host
available for those clients while publishing subsequent releases at the HTTPS
host. Simply redirecting an HTTP base URL to HTTPS does not satisfy the new
helper's base-URL validation.

The update into that release is performed by the updater already installed on
the user's machine. The new preparation flow takes effect when the upgraded
app downloads a subsequent update. Fresh installations start with an archive
recipe; installations upgraded from a release that retained a tar can migrate
that tar during their next update preparation. Test both the first upgrade and
a subsequent update from the upgraded app.

The identity fields used by Electrobun 1.x (`version`, `hash`, `platform`, and
`arch`) remain at the top level, and `stable` remains the main release channel.
That lets Electrobun v1.18.1 and later consume a 2.0 release directly. For the
bridge release, keep `app.name` and `app.identifier`
unchanged and publish it at the `release.baseUrl` embedded in the installed 1.x
app. Older prereleases used updater or payload layouts that are not universally
bridgeable; install the 2.0 release normally for those users.

On its first 2.0 launch, an app delivered by the v1 updater creates the new
update/uninstall manager metadata in its existing `stable` root. Its user data,
browser profiles, update state, and future update URLs therefore stay on the
same channel without a translation layer or reinstall.

## Release Tags

Use an application prefix so unrelated repository tags do not trigger a
deployment:

```text
my-app/v2.0.0-canary.1
my-app/v2.0.0
```

These are independent releases. A stable artifact is built from its own tag;
a canary artifact is never promoted into stable. Keep the version in
`electrobun.config.ts` aligned with the tag.

## GitHub Actions Matrix

This workflow builds all supported targets first, then creates one GitHub
Release only after every build succeeds:

```yaml
name: Release My App

on:
  push:
    tags:
      - "my-app/v*"

permissions:
  contents: read

jobs:
  build:
    strategy:
      fail-fast: false
      matrix:
        include:
          - runner: macos-26
            target: macos-arm64
          - runner: macos-15-intel
            target: macos-x64
          - runner: ubuntu-24.04
            target: linux-x64
          - runner: ubuntu-24.04-arm
            target: linux-arm64
          - runner: windows-2025
            target: win-x64
          - runner: windows-11-arm
            target: win-arm64
    runs-on: ${{ matrix.runner }}
    steps:
      - uses: actions/checkout@v6

      - name: Install Hutch on macOS or Linux
        if: runner.os != 'Windows'
        shell: bash
        run: |
          installer="$RUNNER_TEMP/install-hutch.sh"
          curl --proto '=https' --tlsv1.2 --fail --silent --show-error --location \
            https://hutch.blackboard.sh/hutch/install.sh --output "$installer"
          sh "$installer" --channel production --no-modify-path
          echo "$HOME/.hutch/bin" >> "$GITHUB_PATH"

      - name: Install Hutch on Windows
        if: runner.os == 'Windows'
        shell: pwsh
        run: |
          $script = irm https://hutch.blackboard.sh/hutch/install.ps1
          & ([scriptblock]::Create($script)) -Channel production
          "$HOME\.hutch\bin" | Out-File $env:GITHUB_PATH -Encoding utf8 -Append

      - name: Select release channel
        id: channel
        shell: bash
        run: |
          if [[ "${{ github.ref_name }}" == *"-canary."* ]]; then
            echo "value=canary" >> "$GITHUB_OUTPUT"
          else
            echo "value=stable" >> "$GITHUB_OUTPUT"
          fi

      - name: Install dependencies
        run: npm ci

      - name: Build release
        env:
          ELECTROBUN_DEVELOPER_ID: ${{ secrets.ELECTROBUN_DEVELOPER_ID }}
          ELECTROBUN_APPLEID: ${{ secrets.ELECTROBUN_APPLEID }}
          ELECTROBUN_APPLEIDPASS: ${{ secrets.ELECTROBUN_APPLEIDPASS }}
          ELECTROBUN_TEAMID: ${{ secrets.ELECTROBUN_TEAMID }}
        run: hutch electrobun build --env=${{ steps.channel.outputs.value }}

      - name: Stage target artifacts
        uses: actions/upload-artifact@v6
        with:
          name: release-${{ matrix.target }}
          path: artifacts/*
          if-no-files-found: error

  publish:
    needs: build
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - name: Collect target artifacts
        uses: actions/download-artifact@v7
        with:
          pattern: release-*
          path: release-artifacts
          merge-multiple: true

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          files: release-artifacts/*
          generate_release_notes: true
          prerelease: ${{ contains(github.ref_name, '-canary.') }}
```

The macOS job needs the signing and notarization secrets only when the config
enables those features. See [Code Signing](/electrobun/guides/code-signing/)
for their values.

## GitHub Releases As The Host

For stable-only updates, `release.baseUrl` can use GitHub's latest release
redirect:

```typescript
import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "My App",
    identifier: "com.example.my-app",
    version: "2.0.0",
  },
  release: {
    baseUrl: "https://github.com/YOUR_ORG/YOUR_REPO/releases/latest/download",
  },
} satisfies ElectrobunConfig;
```

GitHub excludes prereleases from `/releases/latest`, so that URL cannot track
canary builds. Use a static host with a stable base URL when canary clients
must update automatically.

See [Updater](/electrobun/apis/updater/) for the application-side API and
[Bundling and Distribution](/electrobun/guides/bundling-and-distribution/) for
the complete artifact names.

=== FILE: guides/what-is-electrobun.mdx ===
---
title: "What is Electrobun?"
description: "A compact cross-platform desktop framework built around native views and a small runtime."
---

Electrobun is a framework for building desktop apps for macOS, Windows, and
Linux. You write your UI with HTML, CSS, and TypeScript — the same way you'd
build for the web — and Electrobun gives you the native side: real windows,
menus, trays, auto-updates, WebGPU surfaces, and platform integration.

The trade most desktop web frameworks make is size and speed: they ship a full
copy of Chromium and Node with every app. Electrobun doesn't. By default your
app renders with the webview already on the user's machine and runs its main
process on Bun. Chromium can be bundled when an application needs it.
Cottontail is an experimental alternative main-process runtime.

## The 2.x stack

Electrobun 2.x is a few focused pieces, each doing one job:

- **Hutch** is the build and workspace CLI. It runs project-defined scripts,
  bundles code, synchronizes Electrobun devkits, downloads pinned toolchains,
  and produces distributable builds, signed when signing is configured. Its built-in npm-compatible resolver
  handles JavaScript dependencies by default; projects may explicitly select
  npm, Bun, pnpm, or Yarn instead. Cargo, Go modules, and other language package
  managers remain authoritative for their ecosystems.
- **Bun** is the default main-process runtime for JavaScript and TypeScript,
  and the default runner for Hutch scripts and tests.
- **Cottontail** is an experimental, opt-in runtime built with Zig on
  JavaScriptCore. It provides Node.js and Bun-compatible APIs.
- **Electrobun Core** is the native layer: cross-platform windows, views, RPC,
  menus, trays, updates, and OS integration.
- **System webviews** render your UI by default — WKWebView on macOS, WebView2
  on Windows, WebKitGTK on Linux. They're already installed and kept updated
  by the OS, which is why your app stays small.
- **CEF** is an optional pinned Chromium renderer, for apps that want the same
  browser engine everywhere more than they want a small download.

You're not locked into TypeScript for the main process, either. Swap in Bun,
Zig, Rust, Go, or Odin and keep the same Hutch build and packaging workflow.

## Why Electrobun

- Build your UI in TypeScript with whatever web framework you already use.
- Keep privileged native APIs out of page JavaScript — the main process owns
  them, and your UI talks to it over typed RPC.
- Ship native windows and platform APIs without bundling Chromium by default.
- Embed independent `<electrobun-webview>` and `<electrobun-wgpu>` surfaces
  right in your HTML layout, like any other element.
- Distribute self-extracting Zstandard-compressed installers.
- Ship integrity-checked updates from static storage, with transactional app
  replacement and rollback on every desktop platform.
- Run stable and canary channels side by side, built independently.

## Process model

The main process owns application state and native objects. Each browser view
runs isolated from it and communicates through Electrobun's RPC and event
bridges. You get the convenience of web UI without handing privileged
main-process APIs to page JavaScript — a compromised or buggy view can't reach
what it was never given.

## Distribution model

When you build for release, Hutch produces everything distribution needs in
one pass: the runnable app, a small self-extracting wrapper around it, update
metadata, a compressed full-update archive, and platform installer artifacts.
When configured, code signing and notarization are part of the release build,
not a separate chore. Host the artifacts on any static storage — R2, S3, GitHub Releases —
and the built-in updater takes it from there.

## Start building

Install Hutch and pick a template:

```bash
curl -fsSL https://hutch.blackboard.sh/hutch/install.sh | sh
hutch electrobun init
```

If you don't have Hutch yet, the single dependency-free npm package downloads
and verifies its exact paired Hutch archive from the same-version Electrobun
GitHub Release, caches it, and forwards all arguments. It defaults to stable
templates; pass `--beta` explicitly for the beta catalog. The package contains
no core or SDK and supplies paired Hutch and Electrobun defaults; init also
ensures a compatible global launcher for the generated project's `hutch` tasks.
Published templates include their exact Electrobun release pin. In a
hand-written project the pin is optional and, when present, overrides those
defaults:

```bash
npx electrobun init
# or
bunx electrobun init
```

From here, the [Quick Start](/electrobun/guides/quick-start/) gets a template
running in a couple of minutes, or [Hello World](/electrobun/guides/hello-world/)
builds the smallest possible app from scratch so you can see every moving part.

=== FILE: index.mdx ===
---
title: "Electrobun"
description: "Build ultra fast, tiny, cross-platform desktop apps with TypeScript."
template: splash
hero:
  tagline: "Everything you need to build ultra fast, tiny, cross-platform desktop applications with TypeScript."
  actions:
    - text: "Quick Start"
      link: "/electrobun/guides/quick-start/"
      icon: right-arrow
      variant: primary
    - text: "View on GitHub"
      link: "https://github.com/blackboardsh/electrobun"
      icon: external
      variant: minimal
---
import { Card, CardGrid, LinkCard, Tabs, TabItem } from "@astrojs/starlight/components";

## Get started

Install Hutch:

<Tabs syncKey="hutch-install">
  <TabItem label="macOS / Linux">

```bash
curl -fsSL https://hutch.blackboard.sh/hutch/install.sh | sh
```

  </TabItem>
  <TabItem label="Windows PowerShell">

```powershell
& ([scriptblock]::Create((irm https://hutch.blackboard.sh/hutch/install.ps1)))
```

  </TabItem>
</Tabs>

Then open the template picker. Restart your terminal first if `hutch` isn't found.

```bash
hutch electrobun init
```

Already use Bun or npm? You can start with either command instead:

<Tabs syncKey="electrobun-init">
  <TabItem label="Bun">

```bash
bunx electrobun init
```

  </TabItem>
  <TabItem label="npm">

```bash
npx electrobun init
```

  </TabItem>
</Tabs>

Choose a template, then follow the [Quick Start](/electrobun/guides/quick-start/#run-the-app)
to run your app.

## A window in TypeScript

```typescript
import { BrowserWindow } from "electrobun/main";

const win = new BrowserWindow({
  title: "My App",
  url: "views://mainview/index.html",
});
```

## Why Electrobun

<CardGrid>
  <Card title="Tiny and fast" icon="rocket">
    System webviews keep app bundles small. Add CEF when you want to ship
    a pinned Chromium browser engine.
  </Card>
  <Card title="One build tool" icon="setting">
    Hutch handles scripts, devkits, bundling, pinned toolchains, signing, and
    releases. Its built-in resolver handles JavaScript dependencies by default;
    external package managers remain an explicit option.
  </Card>
  <Card title="TypeScript first, native when you want it" icon="seti:typescript">
    Write your main process in TypeScript on Bun — or choose Cottontail,
    Zig, Rust, Go, or Odin and keep the same workflow.
  </Card>
  <Card title="Native bindings" icon="laptop">
    Windows, menus, trays, dialogs, and GPU surfaces implemented in C++,
    Objective-C, and Zig across macOS, Windows, and Linux.
  </Card>
  <Card title="Built-in updates" icon="download">
    Verified updates served from static storage, with transactional replacement
    and rollback across Windows, macOS, and Linux.
  </Card>
  <Card title="Independent channels" icon="approve-check">
    Build stable and canary releases side by side, each with its own
    installers and update line.
  </Card>
</CardGrid>

## Start here

<CardGrid>
  <LinkCard
    title="Quick Start"
    description="Install Hutch, scaffold a template, and run your first app in minutes."
    href="/electrobun/guides/quick-start/"
  />
  <LinkCard
    title="What is Electrobun?"
    description="The framework, the 2.x stack, and why it's shaped this way."
    href="/electrobun/guides/what-is-electrobun/"
  />
  <LinkCard
    title="Hello World"
    description="Build the smallest possible app from scratch and see what every file is for."
    href="/electrobun/guides/hello-world/"
  />
  <LinkCard
    title="Migrate to 2.x"
    description="Update an existing app to Electrobun 2.x and Hutch."
    href="/electrobun/guides/migrating-to-v2/"
  />
</CardGrid>

## Go deeper

<CardGrid>
  <LinkCard
    title="Hutch"
    description="Scripts, devkit sync, builds, toolchains, channels, and project pins."
    href="/electrobun/guides/hutch/"
  />
  <LinkCard
    title="Cottontail"
    description="An experimental JavaScriptCore-based runtime for TypeScript apps."
    href="/electrobun/guides/cottontail/"
  />
  <LinkCard
    title="Main Process Runtimes"
    description="Cottontail, Bun, Zig, Rust, Go, and Odin — and how to choose."
    href="/electrobun/guides/native-main-process/"
  />
  <LinkCard
    title="Creating UI"
    description="Host pages, the webview tag, and embedding isolated content."
    href="/electrobun/guides/creating-ui/"
  />
  <LinkCard
    title="Architecture Overview"
    description="How Hutch, runtimes, Electrobun Core, and webviews fit together."
    href="/electrobun/guides/architecture/overview/"
  />
  <LinkCard
    title="Bundling & Distribution"
    description="Installers, update archives, delta patches, and release hosting."
    href="/electrobun/guides/bundling-and-distribution/"
  />
</CardGrid>

## Community & support

Electrobun is open source and built in the open.

- [GitHub repository](https://github.com/blackboardsh/electrobun) — source,
  issues, and releases.
- [Discord](https://discord.gg/ueKE4tjaCE) — questions, feedback, and show
  and tell.
