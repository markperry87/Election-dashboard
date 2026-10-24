// Scores the frozen election-day forecasts against the 2026 results, using the same
// measures as the 2020 and 2024 retrospective checks, plus riding-level scores.
import raw from './data/results-2026.json';
import {IDS,key,type Party} from './astra-inputs';
import type {AstraResult} from './astra-model';

export type Results = {status: 'pending' | 'preliminary' | 'final'; updatedAt: string | null; source: string; note?: string; seats: Record<Party, number> | null; vote: Record<Party, number> | null; ridings: Record<string, Party>};
export const results = raw as unknown as Results;
export const SEATS = 93;

// The party with the highest win chance in each riding, summed: the model's own
// riding-by-riding call. Exact ties go to the first party in IDS order.
export function favourites(f: AstraResult): Record<Party, number> {
 const count = Object.fromEntries(IDS.map(id => [id, 0])) as Record<Party, number>;
 for (const d of f.districts) count[IDS[d.win.indexOf(Math.max(...d.win))]]++;
 return count;
}

// Seat totals as entered, or counted from riding winners once all ridings are in.
export function actualSeats(r: Results): Record<Party, number> | null {
 if (r.seats) return r.seats;
 const winners = Object.values(r.ridings);
 if (winners.length < SEATS) return null;
 const count = Object.fromEntries(IDS.map(id => [id, 0])) as Record<Party, number>;
 for (const p of winners) count[p]++;
 return count;
}

// Most seats outright, or 'tie' when two or more parties share the top total.
export function seatWinner(seats: Record<Party, number>): Party | 'tie' {
 const top = Math.max(...IDS.map(id => seats[id]));
 const leaders = IDS.filter(id => seats[id] === top);
 return leaders.length === 1 ? leaders[0] : 'tie';
}

export type PartyScore = {id: Party; mean: number; low: number; high: number; favourite: number; actual: number | null; inRange: boolean | null; voteMean: number | null; voteActual: number | null};
export type RidingMiss = {name: string; projected: Party; probability: number; actual: Party; actualProbability: number};
export type ModelScore = {
 parties: PartyScore[];
 seats: null | {winner: Party | 'tie'; winnerProbability: number; brier: number; seatMAE: number; favouriteMAE: number; covered: number; scored: number};
 ridings: null | {called: number; scored: number; brier: number; misses: RidingMiss[]};
 voteMAE: number | null;
 unmatched: string[];
};

export function scoreModel(f: AstraResult, r: Results = results): ModelScore {
 const seats = actualSeats(r), fav = favourites(f);
 // Score the parties and groups that ran candidates, as in the historical checks.
 const scoredIds = IDS.filter(id => f.candidateCounts[id] > 0 || (seats?.[id] ?? 0) > 0);
 const parties: PartyScore[] = scoredIds.map(id => {
  const s = f.seats[id], i = IDS.indexOf(id), actual = seats ? seats[id] : null;
  return {id, mean: s.mean, low: s.low, high: s.high, favourite: fav[id], actual, inRange: actual === null ? null : actual >= s.low && actual <= s.high,
   voteMean: f.popularVote?.share[i]?.mean ?? null, voteActual: r.vote ? r.vote[id] ?? null : null};
 });
 let seatScore: ModelScore['seats'] = null;
 if (seats) {
  const winner = seatWinner(seats);
  const brier = IDS.reduce((s, id) => s + (f.probabilities[id] / 100 - (id === winner ? 1 : 0)) ** 2, 0) + (f.tie / 100 - (winner === 'tie' ? 1 : 0)) ** 2;
  const mae = (pick: (p: PartyScore) => number) => parties.reduce((s, p) => s + Math.abs(pick(p) - p.actual!), 0) / parties.length;
  seatScore = {winner, winnerProbability: winner === 'tie' ? f.tie : f.probabilities[winner], brier, seatMAE: mae(p => p.mean), favouriteMAE: mae(p => p.favourite), covered: parties.filter(p => p.inRange).length, scored: parties.length};
 }
 // Riding scores use whichever ridings have been entered, matched on normalized names.
 const byName = new Map(f.districts.map(d => [key(d.name), d]));
 const unmatched: string[] = [], misses: RidingMiss[] = [];
 let called = 0, scored = 0, brier = 0;
 for (const [name, actual] of Object.entries(r.ridings)) {
  const d = byName.get(key(name));
  if (!d) { unmatched.push(name); continue; }
  const top = d.win.indexOf(Math.max(...d.win)), projected = IDS[top], a = IDS.indexOf(actual);
  scored++;
  brier += d.win.reduce((s, w, i) => s + (w / 100 - (i === a ? 1 : 0)) ** 2, 0);
  if (projected === actual) called++;
  else misses.push({name: d.name, projected, probability: d.win[top], actual, actualProbability: d.win[a] ?? 0});
 }
 const votes = parties.filter(p => p.voteMean !== null && p.voteActual !== null);
 return {
  parties,
  seats: seatScore,
  ridings: scored ? {called, scored, brier: brier / scored, misses: misses.sort((x, y) => y.probability - x.probability)} : null,
  voteMAE: votes.length ? votes.reduce((s, p) => s + Math.abs(p.voteMean! - p.voteActual!), 0) / votes.length : null,
  unmatched,
 };
}
