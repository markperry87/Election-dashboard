// Run node scripts/astra-check.mjs first to transpile the shared production model.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {runAstra,ASTRA_VERSION} from '../.sites-runtime/astra-check/astra-model.js';
import {IDS} from '../.sites-runtime/astra-check/astra-inputs.js';
const results=[];
for(const year of [2020,2024]){
 const fixture=JSON.parse(fs.readFileSync(`scripts/fixtures/${year}.json`));
 const {polls,candidates,baseline,date,electionDay,labels}=fixture;
 assert.ok(fixture.baselineYear<year);
 assert.ok(polls.every(p=>p.published<=date&&p.end<=date));
 assert.ok(candidates.every(c=>!('votes' in c)&&!('share' in c)));
 // Target votes/results are never passed into runAstra. No parameter tuning.
 const forecast=runAstra(polls,candidates,baseline,date,20000,1,{electionDay,districtCount:baseline.length,newParties:[],historical:true});
 const actual=Object.fromEntries(IDS.map(id=>[id,0]));
 for(const rows of Object.values(fixture.actual))actual[[...rows].sort((a,b)=>b.votes-a.votes)[0].party]++;
 assert.equal(Object.values(actual).reduce((a,b)=>a+b),baseline.length);
 const scored=IDS.filter(id=>candidates.some(c=>c.party===id));
 const winner=scored.reduce((a,b)=>actual[a]>actual[b]?a:b);
 const parties=scored.map(id=>({id,name:labels[id],probability:forecast.probabilities[id],mean:forecast.seats[id].mean,low:forecast.seats[id].low,high:forecast.seats[id].high,actual:actual[id]}));
 const brier=IDS.reduce((s,id)=>s+(forecast.probabilities[id]/100-(id===winner?1:0))**2,0)+(forecast.tie/100)**2;
 results.push({year,date,electionDay,simulations:forecast.simulations,polls:polls.length,firms:forecast.firmCount,winner:labels[winner],winnerProbability:forecast.probabilities[winner],parties,brier,seatMAE:parties.reduce((s,p)=>s+Math.abs(p.mean-p.actual),0)/parties.length,covered:parties.filter(p=>p.actual>=p.low&&p.actual<=p.high).length,scored:parties.length,sources:polls.flatMap(p=>p.sources)});
}
const report={version:ASTRA_VERSION,createdAt:'2026-10-04',description:'Retrospective election-eve checks with small verified subsets of pre-election polls. Not a full historical replay or proof of calibration.',results};
fs.writeFileSync('lib/data/astra-backtests.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
