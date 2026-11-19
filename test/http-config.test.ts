import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { app, configureHttp } from '../src/http/app.js';
import * as store from '../src/boxes/store/index.js';

beforeEach(() => {
  store.close();
  store.open(':memory:');
  store.migrate();
});
afterEach(() => {
  configureHttp({});
  store.close();
});

describe('runtime http configuration', () => {
  it('accepts a non-default port when configured', async () => {
    configureHttp({ port: 3101 });
    const res = await app.request('/api/stats', { headers: { host: '127.0.0.1:3101' } });
    expect(res.status).toBe(200);
  });

  it('still rejects a host on a different port', async () => {
    configureHttp({ port: 3101 });
    const res = await app.request('/api/stats', { headers: { host: '127.0.0.1:3000' } });
    expect(res.status).toBe(403);
  });

  it('requires the configured per-launch token on API requests', async () => {
    configureHttp({ port: 3101, token: 'launch-secret' });
    const bad = await app.request('/api/stats', { headers: { host: '127.0.0.1:3101' } });
    expect(bad.status).toBe(403);
    const ok = await app.request('/api/stats', {
      headers: { host: '127.0.0.1:3101', 'x-ministudy-token': 'launch-secret' },
    });
    expect(ok.status).toBe(200);
    const viaQuery = await app.request('/api/stats?token=launch-secret', {
      headers: { host: '127.0.0.1:3101' },
    });
    expect(viaQuery.status).toBe(200);
  });

  it('does not require a token for static assets', async () => {
    configureHttp({ port: 3101, token: 'launch-secret' });
    const res = await app.request('/', { headers: { host: '127.0.0.1:3101' } });
    expect(res.status).toBe(200);
  });

  it('accepts an explicit loopback host/origin set', async () => {
    configureHttp({ port: 3101, hosts: ['[::1]:3101'], origins: ['http://[::1]:3101'] });
    const ok = await app.request('/api/stats', {
      headers: { host: '[::1]:3101', origin: 'http://[::1]:3101' },
    });
    expect(ok.status).toBe(200);
    const bad = await app.request('/api/stats', {
      headers: { host: '[::1]:3101', origin: 'http://example.com' },
    });
    expect(bad.status).toBe(403);
  });
});
