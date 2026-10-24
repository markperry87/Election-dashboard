// Checks the forecast scorecard, the entered 2026 results and the freeze script.
// Run after editing lib/data/results-2026.json: node scripts/scorecard-check.mjs
import ts from 'typescript';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const dir = '.sites-runtime/scorecard-check';
fs.rmSync(dir, {recursive: true, force: true});
fs.mkdirSync(dir, {recursive: true});
fs.cpSync('lib/data', dir + '/data', {recursive: true});
for (const name of ['scorecard', 'astra-inputs']) {
 const code = ts.transpile(fs.readFileSync('lib/' + name + '.ts', 'utf8'), {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022})
  .replace(/from (['"])(\.\/[^'"]+)\1/g, (_, q, p) => p.endsWith('.json') ? `from '${p}' with {type:'json'}` : `from '${p}.js'`);
 fs.writeFileSync(`${dir}/${name}.js`, code);
}
const {scoreModel, favourites, actualSeats, seatWinner, results, SEATS} = await import(`../${dir}/scorecard.js`);
const {IDS, key} = await import(`../${dir}/astra-inputs.js`);
const read = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const baseline = read('lib/data/astra-baseline.json').districts;
const names = new Set(baseline.map(d => key(d.name)));

// 1. The entered results are well formed.
assert.ok(['pending', 'preliminary', 'final'].includes(results.status), 'status must be pending, preliminary or final');
assert.ok(results.updatedAt === null || Number.isFinite(Date.parse(results.updatedAt)), 'updatedAt must be null or a date-time');
for (const [name, party] of Object.entries(results.ridings)) {
 assert.ok(names.has(key(name)), `Unknown riding name: ${name}`);
 assert.ok(IDS.includes(party), `Unknown party id for ${name}: ${party}`);
}
assert.equal(new Set(Object.keys(results.ridings).map(key)).size, Object.keys(results.ridings).length, 'A riding is listed twice');
if (results.seats) {
 assert.ok(IDS.every(id => Number.isInteger(results.seats[id]) && results.seats[id] >= 0), 'seats needs a whole number for every party id');
 const total = IDS.reduce((s, id) => s + results.seats[id], 0);
 assert.ok(total <= SEATS, `Seat totals add to ${total}, more than ${SEATS}`);
 if (Object.keys(results.ridings).length === SEATS) {
  const counted = Object.fromEntries(IDS.map(id => [id, Object.values(results.ridings).filter(p => p === id).length]));
  assert.deepEqual(Object.fromEntries(IDS.map(id => [id, results.seats[id]])), counted, 'seats disagree with the riding winners');
 }
}
if (results.vote) {
 const total = IDS.reduce((s, id) => s + (results.vote[id] ?? 0), 0);
 assert.ok(Math.abs(total - 100) < 1.5, `Popular vote adds to ${total.toFixed(1)}%, not about 100%`);
}
if (results.status !== 'pending') assert.ok(actualSeats(results) || Object.keys(results.ridings).length, 'Results are marked entered but contain no seats or ridings');

// 2. Scoring logic, on the seed forecasts with synthetic results.
for (const file of ['lib/data/astra-result.json', 'lib/data/opus-result.json']) {
 const f = read(file).data;
 const fav = favourites(f);
 assert.equal(IDS.reduce((s, id) => s + fav[id], 0), SEATS);
 const call = d => IDS[d.win.indexOf(Math.max(...d.win))];
 const perfect = {status: 'final', updatedAt: null, source: '', seats: null, vote: null, ridings: Object.fromEntries(f.districts.map(d => [d.name, call(d)]))};
 let s = scoreModel(f, perfect);
 assert.deepEqual(actualSeats(perfect), fav, 'Seats are counted from a complete set of ridings');
 assert.equal(s.ridings.called, SEATS);
 assert.equal(s.ridings.misses.length, 0);
 assert.equal(s.seats.favouriteMAE, 0);
 assert.equal(s.unmatched.length, 0);
 // Brier matches the historical checks' formula.
 const winner = seatWinner(fav);
 const brier = IDS.reduce((t, id) => t + (f.probabilities[id] / 100 - (id === winner ? 1 : 0)) ** 2, 0) + (f.tie / 100 - (winner === 'tie' ? 1 : 0)) ** 2;
 assert.ok(Math.abs(s.seats.brier - brier) < 1e-12);
 // One flipped riding is one miss, listed with the model's call and chances.
 const d = f.districts[0], other = IDS.find(id => id !== call(d) && d.candidates.some(c => c.party === id));
 s = scoreModel(f, {...perfect, ridings: {...perfect.ridings, [d.name]: other}});
 assert.equal(s.ridings.called, SEATS - 1);
 assert.deepEqual(s.ridings.misses.map(m => [m.name, m.projected, m.actual]), [[d.name, call(d), other]]);
 // Partial results score ridings but not seat totals; names match loosely.
 s = scoreModel(f, {...perfect, ridings: {[d.name.toUpperCase().replace(/ /g, '  ')]: call(d), 'Nowhere North': 'con'}});
 assert.equal(s.seats, null);
 assert.equal(s.ridings.scored, 1);
 assert.deepEqual(s.unmatched, ['Nowhere North']);
 // A shared top seat total scores the tie outcome.
 const tied = {status: 'final', updatedAt: null, source: '', vote: null, ridings: {}, seats: {con: 45, ndp: 45, green: 2, one: 1, centre: 0, other: 0}};
 assert.equal(seatWinner(tied.seats), 'tie');
 s = scoreModel(f, tied);
 assert.equal(s.seats.winnerProbability, f.tie);
 assert.ok(s.parties.every(p => p.inRange === (p.actual >= p.low && p.actual <= p.high)));
 // Pending results produce no scores.
 s = scoreModel(f, {status: 'pending', updatedAt: null, source: '', seats: null, vote: null, ridings: {}});
 assert.equal(s.seats, null); assert.equal(s.ridings, null); assert.equal(s.voteMAE, null);
}

// 3. The freeze script accepts an election-day snapshot and refuses anything else.
const ELECTION_DAY = fs.readFileSync('lib/astra-model.ts', 'utf8').match(/ELECTION_DAY='([^']+)'/)[1];
const source = (file, date) => { const s = read(file); return {...s, data: {...s.data, date}, error: 'transient'}; };
const snapshot = date => ({dashboard: {checkedAt: '2026-10-25T01:20:00.000Z', astra: source('lib/data/astra-result.json', date), opus: source('lib/data/opus-result.json', date)}});
const freeze = (snap, out, env = {}) => {
 fs.writeFileSync(`${dir}/snap.json`, JSON.stringify(snap));
 try { execFileSync(process.execPath, ['scripts/freeze-final.mjs', `${dir}/snap.json`, out], {env: {...process.env, ...env}, stdio: 'pipe'}); return true; } catch { return false; }
};
const out = `${dir}/final.json`;
fs.writeFileSync(out, JSON.stringify({frozenAt: null}));
assert.equal(freeze(snapshot('2026-10-20'), out), false, 'An earlier forecast is refused');
assert.equal(read(out).frozenAt, null);
assert.equal(freeze(snapshot(ELECTION_DAY), out), true);
const frozen = read(out);
assert.ok(frozen.frozenAt && frozen.astra.data.date === ELECTION_DAY && frozen.opus.data.districts.length === SEATS);
assert.equal(frozen.astra.error, undefined);
assert.equal(frozen.astra.live, false);
assert.equal(freeze(snapshot(ELECTION_DAY), out), false, 'An existing freeze is not overwritten');
assert.equal(freeze(snapshot(ELECTION_DAY), out, {FORCE: '1'}), true);
assert.equal(freeze({dashboard: {astra: null}}, `${dir}/none.json`), false);

// 4. A committed freeze is complete.
const committed = read('lib/data/final-forecast.json');
if (committed.frozenAt) for (const k of ['astra', 'opus']) {
 assert.ok(committed[k].data.date <= ELECTION_DAY, `${k} freeze is dated after election day`);
 assert.equal(committed[k].data.districts.length, SEATS);
}

const summary = scoreModel(read('lib/data/astra-result.json').data);
console.log(`Scorecard checks passed. Results: ${results.status}, ${Object.keys(results.ridings).length} ridings entered${summary.seats ? `, Astra seat error ${summary.seats.seatMAE.toFixed(1)}` : ''}. Final forecast ${committed.frozenAt ? 'frozen at ' + committed.frozenAt : 'not frozen yet'}.`);
