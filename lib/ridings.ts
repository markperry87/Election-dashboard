// Polymarket riding-level winner markets ("<Riding> British Columbia Legislative
// Assembly Election Winner"). Only some ridings have a market, mostly the
// competitive ones. Each market lists candidates by name, not party.
export type RidingQuote = {name:string; price:number|null; bid:number|null; ask:number|null; volume:number};
export type RidingMarket = {slug:string; riding:string; volume:number; quotes:RidingQuote[]};

const TITLE = /\s*British Columbia Legislative Assembly Election Winner\s*$/i;
export const RIDING_SEARCH = '/public-search?q=' + encodeURIComponent('British Columbia Legislative Assembly Election Winner') + '&events_status=active&limit_per_type=50&search_tags=false&search_profiles=false';
// Markets found on October 19, 2026. Search adds any listed later; these are
// fetched even if search misses them.
export const KNOWN_RIDING_SLUGS = [
 'vancouver-yaletown','vancouver-langara','burnaby-south-metrotown','coquitlam-burke-mountain','maple-ridge-pitt-meadows',
 'richmond-steveston','surrey-city-centre','surrey-fleetwood','surrey-guildford','surrey-newton',
 'courtenay-comox','cowichan-valley','north-island','kelowna-centre','vernon-lumby',
].map(r => r + '-british-columbia-legislative-assembly-election-winner');

export const isRidingEvent = (event: {title?: unknown; slug?: unknown} | null | undefined) =>
 typeof event?.title === 'string' && TITLE.test(event.title) && typeof event.slug === 'string';

const share = (value: unknown): number|null => {
 if (value === null || value === undefined || value === '') return null;
 const n = Number(value);
 return Number.isFinite(n) && n >= 0 && n <= 1 ? n * 100 : null;
};
const list = (value: unknown): unknown[] => { try { const v = typeof value === 'string' ? JSON.parse(value) : value; return Array.isArray(v) ? v : []; } catch { return []; } };

export function parseRidingEvent(event: any): RidingMarket {
 if (!isRidingEvent(event)) throw Error('Not a BC riding market');
 const quotes: RidingQuote[] = (event.markets ?? []).flatMap((m: any) => {
  const name = typeof m.groupItemTitle === 'string' ? m.groupItemTitle.trim() : '';
  if (!name || m.closed) return [];
  const outcomes = list(m.outcomes), prices = list(m.outcomePrices);
  return [{name, price: share(prices[outcomes.indexOf('Yes')]), bid: share(m.bestBid), ask: share(m.bestAsk), volume: Math.max(0, Number(m.volumeNum ?? m.volume) || 0)}];
 });
 if (quotes.filter(q => q.price !== null).length < 2) throw Error('Riding market has fewer than two priced candidates');
 const volume = Math.max(0, Number(event.volume) || 0) || quotes.reduce((s, q) => s + q.volume, 0);
 return {slug: event.slug, riding: event.title.replace(TITLE, '').trim(), volume, quotes};
}
