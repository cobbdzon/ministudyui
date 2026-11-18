import * as store from '../store/index.js';
import type { ChangeRow } from '../../../shared/types.js';

export function since(id: number): ChangeRow[] {
  return store.all<ChangeRow>(
    'SELECT id, entity, entity_id, op, ts FROM changes WHERE id > ? ORDER BY id',
    [id],
  );
}

// The callback receives the raw change row: `id` is the changes-table cursor,
// while `entity_id` is the id of the changed entity (what the UI wants).
export function subscribe(cb: (r: ChangeRow) => void): () => void {
  let last = store.get<{ m: number }>('SELECT COALESCE(MAX(id),0) AS m FROM changes')?.m ?? 0;
  const timer = setInterval(() => {
    for (const r of since(last)) {
      last = r.id;
      try { cb(r); } catch { /* a bad subscriber must not stop the feed */ }
    }
  }, 1000);
  return () => clearInterval(timer);
}
