import { AsyncLocalStorage } from 'node:async_hooks';
import type { Database } from 'bun:sqlite';
import { AppError } from '../errors.js';

export interface UserKeys {
  /** AES-256-GCM content key, derived from the user's DEK. */
  enc: Uint8Array;
  /** HMAC-SHA256 blind-index key, derived from the user's DEK. */
  idx: Uint8Array;
}

export interface UserContext {
  userId: number;
  db: Database;
  keys: UserKeys;
}

const storage = new AsyncLocalStorage<UserContext>();

// Process-wide fallback used ONLY by tests (store.open(':memory:') installs it)
// and by temporary legacy bootstrap call sites that Phase 6/7 remove. Production
// request paths must always establish a scope explicitly; unscoped access throws.
let fallback: UserContext | null = null;

export function run<T>(ctx: UserContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function scoped(): UserContext | undefined {
  return storage.getStore();
}

export function current(): UserContext {
  const ctx = storage.getStore() ?? fallback;
  if (!ctx) throw new AppError('UNAUTHENTICATED', 'Authentication required');
  return ctx;
}

export function installTestFallback(ctx: UserContext): void {
  fallback = ctx;
}

export function clearTestFallback(): void {
  fallback = null;
}

/** Fixed, clearly non-secret keys for in-memory tests and legacy bootstrap only. */
export function devKeys(): UserKeys {
  return { enc: new Uint8Array(32).fill(0xa1), idx: new Uint8Array(32).fill(0xb2) };
}

/** Temporary bootstrap for the legacy scripts/stdio entry points. */
export function devContext(db: Database, userId = 1): UserContext {
  return { userId, db, keys: devKeys() };
}
