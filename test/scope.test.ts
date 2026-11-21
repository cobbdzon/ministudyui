import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Database } from 'bun:sqlite';
import * as store from '../src/boxes/store/index.js';
import * as scope from '../src/boxes/scope/index.js';
import * as userdb from '../src/boxes/userdb/index.js';
import * as changefeed from '../src/boxes/changefeed/index.js';
import { AppError } from '../src/boxes/errors.js';
import { dataDir, userDbPath, authDbPath, ensureDataDir } from '../src/boxes/paths.js';

const TMP_BASE = '/tmp/opencode';
let tmp = '';
let savedDataDir: string | undefined;

beforeEach(() => {
  tmp = mkdtempSync(join(TMP_BASE, 'ms-scope-'));
  savedDataDir = process.env.DATA_DIR;
  process.env.DATA_DIR = tmp;
  store.close();
  store.open(':memory:');
  store.migrate();
});

afterEach(() => {
  userdb.closeAll();
  store.close();
  if (savedDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = savedDataDir;
  rmSync(tmp, { recursive: true, force: true });
});

describe('scope', () => {
  test('current() uses the explicit scope over the fallback', () => {
    const outer = scope.current();
    const other = new Database(':memory:');
    scope.run({ userId: 99, db: other, keys: scope.devKeys() }, () => {
      expect(scope.current().userId).toBe(99);
      expect(scope.current().db).toBe(other);
      store.run('CREATE TABLE t (x INTEGER)');
      store.run('INSERT INTO t VALUES (7)');
    });
    expect(scope.current()).toBe(outer);
    expect(scope.current().userId).toBe(1);
    other.close();
  });

  test('unscoped SQL throws UNAUTHENTICATED (fail closed)', () => {
    const db = scope.current().db;
    scope.clearTestFallback();
    try {
      expect(() => store.get('SELECT 1 AS n')).toThrow(AppError);
      try { store.get('SELECT 1 AS n'); } catch (e) {
        expect((e as AppError).code).toBe('UNAUTHENTICATED');
      }
      expect(() => scope.current()).toThrow(/Authentication required/);
    } finally {
      scope.installTestFallback(scope.devContext(db));
    }
  });

  test('interleaved scopes never cross DBs or ids', () => {
    const a = new Database(':memory:');
    const b = new Database(':memory:');
    for (const d of [a, b]) { d.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)'); }
    scope.run({ userId: 10, db: a, keys: scope.devKeys() }, () =>
      store.run('INSERT INTO t VALUES (1, ?)', ['alice']));
    scope.run({ userId: 20, db: b, keys: scope.devKeys() }, () =>
      store.run('INSERT INTO t VALUES (1, ?)', ['bob']));
    const seen: string[] = [];
    scope.run({ userId: 10, db: a, keys: scope.devKeys() }, () => {
      seen.push(store.get<{ v: string }>('SELECT v FROM t WHERE id=1')!.v);
    });
    scope.run({ userId: 20, db: b, keys: scope.devKeys() }, () => {
      seen.push(store.get<{ v: string }>('SELECT v FROM t WHERE id=1')!.v);
    });
    expect(seen).toEqual(['alice', 'bob']);
    a.close(); b.close();
  });

  test('changefeed subscription keeps its capture scope across timer ticks', async () => {
    const ctx = scope.current();
    let called = false;
    const unsub = changefeed.subscribe(() => {
      called = true;
      // With the fallback removed, this can only work via scope re-entry.
      expect(scope.current()).toBe(ctx);
    });
    try {
      scope.clearTestFallback();
      ctx.db.prepare('INSERT INTO changes(entity, entity_id, op) VALUES (?, ?, ?)')
        .run('deck', 1, 'insert');
      await new Promise((r) => setTimeout(r, 1200));
      expect(called).toBe(true);
    } finally {
      unsub();
      scope.installTestFallback(ctx);
    }
  });
});

describe('paths + userdb registry', () => {
  test('DATA_DIR drives all filesystem paths', () => {
    expect(dataDir()).toBe(tmp);
    expect(authDbPath()).toBe(join(tmp, 'auth.db'));
    expect(userDbPath(42)).toBe(join(tmp, 'users', '42.db'));
    ensureDataDir();
    expect(existsSync(join(tmp, 'users'))).toBe(true);
  });

  test('opens one migrated DB per user with standard pragmas', () => {
    const dbA = userdb.open(1);
    const dbB = userdb.open(2);
    expect(dbA).not.toBe(dbB);
    for (const db of [dbA, dbB]) {
      expect((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(6);
      expect((db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number }).foreign_keys).toBe(1);
      expect(existsSync(userDbPath(1)) || existsSync(userDbPath(2))).toBe(true);
    }
    userdb.release(1); userdb.release(2);
  });

  test('LRU evicts only unlocked handles; leases prevent eviction', () => {
    process.env.MAX_OPEN_USER_DBS = '2';
    const first = userdb.open(1);
    userdb.release(1);
    const second = userdb.open(2);
    userdb.release(2);
    expect(userdb.openCount()).toBe(2);
    // Lease user 2 so it cannot be evicted; opening 3 must evict user 1 only.
    userdb.open(2);
    const third = userdb.open(3);
    expect(userdb.openCount()).toBe(2);
    expect(() => first.prepare('SELECT 1').get()).toThrow(); // closed by eviction
    expect(() => second.prepare('SELECT 1').get()).not.toThrow();
    expect(() => third.prepare('SELECT 1').get()).not.toThrow();
    userdb.release(2); userdb.release(3);
    delete process.env.MAX_OPEN_USER_DBS;
  });
});
