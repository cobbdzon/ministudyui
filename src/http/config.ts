// Network/session configuration. Defaults keep the app localhost-only.
export interface HttpConfig {
  port: number;
  bindHost: string;
  publicOrigin?: string;
  allowedHosts: Set<string>;
  trustProxy: boolean;
  secureCookie: boolean;
  sessionTtlMinutes: number;
  maxUserDbMb: number;
  backupKeep: number;
  isAllowedHost(value: string): boolean;
  isAllowedOrigin(value: string): boolean;
}

function csv(value: string | undefined): string[] {
  return (value ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

export function loadConfig(): HttpConfig {
  const port = Number(process.env.PORT || 3000);
  const bindHost = process.env.BIND_HOST || '127.0.0.1';
  const publicOrigin = process.env.PUBLIC_ORIGIN?.replace(/\/$/, '') || undefined;
  let originHost = '';
  if (publicOrigin) {
    try { originHost = new URL(publicOrigin).host; } catch { /* invalid origin is ignored */ }
  }
  const defaults = [`127.0.0.1:${port}`, `localhost:${port}`];
  if (originHost) defaults.push(originHost);
  const allowedHosts = new Set([...defaults, ...csv(process.env.ALLOWED_HOSTS)]);
  const secureCookie = !!publicOrigin && publicOrigin.toLowerCase().startsWith('https://');

  return {
    port, bindHost, publicOrigin, allowedHosts,
    trustProxy: process.env.TRUST_PROXY === '1',
    secureCookie,
    sessionTtlMinutes: Math.max(1, Number(process.env.SESSION_TTL_MINUTES || 720)),
    maxUserDbMb: Math.max(1, Number(process.env.MAX_USER_DB_MB || 512)),
    backupKeep: Math.max(1, Number(process.env.BACKUP_KEEP || 14)),
    isAllowedHost(value: string): boolean { return allowedHosts.has(value.toLowerCase()); },
    isAllowedOrigin(value: string): boolean {
      try { return allowedHosts.has(new URL(value).host.toLowerCase()); } catch { return false; }
    },
  };
}

export const config = loadConfig();

export function clientIp(headers: { get(name: string): string | null }, fallback: string, trustProxy: boolean): string {
  if (!trustProxy) return fallback;
  const forwarded = headers.get('x-forwarded-for');
  if (!forwarded) return fallback;
  return forwarded.split(',')[0]!.trim() || fallback;
}
