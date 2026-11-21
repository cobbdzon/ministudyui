// Envelope encryption primitives. Only node:crypto primitives are used here;
// no custom cipher, KDF, padding, or token construction.
import {
  createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync,
  randomBytes as nodeRandomBytes, scrypt, timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';
import * as scope from '../scope/index.js';
import { AppError } from '../errors.js';

const scryptAsync = promisify(scrypt) as (
  password: string, salt: Uint8Array, keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

const PREFIX = 'enc1:';
const NONCE_LEN = 12;
const TAG_LEN = 16;
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export type WrapKind = 'passphrase' | 'recovery' | 'agent';

export interface WrapSpec {
  kind: WrapKind;
  salt: Uint8Array;
  N: number;
  r: number;
  p: number;
  /** Binds a wrap to its purpose and user, e.g. `wrap.passphrase.7`. */
  aad: string;
}

export interface KdfCost { N?: number; r?: number; p?: number; maxmem?: number }

export const DEFAULT_SCRYPT: Required<Omit<KdfCost, 'maxmem'>> = { N: 2 ** 17, r: 8, p: 1 };

export function randomBytes(length: number): Uint8Array {
  return new Uint8Array(nodeRandomBytes(length));
}

export function zero(buf: Uint8Array | null | undefined): void {
  if (buf) buf.fill(0);
}

export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  // Hashing first makes the comparison independent of the two lengths.
  const ah = createHash('sha256').update(a).digest();
  const bh = createHash('sha256').update(b).digest();
  return timingSafeEqual(ah, bh);
}

export function hkdfSha256(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, length: number): Uint8Array {
  return new Uint8Array(hkdfSync('sha256', ikm, salt, info, length));
}

export function hmacSha256(key: Uint8Array, data: Uint8Array): Uint8Array {
  return new Uint8Array(createHmac('sha256', key).update(data).digest());
}

export function blindIndex(idxKey: Uint8Array, casefoldedValue: string): string {
  return Buffer.from(hmacSha256(idxKey, Buffer.from(casefoldedValue, 'utf8'))).toString('hex');
}

/** Blind index using the request's idx key. Callers pass an already-casefolded value. */
export function indexValue(casefoldedValue: string): string {
  return blindIndex(scope.current().keys.idx, casefoldedValue);
}

export function deriveSubkeys(dek: Uint8Array): { enc: Uint8Array; idx: Uint8Array } {
  const salt = new Uint8Array(32);
  return {
    enc: hkdfSha256(dek, salt, Buffer.from('ministudyui.field.enc.v1', 'utf8'), 32),
    idx: hkdfSha256(dek, salt, Buffer.from('ministudyui.blind.idx.v1', 'utf8'), 32),
  };
}

export function randomDek(): Uint8Array {
  return randomBytes(32);
}

export function sealRaw(key: Uint8Array, aad: string, plaintext: Uint8Array): string {
  const nonce = randomBytes(NONCE_LEN);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const body = Buffer.concat([cipher.update(Buffer.from(plaintext)), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([Buffer.from(nonce), body, tag]).toString('base64url');
}

/** Returns null on ANY failure (wrong key, tamper, bad format) — no failure reason leaks. */
export function openRaw(key: Uint8Array, aad: string, value: string): Uint8Array | null {
  try {
    if (!value.startsWith(PREFIX)) return null;
    const raw = Buffer.from(value.slice(PREFIX.length), 'base64url');
    if (raw.length < NONCE_LEN + TAG_LEN) return null;
    const nonce = raw.subarray(0, NONCE_LEN);
    const tag = raw.subarray(raw.length - TAG_LEN);
    const body = raw.subarray(NONCE_LEN, raw.length - TAG_LEN);
    const decipher = createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAAD(Buffer.from(aad, 'utf8'));
    decipher.setAuthTag(tag);
    return new Uint8Array(Buffer.concat([decipher.update(body), decipher.final()]));
  } catch {
    return null;
  }
}

function fieldAad(table: string, column: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(table) || !/^[a-z_][a-z0-9_]*$/.test(column)) {
    throw new AppError('INTERNAL', 'Invalid encryption context');
  }
  return `${table}.${column}`;
}

/** Seal a field using the request's content key. Plaintext never reaches SQL. */
export function seal(table: string, column: string, plaintext: string | null): string | null {
  if (plaintext === null) return null;
  const key = scope.current().keys.enc;
  return sealRaw(key, fieldAad(table, column), Buffer.from(plaintext, 'utf8'));
}

/** Open a field using the request's content key. Throws generically on tamper. */
export function open(table: string, column: string, value: string | null): string | null {
  if (value === null) return null;
  const key = scope.current().keys.enc;
  const plain = openRaw(key, fieldAad(table, column), value);
  if (plain === null) throw new AppError('INTERNAL', 'Encrypted data could not be verified');
  return Buffer.from(plain).toString('utf8');
}

export async function deriveKek(
  credential: string | Uint8Array, spec: WrapSpec, cost: KdfCost = {},
): Promise<Uint8Array> {
  const N = cost.N ?? spec.N;
  const r = cost.r ?? spec.r;
  const p = cost.p ?? spec.p;
  if (spec.kind === 'passphrase') {
    if (typeof credential !== 'string') throw new AppError('INTERNAL', 'Invalid credential');
    // 128*N*r bytes of memory are required by scrypt; leave generous headroom.
    const maxmem = cost.maxmem ?? 128 * N * r + 64 * 1024 * 1024;
    return new Uint8Array(await scryptAsync(credential, spec.salt, 32, { N, r, p, maxmem }));
  }
  const bytes = typeof credential === 'string' ? Buffer.from(credential, 'utf8') : credential;
  return hkdfSha256(bytes, spec.salt, Buffer.from(`wrap.${spec.kind}.v1`, 'utf8'), 32);
}

export function wrapDek(dek: Uint8Array, kek: Uint8Array, spec: WrapSpec): string {
  return sealRaw(kek, spec.aad, dek);
}

/** Returns null when the credential is wrong; the caller must not reveal why. */
export function unwrapDek(wrap: string, kek: Uint8Array, spec: WrapSpec): Uint8Array | null {
  return openRaw(kek, spec.aad, wrap);
}

export function defaultWrapSpec(kind: WrapKind, salt: Uint8Array, userId: number): WrapSpec {
  return {
    kind, salt,
    N: DEFAULT_SCRYPT.N, r: DEFAULT_SCRYPT.r, p: DEFAULT_SCRYPT.p,
    aad: `wrap.${kind}.${userId}`,
  };
}

/** Grouped base32 of a 256-bit key, shown once to the user. */
export function formatRecoveryKey(key: Uint8Array): string {
  if (key.length !== 32) throw new AppError('INTERNAL', 'Invalid recovery key length');
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of key) {
    value = ((value << 8) | byte) & 0xffffff;
    bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out.match(/.{1,13}/g)!.join('-');
}

export function parseRecoveryKey(text: string): Uint8Array {
  const clean = text.trim().toUpperCase().replace(/[\s-]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new AppError('VALIDATION', 'Invalid recovery key');
    value = ((value << 5) | idx) & 0xffffff;
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  // 256 bits -> 52 base32 chars (260 bits); the final 4 bits are zero padding.
  if (out.length !== 32 || bits >= 8 || (value & ((1 << bits) - 1)) !== 0) {
    throw new AppError('VALIDATION', 'Invalid recovery key');
  }
  return new Uint8Array(out);
}
