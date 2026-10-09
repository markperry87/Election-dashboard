import {env} from 'cloudflare:workers';
import {initialData, type Dashboard} from './election';
import {mergeSnapshots, savedSnapshot, sourceKeys, validSource} from './snapshots';

export async function readDashboardSnapshot(): Promise<Dashboard> {
 let snapshot = initialData;
 try {
  if (!env.DB) return snapshot;
  const rows = await env.DB.prepare('SELECT id, payload FROM election_snapshots').all<{id: string; payload: string}>();
  const candidate = {...initialData};
  for (const row of rows.results) {
   const key = sourceKeys.find(key => row.id === 'v1:' + key);
   if (!key) continue;
   try { const source = JSON.parse(row.payload); if (validSource(source, key)) (candidate as any)[key] = source; } catch { /* Ignore an unusable record independently of other feeds. */ }
  }
  candidate.checkedAt = sourceKeys.map(key => candidate[key].fetchedAt).sort().at(-1)!;
  snapshot = mergeSnapshots(snapshot, candidate);
 } catch { console.warn('Saved election snapshots unavailable'); }
 return savedSnapshot(snapshot);
}
export async function saveDashboardSnapshot(data: Dashboard): Promise<void> {
 try {
  const db=env.DB;
  if (!db) return;
  await db.batch(sourceKeys.map(key => db.prepare(
   'INSERT INTO election_snapshots (id, fetched_at, payload) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET fetched_at = excluded.fetched_at, payload = excluded.payload WHERE excluded.fetched_at >= election_snapshots.fetched_at'
  ).bind('v1:' + key, data[key].fetchedAt, JSON.stringify(data[key]))));
 } catch { console.warn('Election snapshot save unavailable'); }
}
