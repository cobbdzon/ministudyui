// All filesystem locations derive from DATA_DIR. No env file is loaded; these
// are real environment variables. The default resolves from the source file so
// it is independent of cwd, matching the old DB_PATH default behaviour.
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function dataDir(): string {
  return process.env.DATA_DIR ? resolve(process.env.DATA_DIR) : join(REPO_ROOT, 'data');
}

export function authDbPath(): string {
  return join(dataDir(), 'auth.db');
}

export function userDbPath(userId: number | string): string {
  return join(dataDir(), 'users', `${userId}.db`);
}

export function ensureDataDir(): void {
  mkdirSync(join(dataDir(), 'users'), { recursive: true });
}
