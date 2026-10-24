// Freezes the final election-day Astra and Opus forecasts from the last published
// snapshot into lib/data/final-forecast.json, so they survive later rebuilds.
// Usage: node scripts/freeze-final.mjs <snapshot-data.json> [out-file]
// Refuses to overwrite an existing frozen file unless FORCE=1, and refuses a
// snapshot whose forecasts are not dated election day unless ALLOW_EARLIER=1.
import fs from 'node:fs';

const [snapshotFile, outFile = 'lib/data/final-forecast.json'] = process.argv.slice(2);
if (!snapshotFile) throw Error('Usage: freeze-final.mjs <snapshot-data.json> [out-file]');
const fail = message => { console.error('Not frozen: ' + message); process.exit(1); };
const version = (file, name) => fs.readFileSync(file, 'utf8').match(new RegExp(`${name}='([^']+)'`))?.[1];
const ELECTION_DAY = version('lib/astra-model.ts', 'ELECTION_DAY');
const expected = {astra: version('lib/astra-model.ts', 'ASTRA_VERSION'), opus: version('lib/opus-model.ts', 'OPUS_VERSION')};

const current = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : null;
if (current?.frozenAt && process.env.FORCE !== '1') fail(`already frozen at ${current.frozenAt}. Set FORCE=1 to replace it.`);

let snapshot;
try { snapshot = JSON.parse(fs.readFileSync(snapshotFile, 'utf8')); } catch (e) { fail('could not read the snapshot: ' + e.message); }
const dashboard = snapshot?.dashboard;
const ids = ['con', 'ndp', 'green', 'one', 'centre', 'other'];
const frozen = {};
for (const key of ['astra', 'opus']) {
 const source = dashboard?.[key], d = source?.data;
 if (!d || !Number.isFinite(Date.parse(source.fetchedAt))) fail(`the snapshot has no ${key} forecast.`);
 if (d.version !== expected[key]) fail(`${key} is v${d.version}, but the code is v${expected[key]}.`);
 if (!Array.isArray(d.districts) || d.districts.length !== 93) fail(`${key} does not cover all 93 ridings.`);
 if (!ids.every(id => d.seats?.[id] && Number.isFinite(d.seats[id].mean) && Number.isFinite(d.probabilities?.[id]))) fail(`${key} seat projections are incomplete.`);
 if (d.date !== ELECTION_DAY && process.env.ALLOW_EARLIER !== '1') fail(`${key} is dated ${d.date}, not election day (${ELECTION_DAY}). Set ALLOW_EARLIER=1 to freeze it anyway.`);
 // Keep the original calculation time; drop transient feed or refresh warnings.
 frozen[key] = {...source, live: false};
 delete frozen[key].error;
 delete frozen[key].retryAt;
}

const result = {
 frozenAt: new Date().toISOString(),
 note: 'Final election-day forecasts, frozen from the last published snapshot. Do not edit; rerun scripts/freeze-final.mjs with FORCE=1 to replace.',
 snapshotCheckedAt: typeof dashboard.checkedAt === 'string' ? dashboard.checkedAt : null,
 ...frozen,
};
fs.writeFileSync(outFile, JSON.stringify(result, null, 1) + '\n');
for (const key of ['astra', 'opus']) {
 const d = frozen[key].data, seats = ids.map(id => `${id} ${d.seats[id].mean.toFixed(1)} (${d.seats[id].low}–${d.seats[id].high})`).join(', ');
 console.log(`${key} v${d.version} · forecast ${d.date} · calculated ${frozen[key].fetchedAt} · ${seats}`);
}
console.log(`Wrote ${outFile}`);
