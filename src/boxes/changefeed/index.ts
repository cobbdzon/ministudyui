import * as store from '../store/index.js';

export function since(id: any): any {
  const rows = store.all('SELECT id, entity, entity_id, op, ts FROM changes WHERE id > ? ORDER BY id', [id || 0]);
  return rows.map((r) => ({ id: r.id, entity: r.entity, entity_id: r.entity_id, op: r.op, ts: r.ts }));
}

export function subscribe(cb: (r: any) => void): () => void {
  let last = (store.get('SELECT COALESCE(MAX(id),0) AS m FROM changes') || { m: 0 }).m;
  const timer = setInterval(() => {
    const rows = since(last);
    for (const r of rows) { last = r.id; try { cb(r); } catch {} }
  }, 1000);
  return () => clearInterval(timer);
}