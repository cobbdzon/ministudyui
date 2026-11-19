import type { ElectrobunConfig } from "electrobun";

export default {
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
    },
    mac: { bundleCEF: false },
    linux: { bundleCEF: false },
    win: { bundleCEF: false },
  },
} satisfies ElectrobunConfig;
