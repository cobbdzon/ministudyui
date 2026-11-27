// Local administration CLI. One-time secrets (recovery key, invite code, agent
// token) are printed to stdout exactly once and are never persisted.
import { writeFileSync, readFileSync, readSync } from 'node:fs';
import * as auth from '../src/boxes/auth/index.js';
import * as scope from '../src/boxes/scope/index.js';
import * as userdb from '../src/boxes/userdb/index.js';
import * as exporter from '../src/boxes/export/index.js';
import * as shared from '../src/boxes/shared/index.js';
import { ensureDataDir, dataDir } from '../src/boxes/paths.js';

const KDF = { kdfCost: { N: 2 ** 17, r: 8, p: 1 } };

function args(): { command: string; flags: Record<string, string | boolean> } {
  const [command, ...rest] = process.argv.slice(2);
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = rest[i + 1];
    if (next && !next.startsWith('--')) { flags[key] = next; i++; }
    else flags[key] = true;
  }
  return { command: command ?? '', flags };
}

function promptHidden(label: string): string {
  const env = process.env.MINISTUDY_PASSPHRASE;
  if (env && label.toLowerCase().includes('passphrase')) return env;
  if (!process.stdin.isTTY) throw new Error('No TTY: set MINISTUDY_PASSPHRASE for non-interactive use');
  const stdin = process.stdin as typeof process.stdin & { setRawMode?: (v: boolean) => void };
  process.stdout.write(`${label}: `);
  stdin.setRawMode?.(true);
  let value = '';
  // Read synchronously from fd 0 one byte at a time.
  try {
    while (true) {
      const b = Buffer.alloc(1);
      const n = readSync(0, b, 0, 1, null);
      if (n === 0) break;
      const ch = b[0]!;
      if (ch === 13 || ch === 10) break;
      if (ch === 3) throw new Error('cancelled');
      if (ch === 127 || ch === 8) value = value.slice(0, -1);
      else if (ch >= 32) value += String.fromCharCode(ch);
    }
  } finally {
    stdin.setRawMode?.(false);
    process.stdout.write('\n');
  }
  return value;
}

function promptVisible(label: string): string {
  process.stdout.write(`${label}: `);
  return readFileSync(0, 'utf8').split(/\r?\n/)[0]!.trim();
}

function findUser(name: string) {
  const users = auth.listUsers();
  const u = users.find((x) => x.username.toLowerCase() === name.toLowerCase());
  if (!u) throw new Error(`Unknown user: ${name}`);
  return u;
}

async function main(): Promise<void> {
  ensureDataDir();
  auth.open();
  auth.migrate();
  shared.open();
  shared.migrate();
  const { command, flags } = args();
  const userName = String(flags.user ?? '');

  switch (command) {
    case 'create': {
      if (auth.hasUsers() && !flags.admin) throw new Error('Only the first user can be admin; create invites instead');
      const username = userName || promptVisible('Username');
      const passphrase = promptHidden('Passphrase');
      const created = await auth.createUser({ username, passphrase, admin: !auth.hasUsers(), ...KDF });
      console.log(`created ${created.user.username} (id ${created.user.id})`);
      console.log(`RECOVERY KEY (shown once): ${created.recoveryKey}`);
      break;
    }
    case 'list':
      console.log(JSON.stringify(auth.listUsers(), null, 2));
      break;
    case 'passwd': {
      const user = findUser(userName);
      await auth.changePassphrase(user.id, promptHidden('Current passphrase'), promptHidden('New passphrase'), KDF);
      console.log('passphrase changed');
      break;
    }
    case 'recovery-reset': {
      const recovery = promptVisible('Recovery key');
      const passphrase = promptHidden('New passphrase');
      const r = await auth.recoverWithKey(recovery, passphrase, KDF);
      console.log(`passphrase reset for ${r.username}`);
      break;
    }
    case 'invite-create': {
      const admin = findUser(userName);
      const ttl = flags.ttl ? Number(flags.ttl) : undefined;
      const invite = await auth.createInvite(admin.id, ttl);
      console.log(`INVITE (shown once): ${invite.code}`);
      console.log(`expires ${invite.expiresAt}`);
      break;
    }
    case 'invite-list':
      console.log(JSON.stringify(auth.listInvites(), null, 2));
      break;
    case 'disable':
    case 'enable': {
      const user = findUser(userName);
      if (command === 'disable') auth.disableUser(user.id); else auth.enableUser(user.id);
      console.log(`${user.username} ${command}d`);
      break;
    }
    case 'delete': {
      const user = findUser(userName);
      auth.deleteUser(user.id);
      shared.deleteAllForUser(user.id);
      console.log(`deleted ${user.username} and its database`);
      break;
    }
    case 'token-create': {
      const user = findUser(userName);
      const passphrase = promptHidden('Passphrase');
      const unlocked = await auth.login(user.username, passphrase, 'cli', KDF);
      const label = String(flags.label ?? 'CLI token');
      const mode = flags['read-only'] ? 'read' : 'write';
      const token = auth.createAgentToken(user.id, label, mode, unlocked.keys);
      console.log(`AGENT TOKEN (shown once): ${token.token}`);
      console.log(`mode ${token.mode}, label ${token.label}`);
      break;
    }
    case 'token-list': {
      const user = findUser(userName);
      console.log(JSON.stringify(auth.listAgentTokens(user.id), null, 2));
      break;
    }
    case 'token-revoke': {
      const user = findUser(userName);
      auth.revokeAgentToken(user.id, String(flags.id ?? ''));
      console.log('token revoked');
      break;
    }
    case 'export': {
      const user = findUser(userName);
      const passphrase = promptHidden('Passphrase');
      const unlocked = await auth.login(user.username, passphrase, 'cli', KDF);
      const db = userdb.open(user.id);
      try {
        const bundle = scope.run({ userId: user.id, db, keys: unlocked.keys }, () => exporter.bundle());
        const file = String(flags.out ?? `ministudy-export-${user.username}.json`);
        writeFileSync(file, JSON.stringify(bundle, null, 2));
        console.log(`wrote plaintext export to ${file}`);
      } finally { userdb.release(user.id); }
      break;
    }
    default:
      throw new Error(`Unknown command: ${command || '(none)'}`);
  }
}

main().catch((e) => {
  console.error(`user: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
}).finally(() => { auth.close(); shared.close(); });
