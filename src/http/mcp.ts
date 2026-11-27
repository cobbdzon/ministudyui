// Streamable HTTP MCP endpoint. Stateless Web-Standard transport, bearer
// agent-token auth, per-request server with the caller's scope.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { Context } from 'hono';
import * as auth from '../boxes/auth/index.js';
import * as scope from '../boxes/scope/index.js';
import * as vault from '../boxes/vault/index.js';
import * as userdb from '../boxes/userdb/index.js';
import { registerTools } from '../mcp/tools.js';
import { config } from './config.js';

const TOKEN_RE = /^Bearer (msk_[0-9a-f]{16}\.[A-Za-z0-9_-]{43})$/;
const failed = new Map<string, { count: number; until: number }>();
const BASE_MS = 1000;
const AFTER = 3;

function throttleBlocked(ip: string): boolean {
  const f = failed.get(ip);
  return !!f && f.count >= AFTER && f.until > Date.now();
}
function throttleFail(ip: string): void {
  const count = (failed.get(ip)?.count ?? 0) + 1;
  failed.set(ip, { count, until: Date.now() + Math.min(60_000, BASE_MS * 2 ** (count - 1)) });
  if (failed.size > 1000) failed.clear();
}
function throttleReset(ip: string): void { failed.delete(ip); }

export function resetMcpThrottles(): void { failed.clear(); }

function unauthorized(c: Context): Response {
  return c.json(
    { jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Unauthorized' } },
    401,
    { 'WWW-Authenticate': 'Bearer' },
  );
}

export async function handleMcp(c: Context): Promise<Response> {
  if (c.req.method === 'GET' || c.req.method === 'DELETE') {
    return c.json({ jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Method not allowed' } }, 405);
  }
  const origin = c.req.header('origin');
  if (origin && !config.isAllowedOrigin(origin)) {
    return c.json({ jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Forbidden origin' } }, 403);
  }
  const ip = config.trustProxy
    ? c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    : (c.env as { requestIP?: (r: Request) => { hostname: string } } | undefined)?.requestIP?.(c.req.raw)?.hostname ?? 'unknown';
  if (throttleBlocked(ip)) return unauthorized(c);

  const match = TOKEN_RE.exec(c.req.header('authorization') ?? '');
  if (!match) { throttleFail(ip); return unauthorized(c); }
  let unlocked: ReturnType<typeof auth.unlockWithAgentToken>;
  try {
    unlocked = auth.unlockWithAgentToken(match[1]!);
  } catch {
    throttleFail(ip);
    return unauthorized(c);
  }
  throttleReset(ip);

  const db = userdb.open(unlocked.userId);
  const server = new McpServer(
    { name: 'ministudyui', version: '0.1.0' },
    // Advisory from GHSA-46jr-4wx8-v453: the patched SDK still needs this set.
    { maxToolInputElements: 10_000 },
  );
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
    enableJsonResponse: true,
    maxRequestBodySize: 2 * 1024 * 1024,
  });
  try {
    registerTools(server, { readOnly: unlocked.mode === 'read', username: unlocked.username });
    await server.connect(transport);
    return await scope.run(
      { userId: unlocked.userId, db, keys: unlocked.keys },
      () => transport.handleRequest(c.req.raw),
    );
  } finally {
    await transport.close().catch(() => undefined);
    await server.close().catch(() => undefined);
    userdb.release(unlocked.userId);
    // Unwrapped agent keys exist only for this request.
    vault.zero(unlocked.keys.enc);
    vault.zero(unlocked.keys.idx);
  }
}
