// First-initialization seed: create DATA_DIR/auth.db with the auth schema and
// no users. Creates no study data; the first user is created by setup/CLI/migrate.
import * as auth from '../src/boxes/auth/index.js';
import * as shared from '../src/boxes/shared/index.js';
import { dataDir, ensureDataDir } from '../src/boxes/paths.js';

ensureDataDir();
auth.open();
auth.migrate();
auth.close();
shared.open();
shared.migrate();
shared.close();
console.log(`seed: ${dataDir()}/auth.db and shared.db are ready (no users added).`);
