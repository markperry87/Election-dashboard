import {env} from 'cloudflare:workers';
import {initialData, type Dashboard, type Source} from './election';
import {mergeSnapshots, savedSnapshot, sourceKeys, validSource} from './snapshots';

export async function readDashboardSnapshot(): Promise<Dashboard> {
 let snapshot = initialData;
 try {
  if (!env.DB) return snapshot;
  const rows = await env.DB.prepare("SELECT id, payload FROM election_snapshots WHERE id LIKE 'v1:%'").all<{id: string; payload: string}>();
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
// Write only feeds with a newer successful fetch than the stored copy.
export async function saveDashboardSnapshot(data: Dashboard, saved?: Dashboard): Promise<void> {
 try {
  const db=env.DB;
  if (!db) return;
  const changed = sourceKeys.filter(key => !saved || Date.parse(data[key].fetchedAt) > Date.parse(saved[key].fetchedAt));
  if (!changed.length) return;
  await db.batch(changed.map(key => db.prepare(
   'INSERT INTO election_snapshots (id, fetched_at, payload) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET fetched_at = excluded.fetched_at, payload = excluded.payload WHERE excluded.fetched_at >= election_snapshots.fetched_at'
  ).bind('v1:' + key, data[key].fetchedAt, JSON.stringify(data[key]))));
 } catch { console.warn('Election snapshot save unavailable'); }
}

// Last successful market history, so a failed refresh falls back to recent
// observations rather than the bundled seed.
export async function readHistorySnapshot<T>(name: string): Promise<Source<T> | null> {
 try {
  if (!env.DB) return null;
  const row = await env.DB.prepare('SELECT payload FROM election_snapshots WHERE id = ?').bind('history-v1:' + name).first<{payload: string}>();
  return row ? JSON.parse(row.payload) as Source<T> : null;
 } catch { console.warn('Saved market history unavailable'); return null; }
}
export async function saveHistorySnapshot<T>(name: string, source: Source<T>): Promise<void> {
 try {
  if (!env.DB) return;
  await env.DB.prepare(
   'INSERT INTO election_snapshots (id, fetched_at, payload) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET fetched_at = excluded.fetched_at, payload = excluded.payload WHERE excluded.fetched_at >= election_snapshots.fetched_at'
  ).bind('history-v1:' + name, source.fetchedAt, JSON.stringify(source)).run();
 } catch { console.warn('Market history save unavailable'); }
}
