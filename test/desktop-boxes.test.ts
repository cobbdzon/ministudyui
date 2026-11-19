import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPaths } from '../desktop/boxes/paths/index.js';
import { createServerHost, type StartInput } from '../desktop/boxes/server-host/index.js';
import { windowPolicy } from '../desktop/boxes/window/index.js';

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

describe('desktop boxes', () => {
  it('paths puts the DB in userData and creates the directory', () => {
    const base = mkdtempSync(join(tmpdir(), 'ms-paths-'));
    const userData = join(base, 'deep', 'user-data');
    dirs.push(base);
    const paths = createPaths({ userData });
    expect(paths.dbPath).toBe(join(userData, 'ministudy.db'));
    expect(paths.userData).toBe(userData);
  });

  it('server-host starts in-process on the injected port and stops it', () => {
    let received: StartInput | undefined;
    let stopped = false;
    const host = createServerHost({
      dbPath: '/tmp/fake.db',
      findPort: () => 43210,
      start: (input) => {
        received = input;
        return { port: input.port, server: { stop: () => { stopped = true; } } };
      },
    });
    const server = host.start();
    expect(received).toEqual({ port: 43210, dbPath: '/tmp/fake.db', serveDist: true });
    expect(server.port).toBe(43210);
    expect(server.url).toBe('http://127.0.0.1:43210');
    server.stop();
    expect(stopped).toBe(true);
  });

  it('window policy blocks all navigation except our origin and disables RPC', () => {
    const policy = windowPolicy({ url: 'http://127.0.0.1:43210/', token: 'secret' });
    expect(policy.url).toBe('http://127.0.0.1:43210/?token=secret');
    expect(policy.sandbox).toBe(true);
    expect(JSON.parse(policy.navigationRules)).toEqual([
      '^*',
      'http://127.0.0.1:43210/*',
    ]);
  });
});
