// Electrobun preBuild hook: produce the self-contained web UI and the bundled
// stdio MCP launcher that get copied into the desktop bundle.
// Hutch runs hooks with the pinned Bun binary.
import { copyFileSync } from 'node:fs';
const web = Bun.spawnSync(['bun', 'run', 'build:web'], {
  cwd: process.cwd(),
  stdout: 'inherit',
  stderr: 'inherit',
});
if (web.exitCode !== 0) process.exit(web.exitCode ?? 1);

const mcp = await Bun.build({
  entrypoints: ['src/mcp/stdio.ts'],
  outdir: 'dist/mcp',
  target: 'bun',
  format: 'esm',
  sourcemap: 'none',
});
if (!mcp.success) {
  for (const log of mcp.logs) console.error(log);
  process.exit(1);
}
// store/index.ts reads schema.sql relative to the bundled script's URL.
copyFileSync('src/boxes/store/schema.sql', 'dist/mcp/schema.sql');
console.log('[preBuild] dist/mcp/stdio.js ready');
