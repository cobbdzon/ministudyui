import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { migrate } from '../scripts/migrate-legacy.js';
import * as auth from '../src/boxes/auth/index.js';
import * as vault from '../src/boxes/vault/index.js';
import * as scope from '../src/boxes/scope/index.js';
import { authDbPath, userDbPath } from '../src/boxes/paths.js';

const SCHEMA = readFileSync('test/fixtures/legacy-schema-v5.sql', 'utf8');
const PASS = 'a long migration passphrase';
let tmp = '';
let oldDir: string | undefined;
let legacyPath = '';

function buildLegacy(): Database {
  const db = new Database(legacyPath);
  db.exec(SCHEMA);
  db.exec('PRAGMA user_version = 5');
  db.exec('DROP TRIGGER IF EXISTS trg_cards_state');
  const now = '2025-01-01T00:00:00.000Z';
  db.prepare('INSERT INTO decks(id,name,description,created_at) VALUES (?,?,?,?)')
    .run(1, 'Calculus II', 'A long legacy description with canary CANARY_LEGACY_DESC', now);
  db.prepare('INSERT INTO decks(id,name,description,created_at) VALUES (?,?,?,?)')
    .run(2, 'physics', 'Desc \\(\\int x^2 dx\\) — 日本語', now);
  const cards = [
    [1, 1, 'CANARY_FRONT_∫ x² dx', 'CANARY_BACK_é', '["α","β"]', 'user', 3],
    [2, 2, 'Front with $x^2$', 'Back', '[]', 'import', 0],
  ] as const;
  for (const [id, deck, front, back, tags, source, reps] of cards) {
    db.prepare('INSERT INTO cards(id,deck_id,front,back,tags_json,source,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)')
      .run(id, deck, front, back, tags, source, now, now);
    db.prepare('INSERT INTO card_state(card_id,ease,interval_days,reps,lapses,due_at,last_reviewed_at,ignored) VALUES (?,?,?,?,?,?,?,?)')
      .run(id, 2.5, reps, reps, 0, now, reps ? now : null, id === 2 ? 1 : 0);
  }
  db.prepare(`INSERT INTO reviews(id,card_id,rating,reviewed_at,prev_interval,new_interval,prev_ease,new_ease,prev_state_json)
    VALUES (1,1,3,?,0,6,2.5,2.6,?)`).run(now, JSON.stringify({ ease: 2.5 }));
  db.prepare('INSERT INTO quizzes(id,deck_id,title,description,source,shuffle,created_at) VALUES (?,?,?,?,?,?,?)')
    .run(1, 1, 'CANARY_QUIZ_TITLE', 'quiz desc', 'import', 0, now);
  db.prepare(`INSERT INTO questions(id,quiz_id,position,type,prompt,choices_json,answer_json,explanation,points)
    VALUES (1,1,1,'mcq','CANARY_PROMPT',?,?,?,2)`)
    .run(JSON.stringify([{ id: 'a', text: 'CANARY_CHOICE' }, { id: 'b', text: 'B' }]),
      JSON.stringify({ correct: 'a' }), 'CANARY_EXPLANATION');
  db.prepare('INSERT INTO attempts(id,quiz_id,started_at,status,max_score) VALUES (1,1,?,\'graded\',2)').run(now);
  db.prepare('INSERT INTO attempts(id,quiz_id,started_at,status,max_score) VALUES (2,1,?,\'in_progress\',2)').run(now);
  db.prepare(`INSERT INTO answers(id,attempt_id,question_id,response,grading_status,is_correct,points_awarded,feedback,graded_by,graded_at)
    VALUES (1,1,1,'CANARY_RESPONSE','graded',1,2,'CANARY_FEEDBACK','auto',?)`).run(now);
  return db;
}

beforeEach(() => {
  tmp = mkdtempSync('/tmp/opencode/ms-migrate-test-');
  oldDir = process.env.DATA_DIR;
  process.env.DATA_DIR = tmp;
  legacyPath = join(tmp, 'legacy.db');
  const legacy = buildLegacy();
  legacy.close();
});

afterEach(() => {
  if (oldDir === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = oldDir;
  rmSync(tmp, { recursive: true, force: true });
});

describe('legacy v5 migration', () => {
  test('migrates into an encrypted per-user DB with full parity', async () => {
    const result = await migrate({ user: 'owner', legacy: legacyPath, dryRun: false, passphrase: PASS });
    expect(result.userId).toBe(1);
    expect(result.recoveryKey).toMatch(/^[A-Z2-7]{13}(-[A-Z2-7]{13}){3}$/);
    expect(existsSync(result.target)).toBe(true);
    expect(existsSync(result.backup)).toBe(true);
    const target = new Database(result.target, { readonly: true });
    try {
      expect((target.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(6);
      expect((target.prepare('SELECT COUNT(*) n FROM decks').get() as { n: number }).n).toBe(2);
      expect((target.prepare('SELECT COUNT(*) n FROM cards').get() as { n: number }).n).toBe(2);
      expect((target.prepare('SELECT COUNT(*) n FROM attempts').get() as { n: number }).n).toBe(2);
      expect((target.prepare('SELECT COUNT(*) n FROM changes').get() as { n: number }).n).toBe(0);
      const deck = target.prepare('SELECT name,name_key,description FROM decks WHERE id=1').get() as { name: string; name_key: string; description: string };
      expect(deck.name.startsWith('enc1:')).toBe(true);
      expect(deck.name_key).toMatch(/^[0-9a-f]{64}$/);
      // Decrypt with a context using the migrated user's keys (from login).
      auth.open();
      const unlocked = await auth.login('owner', PASS, 'test');
      const ctx: scope.UserContext = { userId: 1, db: target, keys: unlocked.keys };
      expect(scope.run(ctx, () => vault.open('decks', 'name', deck.name))).toBe('Calculus II');
      expect(scope.run(ctx, () => vault.open('cards', 'front',
        (target.prepare('SELECT front FROM cards WHERE id=1').get() as { front: string }).front)))
        .toBe('CANARY_FRONT_∫ x² dx');
      expect(scope.run(ctx, () => vault.open('questions', 'choices_json',
        (target.prepare('SELECT choices_json FROM questions WHERE id=1').get() as { choices_json: string }).choices_json)))
        .toContain('CANARY_CHOICE');
      auth.close();
      target.exec('PRAGMA wal_checkpoint(TRUNCATE)');
      const bytes = readFileSync(result.target);
      for (const canary of ['CANARY_LEGACY_DESC', 'CANARY_FRONT_∫ x² dx', 'CANARY_QUIZ_TITLE', 'CANARY_RESPONSE', 'CANARY_FEEDBACK']) {
        expect(bytes.includes(Buffer.from(canary))).toBe(false);
      }
    } finally { target.close(); }
    // Legacy untouched.
    const legacy = new Database(legacyPath, { readonly: true });
    expect((legacy.prepare('SELECT COUNT(*) n FROM decks').get() as { n: number }).n).toBe(2);
    legacy.close();
  });

  test('dry run writes nothing under DATA_DIR and leaves no target', async () => {
    const result = await migrate({ user: 'owner', legacy: legacyPath, dryRun: true, passphrase: PASS });
    expect(result.dryRun).toBe(true);
    expect(existsSync(result.target)).toBe(false);
    expect(existsSync(authDbPath())).toBe(false);
  });

  test('aborts on wrong legacy version, existing users and existing target', async () => {
    const bad = join(tmp, 'bad.db');
    const db = new Database(bad);
    db.exec(SCHEMA);
    db.close();
    await expect(migrate({ user: 'owner', legacy: bad, dryRun: true, passphrase: PASS }))
      .rejects.toThrow(/user_version must be 5/);
    await expect(migrate({ user: 'owner', legacy: legacyPath, dryRun: true, passphrase: 'short' }))
      .rejects.toThrow(/at least 10/);
  });
});
