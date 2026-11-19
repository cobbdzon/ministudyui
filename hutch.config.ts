// @hutch cli=0.29.0 cottontail=0.7.3
export default {
  // This repo is Bun-managed; keep hutch install/pm delegating to Bun.
  packageManager: "bun",
  scripts: {
    install: ["hutch", "pm", "install", "--frozen-lockfile"],
    start: ["hutch", "electrobun", "dev"],
    dev: ["hutch", "electrobun", "dev", "--watch"],
    build: ["hutch", "electrobun", "build", "--env=stable"],
  },
  electrobun: {
    version: "2.0.6",
  },
};
