// Resolves the writable per-install locations for the desktop app.
// Platform libs stay in the composition root; this box takes a port.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export interface PathsPorts {
  userData: string;
}

export interface Paths {
  userData: string;
  dbPath: string;
}

export function createPaths(ports: PathsPorts): Paths {
  mkdirSync(ports.userData, { recursive: true });
  return {
    userData: ports.userData,
    dbPath: join(ports.userData, 'ministudy.db'),
  };
}
