// Auth domain box. Owns auth.db, identities, wraps, invites and agent tokens.
// Pure domain logic: no HTTP, no sessions, no study data, no unwrapped keys on disk.
import { Database } from 'bun:sqlite';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unlinkSync } from 'node:fs';
import * as store from '../store/index.js';
import * as vault from '../vault/index.js';
import * as userdb from '../userdb/index.js';
import { userDbPath, authDbPath } from '../paths.js';
import { AppError } from '../errors.js';

const __dir = dirname(fileURLToPath(import.meta.url));
let authDb: Database | null = null;

export interface UserRow {
  id: number; username: string; is_admin: number; recovery_id: string;
  disabled_at: string | null; created_at: string;
}
export interface WrapRow { wrap: string; salt: string; N: number; r: number; p: number }
export interface InviteRow {
  id: number; code_hash: string; created_by: number; expires_at: string;
  used_by: number | null; used_at: string | null; created_at: string;
}
export interface AgentTokenRow {
  id: number; user_id: number; token_id: string; wrap: string; salt: string;
  mode: 'read' | 'write'; label: string; created_at: string;
  last_used_at: string | null; revoked_at: string | null;
}

export interface AuthOptions { kdfCost?: vault.KdfCost }
export interface Unlocked { userId: number; username: string; isAdmin: boolean; keys: vaultSubkeys }
type vaultSubkeys = { enc: Uint8Array; idx: Uint8Array };

export function open(path: string = authDbPath()): Database {
  const db = new Database(path);
  db.exec('PRAGMA journal_mode=WAL');
  db.exec('PRAGMA foreign_keys=ON');
  db.exec('PRAGMA busy_timeout=5000');
  db.exec('PRAGMA synchronous=NORMAL');
  authDb = db;
  return db;
}

function db(): Database {
  if (!authDb) throw new AppError('INTERNAL', 'Auth store is not open');
  return authDb;
}

export function migrate(): void {
  const d = db();
  if ((d.prepare('PRAGMA user_version').get() as { user_version: number }).user_version < 1) {
    d.exec(readFileSync(join(__dir, 'schema.sql'), 'utf8'));
    d.exec('PRAGMA user_version = 1');
  }
}

export function close(): void {
  if (authDb) { authDb.close(); authDb = null; }
}

export function hasUsers(): boolean {
  return store.countOn(db(), 'SELECT COUNT(*) AS n FROM users') > 0;
}

function checkUsername(username: string): void {
  if (typeof username !== 'string' || !/^[A-Za-z0-9._-]{3,32}$/.test(username)) {
    throw new AppError('VALIDATION', 'Username must be 3-32 letters, digits, dots, underscores or dashes', 'username');
  }
}

function checkPassphrase(passphrase: string): void {
  if (typeof passphrase !== 'string' || passphrase.length < 10 || passphrase.length > 1024) {
    throw new AppError('VALIDATION', 'Passphrase must be at least 10 characters', 'passphrase');
  }
}

function spec(kind: vault.WrapKind, salt: Uint8Array, userId: number, opts?: AuthOptions): vault.WrapSpec {
  const base = vault.defaultWrapSpec(kind, salt, userId);
  return { ...base, N: opts?.kdfCost?.N ?? base.N, r: opts?.kdfCost?.r ?? base.r, p: opts?.kdfCost?.p ?? base.p };
}

function specFromRow(kind: vault.WrapKind, row: WrapRow, userId: number, opts?: AuthOptions): vault.WrapSpec {
  return {
    kind, salt: Buffer.from(row.salt, 'base64'),
    N: opts?.kdfCost?.N ?? row.N, r: opts?.kdfCost?.r ?? row.r, p: opts?.kdfCost?.p ?? row.p,
    aad: `wrap.${kind}.${userId}`,
  };
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function recoveryIdOf(recoveryKey: Uint8Array): string {
  return sha256Hex(recoveryKey);
}

interface CreateInput {
  username: string; passphrase: string; admin?: boolean; kdfCost?: vault.KdfCost;
}

interface PreparedWrap { wrap: string; salt: string; N: number; r: number; p: number }
interface PreparedAccount {
  userId: number; recoveryId: string; recoveryKeyText: string; pass: PreparedWrap; rec: PreparedWrap;
}

function nextUserId(d: Database): number {
  return Number(store.getOn<{ n: number }>(d, 'SELECT COALESCE(MAX(id),0)+1 AS n FROM users')!.n);
}

// All KDF work happens BEFORE the transaction. Holding BEGIN IMMEDIATE across
// an await on a shared connection lets other callers commit into our rollback.
async function prepareAccount(input: CreateInput, userId: number): Promise<PreparedAccount> {
  const dek = vault.randomDek();
  const recoveryKey = vault.randomBytes(32);
  let passKek: Uint8Array | null = null;
  let recKek: Uint8Array | null = null;
  try {
    const passSalt = vault.randomBytes(16);
    const recSalt = vault.randomBytes(16);
    const passSpec = spec('passphrase', passSalt, userId, { kdfCost: input.kdfCost });
    const recSpec = spec('recovery', recSalt, userId, { kdfCost: input.kdfCost });
    passKek = await vault.deriveKek(input.passphrase, passSpec, input.kdfCost);
    recKek = await vault.deriveKek(recoveryKey, recSpec, input.kdfCost);
    const asRow = (w: string, s: vault.WrapSpec): PreparedWrap => ({
      wrap: w, salt: Buffer.from(s.salt).toString('base64'), N: s.N, r: s.r, p: s.p,
    });
    return {
      userId, recoveryId: recoveryIdOf(recoveryKey), recoveryKeyText: vault.formatRecoveryKey(recoveryKey),
      pass: asRow(vault.wrapDek(dek, passKek, passSpec), passSpec),
      rec: asRow(vault.wrapDek(dek, recKek, recSpec), recSpec),
    };
  } finally {
    vault.zero(dek); vault.zero(recoveryKey); vault.zero(passKek); vault.zero(recKek);
  }
}

function insertAccountInTx(d: Database, input: CreateInput, p: PreparedAccount): UserRow {
  store.runOn(d, 'INSERT INTO users(id, username, is_admin, recovery_id) VALUES (?,?,?,?)',
    [p.userId, input.username, input.admin ? 1 : 0, p.recoveryId]);
  for (const [kind, w] of [['passphrase', p.pass], ['recovery', p.rec]] as const) {
    store.runOn(d, 'INSERT INTO key_wraps(user_id, kind, wrap, salt, N, r, p) VALUES (?,?,?,?,?,?,?)',
      [p.userId, kind, w.wrap, w.salt, w.N, w.r, w.p]);
  }
  return store.getOn<UserRow>(d, 'SELECT * FROM users WHERE id=?', [p.userId])!;
}

export async function createUser(input: CreateInput): Promise<{ user: UserRow; recoveryKey: string }> {
  checkUsername(input.username);
  checkPassphrase(input.passphrase);
  const d = db();
  const prepared = await prepareAccount(input, nextUserId(d));
  return store.txOn(d, () => ({ user: insertAccountInTx(d, input, prepared), recoveryKey: prepared.recoveryKeyText }));
}

export async function login(
  username: string, passphrase: string, _ip?: string, opts?: AuthOptions,
): Promise<Unlocked> {
  checkUsername(username);
  if (typeof passphrase !== 'string') throw new AppError('UNAUTHENTICATED', 'Invalid credentials');
  const d = db();
  const row = store.getOn<UserRow>(d, 'SELECT * FROM users WHERE username = ? COLLATE NOCASE', [username]);
  const fail = () => new AppError('UNAUTHENTICATED', 'Invalid credentials');
  if (passphrase.length > 1024) throw fail();
  checkThrottle(username, _ip);
  const dummySalt = vault.randomBytes(16);
  let kek: Uint8Array | null = null;
  let dek: Uint8Array | null = null;
  try {
    if (!row || row.disabled_at) {
      // Comparable work for unknown / disabled users.
      kek = await vault.deriveKek('dummy-passphrase-not-a-real-secret', spec('passphrase', dummySalt, 1, opts), opts?.kdfCost);
      recordFailure(username, _ip);
      throw fail();
    }
    const wrap = store.getOn<WrapRow>(d,
      "SELECT wrap, salt, N, r, p FROM key_wraps WHERE user_id=? AND kind='passphrase'", [row.id]);
    if (!wrap) { recordFailure(username, _ip); throw fail(); }
    const s = specFromRow('passphrase', wrap, row.id, opts);
    kek = await vault.deriveKek(passphrase, s, opts?.kdfCost);
    dek = vault.unwrapDek(wrap.wrap, kek, s);
    if (!dek) { recordFailure(username, _ip); throw fail(); }
    resetThrottle(username, _ip);
    const keys = vault.deriveSubkeys(dek);
    return { userId: row.id, username: row.username, isAdmin: !!row.is_admin, keys };
  } finally {
    vault.zero(kek); vault.zero(dek); vault.zero(dummySalt);
  }
}

export async function changePassphrase(
  userId: number, currentPassphrase: string, newPassphrase: string, opts?: AuthOptions,
): Promise<void> {
  checkPassphrase(newPassphrase);
  const d = db();
  const wrap = store.getOn<WrapRow>(d,
    "SELECT wrap, salt, N, r, p FROM key_wraps WHERE user_id=? AND kind='passphrase'", [userId]);
  if (!wrap) throw new AppError('UNAUTHENTICATED', 'Invalid credentials');
  let oldKek: Uint8Array | null = null;
  let newKek: Uint8Array | null = null;
  let dek: Uint8Array | null = null;
  try {
    const oldSpec = specFromRow('passphrase', wrap, userId, opts);
    oldKek = await vault.deriveKek(currentPassphrase, oldSpec, opts?.kdfCost);
    dek = vault.unwrapDek(wrap.wrap, oldKek, oldSpec);
    if (!dek) throw new AppError('UNAUTHENTICATED', 'Invalid credentials');
    const newSalt = vault.randomBytes(16);
    const newSpec = spec('passphrase', newSalt, userId, opts);
    newKek = await vault.deriveKek(newPassphrase, newSpec, opts?.kdfCost);
    store.runOn(d,
      "UPDATE key_wraps SET wrap=?, salt=?, N=?, r=?, p=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id=? AND kind='passphrase'",
      [vault.wrapDek(dek, newKek, newSpec), Buffer.from(newSalt).toString('base64'), newSpec.N, newSpec.r, newSpec.p, userId]);
  } finally {
    vault.zero(oldKek); vault.zero(newKek); vault.zero(dek);
  }
}

export async function recoverWithKey(
  recoveryText: string, newPassphrase: string, opts?: AuthOptions,
): Promise<{ username: string }> {
  checkPassphrase(newPassphrase);
  let recoveryKey: Uint8Array;
  try { recoveryKey = vault.parseRecoveryKey(recoveryText); }
  catch { throw new AppError('UNAUTHENTICATED', 'Invalid credentials'); }
  const d = db();
  const rid = recoveryIdOf(recoveryKey);
  const user = store.getOn<UserRow>(d, 'SELECT * FROM users WHERE recovery_id=?', [rid]);
  const matched = vault.constantTimeEqual(
    Buffer.from(rid, 'hex'), Buffer.from(user ? user.recovery_id : Buffer.alloc(32).toString('hex'), 'hex'));
  if (!user || !matched || user.disabled_at) {
    vault.zero(recoveryKey);
    throw new AppError('UNAUTHENTICATED', 'Invalid credentials');
  }
  let kek: Uint8Array | null = null;
  let newKek: Uint8Array | null = null;
  let dek: Uint8Array | null = null;
  try {
    const wrap = store.getOn<WrapRow>(d,
      "SELECT wrap, salt, N, r, p FROM key_wraps WHERE user_id=? AND kind='recovery'", [user.id]);
    if (!wrap) throw new AppError('UNAUTHENTICATED', 'Invalid credentials');
    const recSpec = specFromRow('recovery', wrap, user.id, opts);
    kek = await vault.deriveKek(recoveryKey, recSpec, opts?.kdfCost);
    dek = vault.unwrapDek(wrap.wrap, kek, recSpec);
    if (!dek) throw new AppError('UNAUTHENTICATED', 'Invalid credentials');
    const salt = vault.randomBytes(16);
    const passSpec = spec('passphrase', salt, user.id, opts);
    newKek = await vault.deriveKek(newPassphrase, passSpec, opts?.kdfCost);
    store.runOn(d,
      "UPDATE key_wraps SET wrap=?, salt=?, N=?, r=?, p=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id=? AND kind='passphrase'",
      [vault.wrapDek(dek, newKek, passSpec), Buffer.from(salt).toString('base64'), passSpec.N, passSpec.r, passSpec.p, user.id]);
    return { username: user.username };
  } finally {
    vault.zero(recoveryKey); vault.zero(kek); vault.zero(newKek); vault.zero(dek);
  }
}

const INVITE_PREFIX = 'msi-';

export async function createInvite(
  createdBy: number, ttlSeconds = 7 * 86400,
): Promise<{ code: string; expiresAt: string }> {
  const d = db();
  const raw = vault.randomBytes(32);
  const code = INVITE_PREFIX + vault.formatRecoveryKey(raw).toLowerCase().replace(/-/g, '');
  const codeHash = inviteHash(code);
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  store.runOn(d,
    'INSERT INTO invites(code_hash, created_by, expires_at) VALUES (?, ?, ?)',
    [codeHash, createdBy, expiresAt]);
  vault.zero(raw);
  return { code, expiresAt };
}

function inviteHash(code: string): string {
  return sha256Hex(Buffer.from(code.trim().toLowerCase(), 'utf8'));
}

function validInvite(d: Database, code: string): InviteRow {
  const hash = inviteHash(code);
  const invite = store.getOn<InviteRow>(d, 'SELECT * FROM invites WHERE code_hash=?', [hash]);
  // Compare the hash in constant time; do comparable work on a miss so the
  // existence of a hash is not observable through timing.
  const stored = invite ? Buffer.from(invite.code_hash, 'hex') : Buffer.alloc(32);
  const matched = vault.constantTimeEqual(Buffer.from(hash, 'hex'), stored);
  if (!invite || !matched || invite.used_at || invite.used_by ||
      new Date(invite.expires_at).getTime() <= Date.now()) {
    throw new AppError('VALIDATION', 'Invite is invalid, used or expired', 'invite');
  }
  return invite;
}

export function listInvites(): Array<Omit<InviteRow, 'code_hash'>> {
  const rows = store.allOn<InviteRow>(db(),
    'SELECT id, code_hash, created_by, expires_at, used_by, used_at, created_at FROM invites ORDER BY id DESC');
  return rows.map(({ code_hash: _ignored, ...rest }) => rest);
}

export async function registerWithInvite(
  code: string, username: string, passphrase: string, opts?: AuthOptions,
): Promise<{ user: UserRow; recoveryKey: string }> {
  checkUsername(username);
  checkPassphrase(passphrase);
  const d = db();
  // Validate the invite BEFORE the two expensive scrypt calls: an unauthenticated
  // caller must not be able to burn KDF work with random invite codes.
  validInvite(d, code);
  const input: CreateInput = { username, passphrase, admin: false, kdfCost: opts?.kdfCost };
  const prepared = await prepareAccount(input, nextUserId(d));
  return store.txOn(d, () => {
    const invite = validInvite(d, code); // recheck inside the transaction (single-use)
    const user = insertAccountInTx(d, input, prepared);
    store.runOn(d, 'UPDATE invites SET used_by=?, used_at=strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\') WHERE id=?',
      [user.id, invite.id]);
    return { user, recoveryKey: prepared.recoveryKeyText };
  });
}

export function listUsers(): Array<Omit<UserRow, 'recovery_id'>> {
  const rows = store.allOn<UserRow>(db(), 'SELECT * FROM users ORDER BY id');
  return rows.map(({ recovery_id: _ignored, ...rest }) => rest);
}

export function setDisabled(userId: number, disabled: boolean): void {
  const d = db();
  const now = new Date().toISOString();
  store.txOn(d, () => {
    store.runOn(d, 'UPDATE users SET disabled_at=? WHERE id=?', [disabled ? now : null, userId]);
    if (disabled) {
      store.runOn(d, 'UPDATE agent_tokens SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL', [now, userId]);
    }
  });
}

export function disableUser(userId: number): void { setDisabled(userId, true); }
export function enableUser(userId: number): void { setDisabled(userId, false); }

export function deleteUser(userId: number): void {
  const d = db();
  const user = store.getOn<UserRow>(d, 'SELECT * FROM users WHERE id=?', [userId]);
  if (!user) throw new AppError('NOT_FOUND', 'User not found');
  userdb.close(userId);
  store.txOn(d, () => {
    store.runOn(d, 'DELETE FROM agent_tokens WHERE user_id=?', [userId]);
    store.runOn(d, 'DELETE FROM key_wraps WHERE user_id=?', [userId]);
    store.runOn(d, 'UPDATE invites SET used_by=NULL WHERE used_by=?', [userId]);
    store.runOn(d, 'DELETE FROM users WHERE id=?', [userId]);
  });
  for (const suffix of ['', '-wal', '-shm']) {
    try { unlinkSync(userDbPath(userId) + suffix); } catch { /* already absent */ }
  }
}

// ---- Agent tokens -----------------------------------------------------------

const TOKEN_RE = /^msk_([0-9a-f]{16})\.([A-Za-z0-9_-]{43})$/;

export interface CreatedAgentToken {
  token: string; tokenId: string; label: string; mode: 'read' | 'write'; createdAt: string;
}

// The wrap protects the derived subkeys (equivalent to wrapping the DEK: no
// data re-encryption is needed when a token is created or revoked).
export function createAgentToken(
  userId: number, label: string, mode: 'read' | 'write', keys: vaultSubkeys,
): CreatedAgentToken {
  if (!/^.{1,120}$/.test(label)) throw new AppError('VALIDATION', 'Invalid label', 'label');
  if (mode !== 'read' && mode !== 'write') throw new AppError('VALIDATION', 'Invalid mode', 'mode');
  const d = db();
  const tokenId = Buffer.from(vault.randomBytes(8)).toString('hex');
  const secret = vault.randomBytes(32);
  const secretText = Buffer.from(secret).toString('base64url');
  const salt = vault.randomBytes(16);
  const s: vault.WrapSpec = {
    kind: 'agent', salt, N: 1, r: 1, p: 1, aad: `wrap.agent.${userId}.${tokenId}`,
  };
  let kek: Uint8Array | null = null;
  let blob: Uint8Array | null = null;
  try {
    kek = vault.hkdfSha256(secret, salt, Buffer.from('wrap.agent.v1', 'utf8'), 32);
    blob = new Uint8Array(64);
    blob.set(keys.enc, 0);
    blob.set(keys.idx, 32);
    const wrap = vault.sealRaw(kek, s.aad, blob);
    const res = store.runOn(d,
      'INSERT INTO agent_tokens(user_id, token_id, wrap, salt, mode, label) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, tokenId, wrap, Buffer.from(salt).toString('base64'), mode, label]);
    return {
      token: `msk_${tokenId}.${secretText}`, tokenId,
      label, mode, createdAt: store.getOn<{ created_at: string }>(d, 'SELECT created_at FROM agent_tokens WHERE id=?', [Number(res.lastInsertRowid)])!.created_at,
    };
  } finally {
    vault.zero(secret); vault.zero(kek); vault.zero(blob);
  }
}

export function listAgentTokens(userId: number): Array<Pick<AgentTokenRow, 'token_id' | 'mode' | 'label' | 'created_at' | 'last_used_at' | 'revoked_at'>> {
  return store.allOn<AgentTokenRow>(db(),
    'SELECT token_id, mode, label, created_at, last_used_at, revoked_at FROM agent_tokens WHERE user_id=? ORDER BY id DESC',
    [userId]);
}

export function revokeAgentToken(userId: number, tokenId: string): void {
  const r = store.runOn(db(),
    'UPDATE agent_tokens SET revoked_at=strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\') WHERE user_id=? AND token_id=? AND revoked_at IS NULL',
    [userId, tokenId]);
  if (!r.changes) throw new AppError('NOT_FOUND', 'Token not found');
}

export interface AgentUnlock { userId: number; mode: 'read' | 'write'; tokenId: string; keys: vaultSubkeys }

export function unlockWithAgentToken(token: string): AgentUnlock {
  const fail = () => new AppError('UNAUTHENTICATED', 'Invalid token');
  const m = typeof token === 'string' ? TOKEN_RE.exec(token) : null;
  if (!m) throw fail();
  const [, tokenId, secretText] = m;
  const d = db();
  const row = store.getOn<AgentTokenRow>(d, 'SELECT * FROM agent_tokens WHERE token_id=?', [tokenId]);
  // Unknown id and bad secret both fail identically after comparable HKDF work.
  const salt = row ? Buffer.from(row.salt, 'base64') : vault.randomBytes(16);
  const secret = Buffer.from(secretText, 'base64url');
  if (Buffer.from(secret).toString('base64url') !== secretText) { vault.zero(secret); throw fail(); }
  let kek: Uint8Array | null = null;
  let blob: Uint8Array | null = null;
  try {
    kek = vault.hkdfSha256(secret, salt, Buffer.from('wrap.agent.v1', 'utf8'), 32);
    if (row) {
      const user = store.getOn<UserRow>(d, 'SELECT * FROM users WHERE id=?', [row.user_id]);
      const aad = `wrap.agent.${row.user_id}.${row.token_id}`;
      blob = vault.openRaw(kek, aad, row.wrap);
      if (!blob || blob.length !== 64 || !user || user.disabled_at || row.revoked_at) throw fail();
      const now = Date.now();
      if (!row.last_used_at || now - new Date(row.last_used_at).getTime() >= 60_000) {
        store.runOn(d, 'UPDATE agent_tokens SET last_used_at=strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\') WHERE id=?', [row.id]);
      }
      return {
        userId: row.user_id, mode: row.mode, tokenId: row.token_id,
        keys: { enc: blob.slice(0, 32), idx: blob.slice(32, 64) },
      };
    }
    // Unknown id must do comparable HKDF + GCM work before failing.
    const dummy = vault.sealRaw(kek, 'wrap.agent.dummy', new Uint8Array(64));
    vault.openRaw(kek, 'wrap.agent.dummy', dummy);
    throw fail();
  } finally {
    vault.zero(secret); vault.zero(kek); vault.zero(blob);
  }
}

// ---- Login throttling (per username and per IP, in memory) ------------------

interface Throttle { count: number; until: number }
const userFails = new Map<string, Throttle>();
const ipFails = new Map<string, Throttle>();
const BASE_MS = (): number => Math.max(1, Number(process.env.AUTH_THROTTLE_BASE_MS || 1000));

function bump(map: Map<string, Throttle>, key: string | undefined): void {
  if (!key) return;
  key = key.toLowerCase();
  const cur = map.get(key);
  const count = (cur?.count ?? 0) + 1;
  const delay = Math.min(60_000, BASE_MS() * 2 ** (count - 1));
  map.set(key, { count, until: Date.now() + delay });
}

const THROTTLE_AFTER = 3;

function checkThrottle(username: string, ip?: string): void {
  const blocked = (t?: Throttle) => !!t && t.count >= THROTTLE_AFTER && t.until > Date.now();
  if (blocked(userFails.get(username.toLowerCase())) || blocked(ip ? ipFails.get(ip.toLowerCase()) : undefined)) {
    throw new AppError('UNAUTHENTICATED', 'Too many attempts; try again later');
  }
}

function recordFailure(username: string, ip?: string): void { bump(userFails, username); bump(ipFails, ip); }
function resetThrottle(username: string, ip?: string): void {
  userFails.delete(username.toLowerCase()); if (ip) ipFails.delete(ip.toLowerCase());
}
export function resetAllThrottles(): void { userFails.clear(); ipFails.clear(); }
export function throttleDelayMs(username: string, ip?: string): number {
  return Math.max(0, (userFails.get(username.toLowerCase())?.until ?? 0) - Date.now(), (ip ? ipFails.get(ip.toLowerCase())?.until ?? 0 : 0) - Date.now());
}
