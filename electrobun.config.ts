import type { ElectrobunConfig } from "electrobun";

export default {
  scripts: {
    preBuild: "./scripts/electrobun-pre-build.ts",
  },
  app: {
    name: "ministudyui",
    identifier: "local.ministudyui.desktop",
    version: "0.1.0",
  },
  build: {
    mainProcess: "bun",
    bun: {
      entrypoint: "desktop/main.ts",
    },
    views: {
      mainview: {
        entrypoint: "desktop/views/mainview/index.ts",
      },
    },
    copy: {
      "desktop/views/mainview/index.html": "views/mainview/index.html",
      // store/index.ts reads schema.sql relative to the bundled main.js.
      "src/boxes/store/schema.sql": "bun/schema.sql",
      // Self-contained web UI (TS + vendor deps bundled, no node_modules).
      "dist/web": "dist/web",
    },
    mac: { bundleCEF: false },
    linux: { bundleCEF: false },
    win: { bundleCEF: false },
  },
} satisfies ElectrobunConfig;
