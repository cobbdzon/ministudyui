// One menu definition for the desktop account popover and the mobile More sheet.
// Add new shell actions here so both surfaces stay in sync.
import type { IconName } from './icons.js';

export type ShellTheme = 'light' | 'dark';
export type ShellMenuGroup = 'account' | 'session' | 'app';
export type ShellMenuAction =
  | 'passphrase'
  | 'agent'
  | 'export'
  | 'admin'
  | 'lock'
  | 'import'
  | 'shortcuts'
  | 'theme';

export interface ShellMenuItem {
  id: ShellMenuAction;
  icon: IconName;
  label: string;
  /** Action key dispatched by the shared shell handler. */
  handler: ShellMenuAction;
  group: ShellMenuGroup;
  adminOnly?: boolean;
}

export function shellMenu(theme: ShellTheme): ShellMenuItem[] {
  const next: ShellTheme = theme === 'dark' ? 'light' : 'dark';
  return [
    { id: 'passphrase', icon: 'key', label: 'Change passphrase', handler: 'passphrase', group: 'account' },
    { id: 'agent', icon: 'auto_awesome', label: 'Agent access', handler: 'agent', group: 'account' },
    { id: 'export', icon: 'download', label: 'Export data', handler: 'export', group: 'account' },
    { id: 'admin', icon: 'shield', label: 'Admin panel', handler: 'admin', group: 'account', adminOnly: true },
    { id: 'lock', icon: 'lock', label: 'Lock', handler: 'lock', group: 'session' },
    { id: 'import', icon: 'upload', label: 'Import from AI', handler: 'import', group: 'app' },
    { id: 'shortcuts', icon: 'keyboard', label: 'Keyboard shortcuts', handler: 'shortcuts', group: 'app' },
    {
      id: 'theme',
      icon: next === 'dark' ? 'dark_mode' : 'light_mode',
      label: `Switch to ${next} theme`,
      handler: 'theme',
      group: 'app',
    },
  ];
}

export function visibleShellMenu(items: ShellMenuItem[], isAdmin: boolean): ShellMenuItem[] {
  return items.filter((item) => !item.adminOnly || isAdmin);
}
