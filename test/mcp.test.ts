// Phase 6 — MCP-over-HTTP matrix. The endpoint is bearer-token gated, runs each
// request in the caller's scope against that user's file-backed DB, and exposes
// the same tools as the Phase 0 stdio server.
//
// Approach note: happy paths use the real MCP SDK client (Client +
// StreamableHTTPClientTransport). Because the server is exercised in-process via
// Hono's app.request (there is no listening socket), the transport is given a
// custom `fetch` that proxies to app.request. Auth/guard/method cases use raw
// JSON-RPC with the MCP-Protocol-Version header, since those responses never
// reach an SDK client session.
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { app } from '../src/http/app.js';
import { resetMcpThrottles } from '../src/http/mcp.js';
import * as session from '../src/http/session.js';
import * as auth from '../src/boxes/auth/index.js';
import * as scope from '../src/boxes/scope/index.js';
import * as userdb from '../src/boxes/userdb/index.js';
import * as shared from '../src/boxes/shared/index.js';
import { userDbPath } from '../src/boxes/paths.js';
import snapshot from './fixtures/mcp-tools.snapshot.json';

const HOST = '127.0.0.1:3000';
const MCP_URL = `http://${HOST}/mcp`;
const TMP_BASE = '/tmp/opencode';
const COST = { kdfCost: { N: 16, r: 8, p: 1 } };
const PASSPHRASE = 'a long shared test passphrase';
const UNAUTHORIZED = {
  jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Unauthorized' },
};

// Mirrors the mutating/destructive classification in src/mcp/tools.ts. Part of
// the tool contract: annotations advertised to clients must match this.
const MUTATING = new Set([
  'deck_create', 'deck_delete', 'deck_update', 'card_add', 'card_update',
  'card_schedule', 'card_delete', 'quiz_create', 'quiz_add_questions',
  'quiz_update', 'quiz_delete', 'question_update', 'question_delete', 'answer_grade',
  'shared_quiz_publish', 'shared_quiz_unpublish', 'shared_quiz_import',
]);
const DESTRUCTIVE = new Set([
  'deck_delete', 'card_delete', 'quiz_delete', 'question_delete', 'answer_grade',
  'shared_quiz_unpublish',
]);

let tmp = '';
let oldDir: string | undefined;
let oldPort: string | undefined;
let adminId = 0;
let friendId = 0;
let isoAId = 0;
let isoBId = 0;
let adminKeys: scope.UserKeys;
let writeToken = '';
let readToken = '';
let friendWriteToken = '';
let revokedToken = '';
let disabledToken = '';
let isoTokenA = '';
let isoTokenB = '';

beforeAll(async () => {
  oldDir = process.env.DATA_DIR;
  oldPort = process.env.PORT;
  process.env.PORT = '3000';
  tmp = mkdtempSync(join(TMP_BASE, 'ms-mcp-'));
  process.env.DATA_DIR = tmp;
  auth.open(join(tmp, 'auth.db'));
  auth.migrate();
  shared.open(join(tmp, 'shared.db'));
  shared.migrate();

  const admin = await auth.createUser({ username: 'mcpadmin', passphrase: PASSPHRASE, admin: true, ...COST });
  const friend = await auth.createUser({ username: 'mcpfriend', passphrase: PASSPHRASE, admin: false, ...COST });
  const isoA = await auth.createUser({ username: 'mcpisousera', passphrase: PASSPHRASE, admin: false, ...COST });
  const isoB = await auth.createUser({ username: 'mcpisouserb', passphrase: PASSPHRASE, admin: false, ...COST });
  const disabledUser = await auth.createUser({ username: 'mcpdisabled', passphrase: PASSPHRASE, admin: false, ...COST });
  adminId = admin.user.id;
  friendId = friend.user.id;
  isoAId = isoA.user.id;
  isoBId = isoB.user.id;

  const a = await auth.login('mcpadmin', PASSPHRASE, undefined, COST);
  const b = await auth.login('mcpfriend', PASSPHRASE, undefined, COST);
  const ia = await auth.login('mcpisousera', PASSPHRASE, undefined, COST);
  const ib = await auth.login('mcpisouserb', PASSPHRASE, undefined, COST);
  const d = await auth.login('mcpdisabled', PASSPHRASE, undefined, COST);
  adminKeys = a.keys;

  writeToken = auth.createAgentToken(adminId, 'rw', 'write', a.keys).token;
  readToken = auth.createAgentToken(adminId, 'ro', 'read', a.keys).token;
  friendWriteToken = auth.createAgentToken(friendId, 'friend-rw', 'write', b.keys).token;
  isoTokenA = auth.createAgentToken(isoAId, 'iso-a', 'write', ia.keys).token;
  isoTokenB = auth.createAgentToken(isoBId, 'iso-b', 'write', ib.keys).token;
  const rev = auth.createAgentToken(adminId, 'revoked', 'write', a.keys);
  auth.revokeAgentToken(adminId, rev.tokenId);
  revokedToken = rev.token;
  disabledToken = auth.createAgentToken(disabledUser.user.id, 'disabled', 'write', d.keys).token;
  auth.disableUser(disabledUser.user.id);
});

afterAll(() => {
  session.clear();
  userdb.closeAll();
  auth.close();
  shared.close();
  resetMcpThrottles();
  if (oldDir === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = oldDir;
  if (oldPort === undefined) delete process.env.PORT; else process.env.PORT = oldPort;
  rmSync(tmp, { recursive: true, force: true });
});

beforeEach(() => {
  // All in-process requests share ip="unknown", so a failure in one test would
  // otherwise throttle the next. Also ensure no in-memory store fallback can
  // mask a missing scope in the MCP handler.
  resetMcpThrottles();
  scope.clearTestFallback();
});

// --- helpers ----------------------------------------------------------------

async function connect(token: string): Promise<Client> {
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
    requestInit: { headers: { Authorization: `Bearer ${token}`, Host: HOST } },
    // In-process transport: no listening socket, so fetch straight into Hono.
    fetch: async (url, init) => app.request(url, init),
  });
  const client = new Client({ name: 'phase6-test', version: '1.0.0' });
  await client.connect(transport);
  return client;
}

async function rawRpc(body: object, opts: {
  token?: string; headers?: Record<string, string>; method?: string;
} = {}): Promise<Response> {
  const method = opts.method ?? 'POST';
  const headers: Record<string, string> = {
    host: HOST,
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    'mcp-protocol-version': '2025-06-18',
    ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
    ...(opts.headers ?? {}),
  };
  return app.request('/mcp', {
    method,
    headers,
    ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
  });
}

// session.destroy() zeroes the key arrays it is handed, so sessions must get
// copies — never the shared login keys used to mint tokens.
function copyKeys(keys: scope.UserKeys): scope.UserKeys {
  return { enc: new Uint8Array(keys.enc), idx: new Uint8Array(keys.idx) };
}

function toolText(result: unknown): string {
  const r = result as { content?: Array<{ type?: string; text?: string }> };
  const c = r.content?.[0];
  if (!c || c.type !== 'text' || typeof c.text !== 'string') throw new Error('expected a text content block');
  return c.text;
}
function toolJson(result: unknown): Record<string, unknown> {
  return JSON.parse(toolText(result)) as Record<string, unknown>;
}
function deckNames(result: unknown): string[] {
  return (toolJson(result).decks as Array<{ name: string }>).map((d) => d.name);
}
function deckIds(result: unknown): number[] {
  return (toolJson(result).decks as Array<{ id: number }>).map((d) => d.id);
}
const INIT = { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} };

// The golden snapshot is regenerated from the pinned SDK via tools/list, so
// input schemas are compared byte-for-byte (no dialect normalization).

describe('MCP over HTTP — tool parity', () => {
  test('tools/list matches the golden snapshot and every tool advertises hints', async () => {
    const client = await connect(writeToken);
    try {
      const { tools } = await client.listTools();
      const expected = [...snapshot].sort((a, b) => a.name.localeCompare(b.name));
      expect(tools.map((t) => t.name).sort()).toEqual(expected.map((s) => s.name));

      const byName = new Map(tools.map((t) => [t.name, t]));
      for (const s of expected) {
        const t = byName.get(s.name);
        expect(t, `missing tool ${s.name}`).toBeDefined();
        expect(t!.description, `description ${s.name}`).toBe(s.description);
        expect(t!.inputSchema as unknown, `inputSchema ${s.name}`).toEqual(s.inputSchema as unknown);
        expect(t!.annotations, `annotations ${s.name}`).toBeDefined();
        expect(typeof t!.annotations?.readOnlyHint, `readOnlyHint ${s.name}`).toBe('boolean');
        expect(typeof t!.annotations?.destructiveHint, `destructiveHint ${s.name}`).toBe('boolean');
        expect(t!.annotations?.readOnlyHint, `readOnlyHint value ${s.name}`).toBe(!MUTATING.has(s.name));
        expect(t!.annotations?.destructiveHint, `destructiveHint value ${s.name}`).toBe(DESTRUCTIVE.has(s.name));
      }
    } finally {
      await client.close();
    }
  });
});

describe('MCP over HTTP — authentication failures', () => {
  test('all bad-credential shapes return the identical 401 envelope', async () => {
    const secret = writeToken.split('.')[1]!;
    const tokenId = writeToken.slice('msk_'.length).split('.')[0]!;

    const sid = session.create({
      userId: adminId, username: 'mcpadmin', isAdmin: true,
      keys: copyKeys(adminKeys), db: userdb.open(adminId),
    });
    const cases: Array<{ name: string; token?: string; headers?: Record<string, string> }> = [
      { name: 'missing-header' },
      { name: 'malformed-token', headers: { authorization: 'Bearer not-a-token' } },
      { name: 'unknown-token-id', token: `msk_0000000000000000.${secret}` },
      { name: 'wrong-secret', token: `msk_${tokenId}.${'A'.repeat(43)}` },
      { name: 'revoked-token', token: revokedToken },
      { name: 'disabled-user', token: disabledToken },
      { name: 'cookie-only', headers: { cookie: `ms_session=${sid}` } },
    ];
    const bodies: unknown[] = [];
    try {
      for (const c of cases) {
        resetMcpThrottles();
        const res = await rawRpc(INIT, { token: c.token, headers: c.headers });
        expect(res.status, c.name).toBe(401);
        expect(res.headers.get('www-authenticate'), c.name).toBe('Bearer');
        const body = await res.json();
        expect(body, c.name).toEqual(UNAUTHORIZED);
        bodies.push(body);
      }
    } finally {
      session.destroy(sid);
    }
    for (const body of bodies) expect(body).toEqual(bodies[0]);
  });
});

describe('MCP over HTTP — guard rails', () => {
  test('origin, host and method guards return the right statuses', async () => {
    const badOrigin = await rawRpc(INIT, { token: writeToken, headers: { origin: 'http://evil.example' } });
    expect(badOrigin.status).toBe(403);

    const goodOrigin = await rawRpc(INIT, { token: writeToken, headers: { origin: `http://${HOST}` } });
    expect(goodOrigin.status).toBe(200);
    expect((await goodOrigin.json()).result.tools.length).toBeGreaterThan(0);

    const noOrigin = await rawRpc(INIT, { token: writeToken });
    expect(noOrigin.status).toBe(200);
    expect((await noOrigin.json()).result.tools.length).toBeGreaterThan(0);

    const badHost = await app.request('/mcp', {
      method: 'POST',
      headers: {
        host: 'evil.example', 'content-type': 'application/json',
        accept: 'application/json, text/event-stream', authorization: `Bearer ${writeToken}`,
      },
      body: JSON.stringify(INIT),
    });
    expect(badHost.status).toBe(403);

    const get = await rawRpc({}, { method: 'GET' });
    expect(get.status).toBe(405);
    expect((await get.json()).error.code).toBe(-32000);

    const del = await rawRpc({}, { method: 'DELETE' });
    expect(del.status).toBe(405);
    expect((await del.json()).error.code).toBe(-32000);
  });
});

describe('MCP over HTTP — read-only tokens', () => {
  test('mutating tools are hidden and cannot be called with a read token', async () => {
    const client = await connect(readToken);
    try {
      const { tools } = await client.listTools();
      const names = tools.map((t) => t.name);
      for (const m of MUTATING) expect(names).not.toContain(m);
      expect(names).toContain('deck_list');
      expect(names).toContain('card_search');

      const read = await client.callTool({ name: 'deck_list', arguments: {} });
      expect(read.isError).not.toBe(true);

      // The SDK server surfaces unknown tools as an isError result, not a thrown
      // JSON-RPC error. Either outcome proves the tool was not callable.
      const forbidden = await client.callTool({ name: 'deck_create', arguments: { name: 'Forbidden' } });
      expect(forbidden.isError).toBe(true);
      expect(toolText(forbidden)).toContain('deck_create');
    } finally {
      await client.close();
    }
  });
});

describe('MCP over HTTP — scope and isolation', () => {
  test('MCP writes use the caller scope and are visible to that web session', async () => {
    const client = await connect(writeToken);
    let sid = '';
    try {
      const created = await client.callTool({ name: 'deck_create', arguments: { name: 'ScopeDeck', description: 'mcp write' } });
      expect(created.isError).not.toBe(true);
      expect(toolJson(created).name).toBe('ScopeDeck');

      const listed = await client.callTool({ name: 'deck_list', arguments: {} });
      expect(deckNames(listed)).toContain('ScopeDeck');

      // The same user's normal web session reads the same per-user DB.
      sid = session.create({
        userId: adminId, username: 'mcpadmin', isAdmin: true,
        keys: copyKeys(adminKeys), db: userdb.open(adminId),
      });
      const res = await app.request('/api/decks', { headers: { host: HOST, cookie: `ms_session=${sid}` } });
      expect(res.status).toBe(200);
      const body = await res.json() as { decks: Array<{ name: string }> };
      expect(body.decks.map((d) => d.name)).toContain('ScopeDeck');
    } finally {
      await client.close();
      if (sid) session.destroy(sid);
    }
  });

  test('tokens never cross users; identical deck names coexist and calls stay isolated', async () => {
    const a = await connect(isoTokenA);
    const b = await connect(isoTokenB);
    try {
      // Both scopes may own a deck named "Calculus II".
      const aCalc = await a.callTool({ name: 'deck_create', arguments: { name: 'Calculus II' } });
      expect(aCalc.isError).not.toBe(true);
      expect(toolJson(aCalc).name).toBe('Calculus II');
      const bCalc = await b.callTool({ name: 'deck_create', arguments: { name: 'Calculus II' } });
      expect(bCalc.isError).not.toBe(true);

      // B gets two more decks so its "BOnlyDeck" id does not exist in A's DB.
      const bOnly = await b.callTool({ name: 'deck_create', arguments: { name: 'BOnlyDeck' } });
      expect(bOnly.isError).not.toBe(true);
      const bTargetId = toolJson(bOnly).id as number;
      const filler = await b.callTool({ name: 'deck_create', arguments: { name: 'BFiller' } });
      expect(filler.isError).not.toBe(true);

      const aIds = deckIds(await a.callTool({ name: 'deck_list', arguments: {} }));
      expect(aIds).not.toContain(bTargetId);

      // A cannot touch B's deck by numeric id.
      const byId = await a.callTool({
        name: 'card_add', arguments: { deck: bTargetId, cards: [{ front: 'x', back: 'y' }] },
      });
      expect(byId.isError).toBe(true);
      expect(toolJson(byId).code).toBe('NOT_FOUND');

      // A cannot touch B's deck by name.
      const byName = await a.callTool({ name: 'deck_update', arguments: { deck: 'BOnlyDeck', name: 'Hacked' } });
      expect(byName.isError).toBe(true);
      expect(toolJson(byName).code).toBe('NOT_FOUND');

      const aNames = deckNames(await a.callTool({ name: 'deck_list', arguments: {} }));
      const bNames = deckNames(await b.callTool({ name: 'deck_list', arguments: {} }));
      expect(aNames).toContain('Calculus II');
      expect(aNames).not.toContain('BOnlyDeck');
      expect(bNames).toContain('Calculus II');
      expect(bNames).toContain('BOnlyDeck');

      // Interleave two async calls; each lands only in its caller's DB.
      const [ia, ib] = await Promise.all([
        a.callTool({ name: 'deck_create', arguments: { name: 'Interleave-A' } }),
        b.callTool({ name: 'deck_create', arguments: { name: 'Interleave-B' } }),
      ]);
      expect(ia.isError).not.toBe(true);
      expect(ib.isError).not.toBe(true);
      const aNames2 = deckNames(await a.callTool({ name: 'deck_list', arguments: {} }));
      const bNames2 = deckNames(await b.callTool({ name: 'deck_list', arguments: {} }));
      expect(aNames2).toContain('Interleave-A');
      expect(aNames2).not.toContain('Interleave-B');
      expect(bNames2).toContain('Interleave-B');
      expect(bNames2).not.toContain('Interleave-A');
    } finally {
      await a.close();
      await b.close();
    }
  });
});

describe('MCP over HTTP — storage effects', () => {
  test('MCP writes leave no plaintext canary in the file-backed user DB', async () => {
    const canary = `MCP_CANARY_${Math.random().toString(36).slice(2)}`;
    const client = await connect(writeToken);
    try {
      const d = await client.callTool({
        name: 'deck_create', arguments: { name: `${canary} Deck`, description: canary },
      });
      expect(d.isError).not.toBe(true);
      const deckId = toolJson(d).id as number;
      const c = await client.callTool({
        name: 'card_add',
        arguments: { deck: deckId, cards: [{ front: `${canary} front`, back: `${canary} back`, tags: [canary] }] },
      });
      expect(c.isError).not.toBe(true);
    } finally {
      await client.close();
    }

    const db = userdb.open(adminId);
    try {
      db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    } finally {
      userdb.release(adminId);
    }
    const file = userDbPath(adminId);
    for (const p of [file, `${file}-wal`, `${file}-shm`]) {
      if (!existsSync(p)) continue;
      expect(readFileSync(p).includes(Buffer.from(canary)), `${p} leaked the canary`).toBe(false);
    }
  });

  test('an MCP write fires a changes row in the same user DB', async () => {
    const client = await connect(friendWriteToken);
    try {
      const r = await client.callTool({ name: 'deck_create', arguments: { name: 'ChangefeedDeck' } });
      expect(r.isError).not.toBe(true);
      const id = toolJson(r).id as number;

      const db = userdb.open(friendId);
      try {
        const rows = db.prepare(
          "SELECT entity, entity_id, op FROM changes WHERE entity='deck' AND entity_id=? AND op='insert'",
        ).all(id) as Array<{ entity: string; entity_id: number; op: string }>;
        expect(rows.length).toBeGreaterThan(0);
        expect(rows[0]).toMatchObject({ entity: 'deck', entity_id: id, op: 'insert' });
      } finally {
        userdb.release(friendId);
      }
    } finally {
      await client.close();
    }
  });
});

describe('MCP over HTTP — token storage', () => {
  test('failed-auth throttling blocks token work and resetMcpThrottles clears it', async () => {
    resetMcpThrottles();
    for (let i = 0; i < 3; i++) {
      const res = await rawRpc(INIT, { token: `msk_0000000000000000.${'A'.repeat(43)}` });
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual(UNAUTHORIZED);
    }
    // Still throttled: even a valid token is rejected without doing token work.
    const blocked = await rawRpc(INIT, { token: writeToken });
    expect(blocked.status).toBe(401);
    expect(await blocked.json()).toEqual(UNAUTHORIZED);

    resetMcpThrottles();
    const ok = await rawRpc(INIT, { token: writeToken });
    expect(ok.status).toBe(200);
    expect((await ok.json()).result.tools.length).toBeGreaterThan(0);
  });

  test('the token secret is shown once and only its wrap is stored', async () => {
    const created = auth.createAgentToken(adminId, 'one-time', 'write', adminKeys);
    const secret = created.token.split('.')[1]!;

    const list = auth.listAgentTokens(adminId);
    const row = list.find((t) => t.token_id === created.tokenId);
    expect(row).toBeDefined();
    for (const key of ['token', 'wrap', 'salt', 'secret']) {
      expect(row).not.toHaveProperty(key);
    }
    expect(JSON.stringify(list)).not.toContain(secret);
    expect(JSON.stringify(list)).not.toContain(created.token);

    const authFile = join(tmp, 'auth.db');
    for (const p of [authFile, `${authFile}-wal`, `${authFile}-shm`]) {
      if (!existsSync(p)) continue;
      expect(readFileSync(p).includes(Buffer.from(secret)), `${p} leaked the token secret`).toBe(false);
    }
  });
});

describe('MCP over HTTP — shared quiz library', () => {
  test('read-only tokens get shared reads but no publish, import or unpublish', async () => {
    const client = await connect(readToken);
    try {
      const { tools } = await client.listTools();
      const names = tools.map((t) => t.name);
      expect(names).toContain('shared_quiz_list');
      expect(names).toContain('shared_quiz_get');
      for (const mutating of ['shared_quiz_publish', 'shared_quiz_import', 'shared_quiz_unpublish']) {
        expect(names).not.toContain(mutating);
      }
    } finally {
      await client.close();
    }
  });

  test('publish, list, get, import and owner-only unpublish work over MCP', async () => {
    const owner = await connect(writeToken);
    const reader = await connect(friendWriteToken);
    try {
      const created = await owner.callTool({
        name: 'quiz_create',
        arguments: {
          title: 'MCP shared quiz',
          questions: [{
            type: 'mcq', prompt: 'Pick one',
            choices: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correct: 'b',
          }],
        },
      });
      expect(created.isError).not.toBe(true);
      const quizId = toolJson(created).id as number;

      const published = await owner.callTool({ name: 'shared_quiz_publish', arguments: { quiz_id: quizId } });
      expect(published.isError).not.toBe(true);
      const sharedId = toolJson(published).id as number;

      const listed = await reader.callTool({ name: 'shared_quiz_list', arguments: { query: 'MCP shared', mine: false } });
      expect((toolJson(listed).quizzes as Array<{ id: number }>).some((q) => q.id === sharedId)).toBe(true);
      const got = await reader.callTool({ name: 'shared_quiz_get', arguments: { shared_id: sharedId } });
      expect((toolJson(got).questions as unknown[]).length).toBe(1);
      const imported = await reader.callTool({ name: 'shared_quiz_import', arguments: { shared_id: sharedId } });
      expect(toolJson(imported).quizzes_created).toBe(1);

      const forbidden = await reader.callTool({ name: 'shared_quiz_unpublish', arguments: { shared_id: sharedId } });
      expect(forbidden.isError).toBe(true);
      const removed = await owner.callTool({ name: 'shared_quiz_unpublish', arguments: { shared_id: sharedId } });
      expect(removed.isError).not.toBe(true);
    } finally {
      await owner.close();
      await reader.close();
    }
  });
});
