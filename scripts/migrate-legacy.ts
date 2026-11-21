// One-time migration of a v5 (pre-multiuser) DB into a user's encrypted DB.
// The legacy file is opened READ-ONLY and never modified or deleted.
import { Database, type SQLQueryBindings } from 'bun:sqlite';
import {
  copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readSync, rmSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import * as auth from '../src/boxes/auth/index.js';
import * as scope from '../src/boxes/scope/index.js';
import * as vault from '../src/boxes/vault/index.js';
import * as store from '../src/boxes/store/index.js';
import * as study from '../src/boxes/study/index.js';
import { dataDir, userDbPath, ensureDataDir, authDbPath } from '../src/boxes/paths.js';

export interface Options {
  user: string; legacy?: string; dryRun: boolean; passphrase?: string;
}

export interface MigrationResult {
  userId: number; recoveryKey: string; target: string; backup: string; dryRun: boolean;
}

function parseArgs(): Options {
  const argv = process.argv.slice(2);
  const get = (name: string): string | undefined => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return {
    user: get('user') ?? '',
    legacy: get('legacy'),
    dryRun: argv.includes('--dry-run'),
    passphrase: process.env.MINISTUDY_PASSPHRASE,
  };
}

function promptHidden(label: string): string {
  if (process.env.MINISTUDY_PASSPHRASE && label.toLowerCase().includes('passphrase')) {
    return process.env.MINISTUDY_PASSPHRASE;
  }
  if (!process.stdin.isTTY) throw new Error(`No TTY for ${label}; set MINISTUDY_PASSPHRASE`);
  const stdin = process.stdin as typeof process.stdin & { setRawMode?: (v: boolean) => void };
  process.stdout.write(`${label}: `);
  stdin.setRawMode?.(true);
  let value = '';
  try {
    for (;;) {
      const b = Buffer.alloc(1);
      if (readSync(0, b, 0, 1, null) === 0) break;
      const ch = b[0]!;
      if (ch === 13 || ch === 10) break;
      if (ch === 3) throw new Error('cancelled');
      if (ch === 127 || ch === 8) value = value.slice(0, -1);
      else if (ch >= 32) value += String.fromCharCode(ch);
    }
  } finally { stdin.setRawMode?.(false); process.stdout.write('\n'); }
  return value;
}

const versionOf = (db: Database): number =>
  (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;

const ENCRYPTED: Record<string, string[]> = {
  decks: ['name', 'description'],
  cards: ['front', 'back', 'tags_json'],
  quizzes: ['title', 'description'],
  questions: ['prompt', 'choices_json', 'answer_json', 'explanation'],
  answers: ['response', 'feedback'],
};
const TABLES = ['decks', 'cards', 'card_state', 'reviews', 'quizzes', 'questions', 'attempts', 'answers'];

function copyTable(legacy: Database, target: Database, table: string): void {
  const cols = (legacy.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>)
    .map((c) => c.name).filter((c) => c !== 'name_key' && c !== 'ui_context');
  const enc = ENCRYPTED[table] ?? [];
  const orderCol = table === 'card_state' ? 'card_id' : 'id';
  const rows = legacy.prepare(`SELECT ${cols.map((c) => `"${c}"`).join(',')} FROM ${table} ORDER BY ${orderCol}`).all() as Record<string, unknown>[];
  for (const row of rows) {
    const out: Record<string, unknown> = {};
    for (const col of cols) {
      const value = row[col];
      if (col === 'name') out.name_key = value === null ? null : vault.indexValue(String(value).toLowerCase());
      out[col] = enc.includes(col) && value !== null ? vault.seal(table, col, String(value)) : value;
    }
    const keys = Object.keys(out);
    const stmt = target.prepare(`INSERT INTO ${table} (${keys.map((k) => `"${k}"`).join(',')}) VALUES (${keys.map(() => '?').join(',')})`);
    (stmt.run as (...args: SQLQueryBindings[]) => unknown)(...keys.map((k) => out[k] as SQLQueryBindings));
  }
}

function checksum(db: Database): Record<string, unknown> {
  const scalar = (sql: string) => db.prepare(sql).get() as Record<string, unknown>;
  return {
    cards: scalar('SELECT COUNT(*) n, COALESCE(SUM(reps),0) reps FROM card_state'),
    reviews: scalar('SELECT COUNT(*) n, COALESCE(SUM(rating),0) rating FROM reviews'),
    attempts: scalar("SELECT COUNT(*) n, COALESCE(SUM(score),0) score FROM attempts WHERE status<>'in_progress'"),
    quizzes: scalar('SELECT COUNT(*) n FROM quizzes'),
  };
}

function parity(legacy: Database, target: Database, targetPath: string, ctx: scope.UserContext, samples: string[]): void {
  for (const table of TABLES) {
    const a = (legacy.prepare(`SELECT COUNT(*) n FROM ${table}`).get() as { n: number }).n;
    const b = (target.prepare(`SELECT COUNT(*) n FROM ${table}`).get() as { n: number }).n;
    if (a !== b) throw new Error(`row count mismatch for ${table}: ${a} vs ${b}`);
  }
  for (const [table, cols] of Object.entries(ENCRYPTED)) {
    for (const row of legacy.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[]) {
      for (const col of cols) {
        const sealed = (target.prepare(`SELECT "${col}" v FROM ${table} WHERE id=?`).get(row.id as SQLQueryBindings) as { v: string | null }).v;
        const plain = vault.open(table, col, sealed);
        const expected = row[col] === null || row[col] === undefined ? null : String(row[col]);
        if (plain !== expected) throw new Error(`decrypt mismatch for ${table}.${col} id=${row.id}`);
      }
    }
  }
  if (JSON.stringify(checksum(legacy)) !== JSON.stringify(checksum(target))) throw new Error('SRS/review checksum mismatch');
  const integrity = (db: Database): string =>
    (db.prepare('PRAGMA integrity_check').get() as { integrity_check: string }).integrity_check;
  if (integrity(legacy) !== 'ok') throw new Error('legacy integrity check failed');
  if (integrity(target) !== 'ok') throw new Error('target integrity check failed');
  if (target.prepare('PRAGMA foreign_key_check').all().length) throw new Error('target foreign key check failed');
  const scoped = scope.run(ctx, () => ({
    summaries: study.deckSummaries().length,
    total: study.stats({ deck: undefined, days: 30 }).total,
  }));
  const plain = {
    summaries: (legacy.prepare('SELECT COUNT(*) n FROM decks').get() as { n: number }).n,
    total: (legacy.prepare('SELECT COUNT(*) n FROM cards').get() as { n: number }).n,
  };
  if (JSON.stringify(scoped) !== JSON.stringify(plain)) throw new Error('stats parity mismatch');

  target.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  for (const file of [targetPath, authDbPath()]) {
    if (!existsSync(file)) continue;
    const bytes = readFileSync(file);
    for (const sample of samples) {
      if (sample.length > 20 && bytes.includes(Buffer.from(sample))) throw new Error('plaintext sample found in migrated bytes');
    }
  }
}

export async function migrate(opts: Options): Promise<MigrationResult> {
  if (!opts.user) throw new Error('missing --user <name>');
  const legacyPath = opts.legacy ?? join(dataDir(), 'ministudy.db');
  if (!existsSync(legacyPath)) throw new Error(`legacy database not found: ${legacyPath}`);
  const scratch = opts.dryRun ? mkdtempSync(join('/tmp/opencode', 'ms-migrate-')) : '';
  try {
    const authPath = opts.dryRun ? join(scratch, 'auth.db') : authDbPath();
    if (opts.dryRun && existsSync(authDbPath())) copyFileSync(authDbPath(), authPath);
    auth.open(authPath); auth.migrate();
    if (auth.hasUsers()) throw new Error('auth.db already has users; the migrated user must be first');

    const legacy = new Database(legacyPath, { readonly: true });
    if (versionOf(legacy) !== 5) throw new Error(`legacy user_version must be 5, got ${versionOf(legacy)}`);
    const backupDir = opts.dryRun ? scratch : join(dataDir(), 'backups');
    mkdirSync(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backup = join(backupDir, `ministudy-pre-multiuser-${stamp}.db`);
    legacy.exec(`VACUUM INTO '${backup.replace(/'/g, "''")}'`);
    const check = new Database(backup, { readonly: true });
    try {
      const ok = (check.prepare('PRAGMA integrity_check').get() as { integrity_check: string }).integrity_check;
      if (ok !== 'ok') throw new Error('backup integrity check failed');
    } finally { check.close(); }

    const passphrase = opts.passphrase ?? promptHidden('Passphrase');
    const confirm = opts.passphrase ?? promptHidden('Confirm passphrase');
    if (passphrase !== confirm) throw new Error('passphrases do not match');
    if (passphrase.length < 10) throw new Error('passphrase must be at least 10 characters');
    const created = await auth.createUser({ username: opts.user, passphrase, admin: true });
    const unlocked = await auth.login(opts.user, passphrase, 'migrate');
    const samples: string[] = [];
    if (legacy.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='decks'").get()) {
      const long = legacy.prepare("SELECT name FROM decks WHERE length(name)>25 LIMIT 1").get() as { name?: string } | undefined;
      if (long?.name) samples.push(long.name);
    }

    const targetPath = opts.dryRun ? join(scratch, 'users', `${created.user.id}.db`) : userDbPath(created.user.id);
    mkdirSync(dirname(targetPath), { recursive: true });
    if (existsSync(targetPath)) throw new Error(`target DB already exists: ${targetPath}`);
    const target = new Database(targetPath);
    let done = false;
    const ctx: scope.UserContext = { userId: created.user.id, db: target, keys: unlocked.keys };
    try {
      scope.run(ctx, () => {
        target.exec('PRAGMA foreign_keys=OFF');
        store.migrateDb(target);
        // The card-insert trigger would create a default card_state that collides
        // with the row we copy; disable it for the import and restore it after.
        target.exec('DROP TRIGGER IF EXISTS trg_cards_state');
        target.transaction(() => {
          for (const table of TABLES) copyTable(legacy, target, table);
          target.prepare('DELETE FROM changes').run();
          target.prepare("DELETE FROM sqlite_sequence WHERE name='changes'").run();
        })();
        target.exec(`CREATE TRIGGER trg_cards_state AFTER INSERT ON cards
          BEGIN INSERT INTO card_state(card_id) VALUES (NEW.id); END;`);
        target.exec('PRAGMA foreign_keys=ON');
      });
      scope.run(ctx, () => parity(legacy, target, targetPath, ctx, samples));
      return {
        userId: created.user.id, recoveryKey: created.recoveryKey,
        target: targetPath, backup, dryRun: opts.dryRun,
      };
    } catch (e) {
      try { target.close(); } catch { /* already closed */ }
      try { rmSync(targetPath); } catch { /* absent */ }
      throw e;
    } finally {
      vault.zero(unlocked.keys.enc);
      vault.zero(unlocked.keys.idx);
      if (!done) { try { target.close(); } catch { /* already closed */ } }
      legacy.close();
      auth.close();
    }
  } finally {
    if (opts.dryRun) rmSync(scratch, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const opts = parseArgs();
  ensureDataDir();
  migrate(opts).then((r) => {
    console.log(`migrated user ${opts.user} (id ${r.userId}) -> ${r.target}`);
    console.log(`RECOVERY KEY (shown once): ${r.recoveryKey}`);
    console.log(`backup: ${r.backup}`);
    console.log('After verifying, delete: the legacy .db, its -wal/-shm files, and the pre-migration backup.');
  }).catch((e) => {
    console.error(`migrate: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  });
}
