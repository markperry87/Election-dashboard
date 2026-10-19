import type {Dashboard, Source} from './election';

export const sourceKeys = ['poly', 'kalshi', 'model', 'northern', 'taylor', 'voteScope', 'ridings', 'astra', 'opus'] as const;
export const browserSnapshotKey = 'bc-election-watch:snapshot:v1';
const stamp = (value: string) => Date.parse(value) || 0;

// Compare each feed's successful fetch time, never the time of a failed check.
export function newerSource<T>(current: Source<T>, incoming: Source<T>): Source<T> {
 const a = stamp(current.fetchedAt), b = stamp(incoming.fetchedAt);
 // A plain saved copy of the same fetch must not mark a live result as stale;
 // a failed refresh (which carries an error) still replaces it.
 if (b > a || b === a && (incoming.live || incoming.error !== undefined || !current.live)) return incoming;
 if (b === a) return current;
 return {...current, live: false, error: incoming.error ?? 'The refresh returned an older snapshot. Keeping the newer saved figures.', retryAt: incoming.retryAt};
}
export function mergeSnapshots(current: Dashboard, incoming: Dashboard): Dashboard {
 const result = {...current, checkedAt: stamp(incoming.checkedAt) > stamp(current.checkedAt) ? incoming.checkedAt : current.checkedAt};
 for (const key of sourceKeys) {
  // Forecast results from different model versions are not interchangeable.
  if ((key === 'astra' || key === 'opus') && incoming[key].data.version !== current[key].data.version) continue;
  (result as any)[key] = newerSource(current[key] as Source<unknown>, incoming[key] as Source<unknown>);
 }
 return result;
}
export function savedSnapshot(data: Dashboard): Dashboard {
 const result = {...data};
 for (const key of sourceKeys) (result as any)[key] = {...data[key], live: false};
 return result;
}

// Saved data is optional: reject malformed/incompatible records, then use the
// server snapshot. Validate the stable fields used by the dashboard renderer.
export function validSource(value: any, key: typeof sourceKeys[number]): boolean {
 if (!value || !Number.isFinite(Date.parse(value.fetchedAt)) || typeof value.live !== 'boolean' || !value.data) return false;
 if (value.error !== undefined && typeof value.error !== 'string') return false;
 if (value.retryAt !== undefined && !Number.isFinite(Date.parse(value.retryAt))) return false;
 const d = value.data;
 const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
 const quote = (v: unknown) => v === null || num(v);
 if (key === 'poly' || key === 'kalshi') return Array.isArray(d) && ['ndp','con'].every(id => d.some(q => q.id === id)) && d.every(q => q && typeof q.id === 'string' && typeof q.status === 'string' && num(q.volume) && quote(q.price) && quote(q.bid) && quote(q.ask));
 if (key === 'model') return ['indexodds','indexoutcome'].every(k => d[k] && typeof d[k].date === 'string' && Array.isArray(d[k].dates) && d[k].dates.every((v: unknown) => typeof v === 'string') && Array.isArray(d[k].parties) && d[k].parties.length && d[k].parties.every((p: any) => p && typeof p.label === 'string' && num(p.value) && Array.isArray(p.values) && p.values.every(num)));
 if (key === 'ridings') return Array.isArray(d) && d.every((m: any) => m && typeof m.slug === 'string' && typeof m.riding === 'string' && num(m.volume) && Array.isArray(m.quotes) && m.quotes.every((q: any) => q && typeof q.name === 'string' && quote(q.price) && quote(q.bid) && quote(q.ask) && num(q.volume)));
 if (key === 'northern' || key === 'taylor' || key === 'voteScope') return typeof d.date === 'string' && d.probabilities && num(d.probabilities.con) && num(d.probabilities.ndp);
 if (key === 'opus' && !(Array.isArray(d.houseEffects) && d.houseEffects.every((h: {firm?: unknown; polls?: unknown} | null) => h && typeof h.firm === 'string' && num(h.polls)))) return false;
 const ids = ['con','ndp','green','one','centre','other'];
 return typeof d.version === 'string' && typeof d.date === 'string' && num(d.tie) && d.probabilities && d.seats && d.candidateCounts && ids.every(id => num(d.probabilities[id]) && num(d.candidateCounts[id]) && d.seats[id] && ['mean','low','high','majority'].every(k => num(d.seats[id][k]))) && Array.isArray(d.pollAverage) && d.pollAverage.every(num) && Array.isArray(d.polls) && d.polls.every((p: any) => p && typeof p.firm === 'string' && (p.n === null || num(p.n)) && Array.isArray(p.shares) && p.shares.every(quote) && Array.isArray(p.sources) && p.sources.every((s: unknown) => typeof s === 'string')) && Array.isArray(d.districts) && d.districts.every((r: any) => r && typeof r.name === 'string' && Array.isArray(r.win) && r.win.length === 6 && r.win.every(num));
}
export function decodeSnapshot(raw: string | null): Dashboard | null {
 try {
  const value = JSON.parse(raw ?? 'null');
  if (value?.version !== 1 || !Number.isFinite(Date.parse(value.data?.checkedAt)) || !sourceKeys.every(key => validSource(value.data[key], key))) return null;
  return value.data;
 } catch { return null; }
}
export function encodeSnapshot(data: Dashboard): string { return JSON.stringify({version: 1, data}); }
