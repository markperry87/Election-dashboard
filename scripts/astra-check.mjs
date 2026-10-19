import ts from 'typescript';
import fs from 'node:fs';
import assert from 'node:assert/strict';
fs.mkdirSync('.sites-runtime/astra-check',{recursive:true});
for(const name of ['astra-model','astra-inputs','poll-models','astra-format']){const code=ts.transpile(fs.readFileSync('lib/'+name+'.ts','utf8'),{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}).replaceAll("from './astra-inputs'","from './astra-inputs.js'");fs.writeFileSync('.sites-runtime/astra-check/'+name+'.js',code);}
const {runAstra,generator}=await import('../.sites-runtime/astra-check/astra-model.js');
const parsers=await import('../.sites-runtime/astra-check/astra-inputs.js');
const {pollConsensus}=await import('../.sites-runtime/astra-check/poll-models.js');
const mock=[10,20,70,80].map((v,i)=>({id:String(i),source:{data:{probabilities:{con:v,ndp:100-v}}}}));
assert.equal(pollConsensus(mock)[0].median,45);assert.equal(pollConsensus(mock)[0].spread,70);
// An excluded model is listed but never moves the median or the spread.
assert.deepEqual(pollConsensus([...mock,{id:'x',excluded:'test',source:{data:{probabilities:{con:99.7,ndp:.3}}}}])[0],pollConsensus(mock)[0]);
{
 const {parseTaylor}=await import('../.sites-runtime/astra-check/poll-models.js');
 const page=`<h1>British Columbia seat projection</h1><p>As of 12 October 2026, from 53 polls · election day 24 October 2026</p><p>the Conservatives win a median of 53 seats (90% range 32–73) and a majority in 72%. No party wins a majority in 5%.</p>
 <div class="card"><h3>Conservative</h3><b>53</b><span>Majority in 72%</span><span>Most seats in 73% of simulations</span></div>
 <div class="card"><h3>NDP</h3><b>38</b><span>Majority in 24%</span><span>Most seats in 25% of simulations</span></div>`;
 assert.deepEqual(parseTaylor(page),{date:'2026-10-12',probabilities:{con:73,ndp:25}});
 assert.throws(()=>parseTaylor(page.replaceAll('Most seats','Plurality')));
}
const date=process.argv[2]??'2026-10-05';
const supplemental=JSON.parse(fs.readFileSync('lib/data/astra-supplemental-polls.json'));
const report=supplemental[0];
assert.equal(report.n,null);
assert.deepEqual(report.shares,[48,43,7,null,null,2]);
assert.equal(parsers.pollSample(report),500);
assert.deepEqual(parsers.withSupplementalPolls(supplemental,supplemental),supplemental);
const confirmed={...report,provisional:undefined,start:'2026-10-01',end:'2026-10-04',n:1200,sources:['Vote-Scope']};
const replaced=parsers.withSupplementalPolls([confirmed],supplemental);
assert.equal(replaced.length,1);
assert.equal(replaced[0].n,1200);
assert.equal(replaced[0].end,'2026-10-04');
assert.ok(!replaced[0].provisional);
const input=JSON.parse(fs.readFileSync('lib/data/astra-inputs.json'));
input.polls=parsers.withSupplementalPolls(parsers.mergePolls([input.polls]),supplemental);
fs.writeFileSync('lib/data/astra-inputs.json',JSON.stringify(input,null,2));
const baseline=JSON.parse(fs.readFileSync('lib/data/astra-baseline.json')).districts;
const result=runAstra(input.polls,input.candidates,baseline,date);
assert.equal(result.polls.filter(p=>p.provisional).length,1);
assert.ok(result.polls.find(p=>p.provisional).weight>0);
assert.equal(result.districts.length,93);
assert.ok(Math.abs(Object.values(result.probabilities).reduce((s,v)=>s+v,0)+result.tie-100)<1e-8);
assert.ok(Math.abs(Object.values(result.seats).reduce((s,v)=>s+v.mean,0)-93)<1e-8);
for(const d of result.districts){assert.ok(Math.abs(d.shares.reduce((a,b)=>a+b,0)-100)<1e-8);assert.ok(Math.abs(d.win.reduce((a,b)=>a+b,0)-100)<1e-8);parsers.IDS.forEach((p,i)=>{if(!d.candidates.some(c=>c.party===p)){assert.equal(d.shares[i],0);assert.equal(d.win[i],0);}});}
// Check the distribution itself, not just seat winners: bounds, moments and
// the negative dependence required when parties compete for the same votes.
const {probability}=await import('../.sites-runtime/astra-check/astra-format.js');
assert.equal(probability(0),probability(.005));assert.equal(probability(.099),'<0.1%');assert.equal(probability(.1),'0.1%');
const rng=generator(731),mean=[40,40,12,4,4,0],k=300,n=40000;
let sums=Array(6).fill(0),squares=Array(6).fill(0),cross=0;
for(let i=0;i<n;i++){const draw=rng.dirichlet(mean,k);assert.ok(draw.every(v=>v>=0&&v<=100));assert.ok(Math.abs(draw.reduce((a,b)=>a+b)-100)<1e-9);assert.equal(draw[5],0);draw.forEach((v,p)=>{sums[p]+=v;squares[p]+=v*v;});cross+=draw[0]*draw[1];}
mean.forEach((m,p)=>{assert.ok(Math.abs(sums[p]/n-m)<.1);const variance=squares[p]/n-(sums[p]/n)**2;const expected=m*(100-m)/(k+1);assert.ok(Math.abs(variance-expected)<Math.max(.01,expected*.05));});
assert.ok(cross/n-sums[0]*sums[1]/n**2<0);
assert.ok(result.diagnostics.maxShareSumError<1e-9);
assert.ok(result.diagnostics.provinceSD[3]<result.diagnostics.provinceSD[0]);
assert.ok(result.diagnostics.maxProvinceShare[3]<20,'Regression: current-seed OneBC support again has an extreme tail');
// Absence of wins is an outcome, not a hard-coded party exclusion.
const highOne=input.polls.map(p=>({...p,shares:[20,20,7,48,3,2]}));
assert.ok(runAstra(highOne,input.candidates,baseline,date,2000).probabilities.one>0);
const rerun=runAstra(input.polls,input.candidates,baseline,date);assert.deepEqual(rerun,result);
const highCon=input.polls.map(p=>({...p,shares:[75,10,7,3,3,2]}));
assert.ok(runAstra(highCon,input.candidates,baseline,date,2000).probabilities.con>99);
const highNdp=input.polls.map(p=>({...p,shares:[10,75,7,3,3,2]}));
assert.ok(runAstra(highNdp,input.candidates,baseline,date,2000).probabilities.ndp>99);
assert.equal(parsers.mergePolls([input.polls,input.polls]).length,input.polls.length);
const low=runAstra(input.polls,input.candidates,baseline,date,10000,.75),high=runAstra(input.polls,input.candidates,baseline,date,10000,1.25);
fs.writeFileSync('lib/data/astra-result.json',JSON.stringify({data:result,fetchedAt:new Date().toISOString(),live:false},null,2));
console.log(JSON.stringify({probabilities:result.probabilities,tie:result.tie,pollAverage:result.pollAverage,polls:result.polls.length,firms:result.firmCount,seats:result.seats,sensitivity:{lowerUncertainty:low.probabilities,higherUncertainty:high.probabilities}},null,2));
