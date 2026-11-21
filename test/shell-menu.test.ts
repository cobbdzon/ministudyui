import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { shellMenu, visibleShellMenu } from '../web/shell-menu.js';

describe('shared shell menu', () => {
  test('defines every account action and filters admin-only rows', () => {
    const items = shellMenu('light');
    const accountIds = items.filter((item) => item.group !== 'app').map((item) => item.id);
    expect(accountIds).toEqual(['passphrase', 'agent', 'export', 'admin', 'lock']);
    expect(items.find((item) => item.id === 'admin')?.adminOnly).toBe(true);

    const member = visibleShellMenu(items, false);
    expect(member.map((item) => item.id)).not.toContain('admin');
    expect(member.filter((item) => item.group !== 'app').map((item) => item.id))
      .toEqual(['passphrase', 'agent', 'export', 'lock']);

    const admin = visibleShellMenu(items, true);
    expect(admin.map((item) => item.id)).toContain('admin');
  });

  test('the popover and the sheet both render from the shared definition', () => {
    const app = readFileSync('web/app.ts', 'utf8');
    const popover = app.slice(app.indexOf('function accountMenuItem'), app.indexOf('function openAccountMenu'));
    const sheet = app.slice(app.indexOf('function sheetRow'), app.indexOf('/* ---------- Account controls'));
    expect(popover).toMatch(/visibleShellMenu\(shellMenu\(/);
    expect(popover).toMatch(/accountMenuItem\(/);
    expect(sheet).toMatch(/visibleShellMenu\(shellMenu\(/);
    expect(sheet).toMatch(/sheetRow\(/);
  });

  test('the new shell icons exist in the vendored icon set', () => {
    const icons = readFileSync('web/icons.ts', 'utf8');
    for (const name of ['lock', 'key', 'shield']) {
      expect(icons).toContain(`"${name}":`);
    }
  });
});
