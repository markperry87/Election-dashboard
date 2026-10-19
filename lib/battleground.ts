import {IDS, key, type Party} from './astra-inputs';
import type {AstraResult} from './astra-model';
import {samePerson, type OpusResult} from './opus-model';
import type {RidingMarket} from './ridings';

// Compares Polymarket's riding markets with Astra and Opus in the same ridings.
export const BATTLEGROUND = {
 minVolume: 500,   // US$ traded; thinner markets are listed but not counted
 minMatched: 80,   // % of the market's price mass that must map to known candidates
 wideSpread: 10,   // points between bid and ask on the favourite: flagged
 maxSpread: 30,    // wider than this, the favourite has no real market: not counted
};
export type RidingComparison = {
 riding: string; slug: string; volume: number;
 market: Record<Party, number>;   // rescaled to 100% over matched candidates
 astra: Record<Party, number>; opus: Record<Party, number>;
 favourite: {name: string; party: Party; value: number; spread: number|null};
 overround: number;               // raw price total minus 100
 counted: boolean; note?: string;
};
export type Battleground = {
 ridings: RidingComparison[];
 counted: number; unmatched: string[];
 seats: Record<'market'|'astra'|'opus', Record<Party, number>>;
 disagreements: (RidingComparison & {gap: number; modelCon: number})[];
};
// Polymarket pre-lists placeholder outcomes ("Person A"…"Person Z", "Other")
// with no trades and an empty book (bid 0, ask 100). Their 50% "midpoint" is
// meaningless, so they are left out entirely.
export const placeholder = (q: {name: string; price: number|null; bid: number|null; ask: number|null; volume: number}) =>
 /^(Person [A-Z]{1,2}|Other)$/i.test(q.name) || q.volume === 0 && (q.bid ?? 0) <= 0 && (q.ask ?? 100) >= 100;
const zero = () => Object.fromEntries(IDS.map(p => [p, 0])) as Record<Party, number>;
const byParty = (win: number[]) => Object.fromEntries(IDS.map((p, i) => [p, win[i] ?? 0])) as Record<Party, number>;
// Midpoint of the order book when both sides are quoted, otherwise the last price.
export const quoteValue = (q: {price: number|null; bid: number|null; ask: number|null}) =>
 q.bid !== null && q.ask !== null && q.ask >= q.bid ? (q.bid + q.ask) / 2 : q.price;

export function battleground(markets: RidingMarket[], astra: AstraResult, opus: OpusResult): Battleground {
 const ridings: RidingComparison[] = [], unmatched: string[] = [];
 for (const m of markets) {
  const a = astra.districts.find(d => key(d.name) === key(m.riding)), o = opus.districts.find(d => key(d.name) === key(m.riding));
  if (!a || !o) { unmatched.push(m.riding); continue; }
  const raw = m.quotes.filter(q => !placeholder(q)).map(q => ({q, value: quoteValue(q), who: a.candidates.find(c => samePerson(c.name, q.name))}));
  const total = raw.reduce((s, r) => s + (r.value ?? 0), 0);
  const matched = raw.filter(r => r.value !== null && r.who);
  const matchedTotal = matched.reduce((s, r) => s + r.value!, 0);
  if (!matchedTotal) { unmatched.push(m.riding); continue; }
  const market = zero();
  for (const r of matched) market[r.who!.party] += r.value! / matchedTotal * 100;
  const top = [...matched].sort((x, y) => y.value! - x.value!)[0];
  const spread = top.q.bid !== null && top.q.ask !== null && top.q.ask >= top.q.bid ? top.q.ask - top.q.bid : null;
  const notes: string[] = [];
  if (m.volume < BATTLEGROUND.minVolume) notes.push('Too little trading to count');
  if (matchedTotal / total * 100 < BATTLEGROUND.minMatched) notes.push('Some candidates could not be matched to the Elections BC list');
  if (spread !== null && spread > BATTLEGROUND.maxSpread) notes.push(`No real market on the favourite (bid/ask ${spread.toFixed(0)} points apart)`);
  else if (spread !== null && spread > BATTLEGROUND.wideSpread) notes.push(`Wide bid/ask spread (${spread.toFixed(0)} points)`);
  const counted = m.volume >= BATTLEGROUND.minVolume && matchedTotal / total * 100 >= BATTLEGROUND.minMatched && !(spread !== null && spread > BATTLEGROUND.maxSpread);
  ridings.push({riding: a.name, slug: m.slug, volume: m.volume, market, astra: byParty(a.win), opus: byParty(o.win),
   favourite: {name: top.who!.name, party: top.who!.party, value: market[top.who!.party], spread}, overround: total - 100, counted, ...(notes.length ? {note: notes.join('. ')} : {})});
 }
 const seats = {market: zero(), astra: zero(), opus: zero()};
 for (const r of ridings.filter(r => r.counted)) for (const p of IDS) for (const s of ['market', 'astra', 'opus'] as const) seats[s][p] += r[s][p] / 100;
 const disagreements = ridings.filter(r => r.counted).map(r => {const modelCon = (r.astra.con + r.opus.con) / 2; return {...r, modelCon, gap: r.market.con - modelCon};})
  .sort((x, y) => Math.abs(y.gap) - Math.abs(x.gap));
 return {ridings: ridings.sort((x, y) => x.riding.localeCompare(y.riding)), counted: ridings.filter(r => r.counted).length, unmatched, seats, disagreements};
}
