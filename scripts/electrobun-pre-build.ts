// Electrobun preBuild hook: produce the self-contained web UI that gets
// copied into the desktop bundle. Hutch runs hooks with the pinned Bun binary.
const result = Bun.spawnSync(['bun', 'run', 'build:web'], {
  cwd: process.cwd(),
  stdout: 'inherit',
  stderr: 'inherit',
});
if (result.exitCode !== 0) process.exit(result.exitCode ?? 1);
