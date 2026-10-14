// Checks the Opus 5.5 model, regenerates its seed forecast and runs the same
// retrospective election-eve checks as Astra. Run: node scripts/opus-check.mjs
import ts from 'typescript';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const out='.sites-runtime/opus-check';
fs.mkdirSync(out,{recursive:true});
for(const name of ['astra-model','astra-inputs','opus-model']){
 const code=ts.transpile(fs.readFileSync('lib/'+name+'.ts','utf8'),{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022});
 fs.writeFileSync(`${out}/${name}.js`,code.replaceAll("from './astra-inputs'","from './astra-inputs.js'").replaceAll("from './astra-model'","from './astra-model.js'"));
}
const {runOpus,samePerson,OPUS_VERSION}=await import(`../${out}/opus-model.js`);
const {IDS,withSupplementalPolls,mergePolls}=await import(`../${out}/astra-inputs.js`);
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const baseline=read('lib/data/astra-baseline.json').districts;
const input=read('lib/data/astra-inputs.json');
const polls=withSupplementalPolls(mergePolls([input.polls]),read('lib/data/astra-supplemental-polls.json'));
const date=process.argv[2]??'2026-10-05';

assert.ok(samePerson('Reah Arora','Rohini Reah Arora'));
assert.ok(samePerson('Sharon L. Hartwell','Sharon Hartwell'));
assert.ok(!samePerson('Mandeep Dhaliwal','Jinny Sims'));
assert.ok(!samePerson('John Smith','Jane Smith'));

const result=runOpus(polls,input.candidates,baseline,date);
assert.equal(result.districts.length,93);
assert.ok(Math.abs(Object.values(result.probabilities).reduce((s,v)=>s+v,0)+result.tie-100)<1e-8);
assert.ok(Math.abs(Object.values(result.seats).reduce((s,v)=>s+v.mean,0)-93)<1e-8);
assert.ok(Math.abs(result.pollAverage.reduce((a,b)=>a+b,0)-100)<1e-8);
assert.ok(result.diagnostics.maxShareSumError<1e-8);
for(const d of result.districts){
 assert.ok(Math.abs(d.shares.reduce((a,b)=>a+b,0)-100)<1e-8);
 assert.ok(Math.abs(d.win.reduce((a,b)=>a+b,0)-100)<1e-8);
 IDS.forEach((p,i)=>{if(!d.candidates.some(c=>c.party===p)){assert.equal(d.shares[i],0);assert.equal(d.win[i],0);}});
}
// The riding baseline must reproduce the polling average province-wide.
const turnout=baseline.map(d=>d.results.reduce((s,r)=>s+r.votes,0)),all=turnout.reduce((a,b)=>a+b,0);
IDS.forEach((_,p)=>assert.ok(Math.abs(result.districts.reduce((s,d,r)=>s+d.shares[p]*turnout[r]/all,0)-result.pollAverage[p])<.05));
// House effects are centred: they reshape the field without shifting it.
assert.ok(result.houseEffects.every(h=>[h.con,h.ndp,h.green].every(v=>v===null||Math.abs(v)<5)));
assert.deepEqual(runOpus(polls,input.candidates,baseline,date),result,'Seeded runs must be reproducible');
// Direction: lopsided polls produce lopsided forecasts.
const shifted=s=>polls.map(p=>({...p,shares:s}));
assert.ok(runOpus(shifted([60,25,8,3,2,2]),input.candidates,baseline,date,2000).probabilities.con>99);
assert.ok(runOpus(shifted([25,60,8,3,2,2]),input.candidates,baseline,date,2000).probabilities.ndp>99);
assert.ok(runOpus(shifted([20,20,7,48,3,2]),input.candidates,baseline,date,2000).probabilities.one>0);
// Stamp the seed with its inputs' retrieval time so any live forecast replaces it.
fs.writeFileSync('lib/data/opus-result.json',JSON.stringify({data:result,fetchedAt:input.fetchedAt,live:false},null,2));

// Retrospective checks on the Astra fixtures. Target-election results are used
// only for scoring. Parameters were fixed before these were run.
const astra=read('lib/data/astra-backtests.json');
const results=[];
for(const year of [2020,2024]){
 const fixture=read(`scripts/fixtures/${year}.json`);
 const {candidates,baseline:base,electionDay,labels}=fixture;
 assert.ok(fixture.polls.every(p=>p.published<=fixture.date&&p.end<=fixture.date));
 const forecast=runOpus(fixture.polls,candidates,base,fixture.date,20000,{electionDay,districtCount:base.length,historical:true});
 const actual=Object.fromEntries(IDS.map(id=>[id,0]));
 for(const rows of Object.values(fixture.actual))actual[[...rows].sort((a,b)=>b.votes-a.votes)[0].party]++;
 const scored=IDS.filter(id=>candidates.some(c=>c.party===id));
 const winner=scored.reduce((a,b)=>actual[a]>actual[b]?a:b);
 const parties=scored.map(id=>({id,name:labels[id],probability:forecast.probabilities[id],mean:forecast.seats[id].mean,low:forecast.seats[id].low,high:forecast.seats[id].high,actual:actual[id]}));
 const brier=IDS.reduce((s,id)=>s+(forecast.probabilities[id]/100-(id===winner?1:0))**2,0)+(forecast.tie/100)**2;
 // Riding calls: share of ridings where the most likely winner actually won.
 const calls=forecast.districts.filter(d=>{const rows=fixture.actual[d.name];if(!rows)return false;const won=[...rows].sort((a,b)=>b.votes-a.votes)[0].party;return IDS[d.win.indexOf(Math.max(...d.win))]===won;}).length;
 const peer=astra.results.find(r=>r.year===year);
 results.push({year,date:fixture.date,electionDay,simulations:forecast.simulations,polls:fixture.polls.length,firms:forecast.firmCount,winner:labels[winner],winnerProbability:forecast.probabilities[winner],parties,brier,seatMAE:parties.reduce((s,p)=>s+Math.abs(p.mean-p.actual),0)/parties.length,covered:parties.filter(p=>p.actual>=p.low&&p.actual<=p.high).length,scored:parties.length,ridingCalls:calls,ridings:base.length,
  astra:peer&&{winnerProbability:peer.winnerProbability,brier:peer.brier,seatMAE:peer.seatMAE,covered:peer.covered}});
}
const report={version:OPUS_VERSION,createdAt:new Date().toISOString().slice(0,10),description:'Retrospective election-eve checks on the same fixtures as Astra. Not a full historical replay or proof of calibration.',results};
fs.writeFileSync('lib/data/opus-backtests.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({seed:{date,probabilities:result.probabilities,tie:result.tie,pollAverage:result.pollAverage.map(v=>+v.toFixed(2)),seats:Object.fromEntries(Object.entries(result.seats).map(([k,v])=>[k,[+v.mean.toFixed(1),v.low,v.high]]))},backtests:results.map(r=>({year:r.year,winner:r.winner,p:r.winnerProbability,brier:+r.brier.toFixed(3),seatMAE:+r.seatMAE.toFixed(2),covered:`${r.covered}/${r.scored}`,ridings:`${r.ridingCalls}/${r.ridings}`,parties:r.parties.map(p=>`${p.id} ${p.mean.toFixed(1)} [${p.low}-${p.high}] actual ${p.actual}`),astra:r.astra}))},null,1));
