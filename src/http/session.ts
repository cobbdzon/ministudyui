// In-memory web sessions. Unwrapped keys exist only here and never on disk;
// a server restart logs everyone out. Sliding idle TTL.
import type { Database } from 'bun:sqlite';
import type { UserKeys } from '../boxes/scope/index.js';
import * as vault from '../boxes/vault/index.js';
import * as userdb from '../boxes/userdb/index.js';

export interface Session {
  id: string;
  userId: number;
  username: string;
  isAdmin: boolean;
  keys: UserKeys;
  db: Database;
  lastUsed: number;
}

const sessions = new Map<string, Session>();

export function create(info: {
  userId: number; username: string; isAdmin: boolean; keys: UserKeys; db: Database;
}): string {
  const id = Buffer.from(vault.randomBytes(32)).toString('hex');
  sessions.set(id, { id, ...info, lastUsed: Date.now() });
  return id;
}

export function get(id: string | undefined, ttlMinutes: number): Session | null {
  if (!id) return null;
  const s = sessions.get(id);
  if (!s) return null;
  const ttl = ttlMinutes * 60_000;
  if (Date.now() - s.lastUsed > ttl) { destroy(id); return null; }
  s.lastUsed = Date.now();
  return s;
}

export function destroy(id: string): void {
  const s = sessions.get(id);
  if (!s) return;
  sessions.delete(id);
  vault.zero(s.keys.enc); vault.zero(s.keys.idx);
  userdb.release(s.userId);
}

export function destroyAllForUser(userId: number): void {
  for (const [id, s] of [...sessions]) if (s.userId === userId) destroy(id);
}

export function clear(): void { for (const id of [...sessions.keys()]) destroy(id); }

export function count(): number { return sessions.size; }
