// Checks riding-market parsing and the battleground comparison against the saved
// Astra and Opus forecasts. Run: node scripts/battleground-check.mjs
import ts from 'typescript';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const out='.sites-runtime/battleground-check';
fs.mkdirSync(out,{recursive:true});
for(const name of ['astra-model','astra-inputs','opus-model','ridings','battleground']){
 const code=ts.transpile(fs.readFileSync('lib/'+name+'.ts','utf8'),{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022});
 fs.writeFileSync(`${out}/${name}.js`,code.replace(/from '\.\/([a-z-]+)'/g,"from './$1.js'"));
}
const {parseRidingEvent,isRidingEvent,KNOWN_RIDING_SLUGS}=await import(`../${out}/ridings.js`);
const {battleground,quoteValue}=await import(`../${out}/battleground.js`);
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const astra=read('lib/data/astra-result.json').data,opus=read('lib/data/opus-result.json').data;

// A Polymarket event shaped like the gamma API: candidate markets plus unused placeholders.
const market=(name,price,bid,ask,extra={})=>({groupItemTitle:name,outcomes:'["Yes","No"]',outcomePrices:JSON.stringify([String(price),String(1-price)]),bestBid:bid,bestAsk:ask,volumeNum:100,closed:false,...extra});
const yaletown=astra.districts.find(d=>d.name==='Vancouver-Yaletown');
const ndp=yaletown.candidates.find(c=>c.party==='ndp'),con=yaletown.candidates.find(c=>c.party==='con');
const event={title:'Vancouver-Yaletown British Columbia Legislative Assembly Election Winner',slug:KNOWN_RIDING_SLUGS[0],volume:'5409.17',markets:[
 market(ndp.name,.52,.49,.55),market(con.name,.47,.43,.50),market('Person A',.01,null,null),market('Old candidate',.3,.29,.31,{closed:true}),
]};
assert.ok(isRidingEvent(event));
assert.ok(!isRidingEvent({title:'British Columbia General Election Winner',slug:'x'}));
const parsed=parseRidingEvent(event);
assert.equal(parsed.riding,'Vancouver-Yaletown');
assert.equal(parsed.volume,5409.17);
assert.equal(parsed.quotes.length,3,'Closed markets are dropped');
assert.equal(quoteValue(parsed.quotes[0]),52,'Midpoint of bid and ask');
assert.equal(quoteValue(parsed.quotes[2]),1,'Last price when the book is one-sided');
assert.throws(()=>parseRidingEvent({...event,markets:[market(ndp.name,.5,.49,.51)]}));

// Middle names and initials still match ("Rohini Reah Arora" vs "Reah Arora").
const b=battleground([parsed],astra,opus);
assert.equal(b.counted,1);
const r=b.ridings[0];
assert.ok(Math.abs(Object.values(r.market).reduce((s,v)=>s+v,0)-100)<1e-9,'Rescaled to 100%');
assert.ok(Math.abs(r.market.ndp-52/(52+46.5)*100)<1e-9,'Placeholder dropped before rescaling');
assert.equal(r.favourite.party,'ndp');
assert.ok(Math.abs(b.seats.market.con-r.market.con/100)<1e-9);
assert.ok(Math.abs(b.seats.astra.con-r.astra.con/100)<1e-9);
assert.ok(Math.abs(b.disagreements[0].gap-(r.market.con-(r.astra.con+r.opus.con)/2))<1e-9);

// Thin or unmatched markets are listed but not counted; unknown ridings are reported.
const thin=battleground([{...parsed,volume:100}],astra,opus);
assert.equal(thin.counted,0);assert.equal(thin.ridings.length,1);assert.match(thin.ridings[0].note,/Too little trading/);
const strangers=battleground([{...parsed,quotes:[{name:'Jane Nobody',price:60,bid:null,ask:null,volume:1},{name:ndp.name,price:40,bid:null,ask:null,volume:1}]}],astra,opus);
assert.equal(strangers.counted,0,'Less than 80% of the price matched');
assert.deepEqual(battleground([{...parsed,riding:'Atlantis'}],astra,opus).unmatched,['Atlantis']);
const wide=battleground([{...parsed,quotes:[{...parsed.quotes[0],bid:40,ask:65},parsed.quotes[1]]}],astra,opus);
assert.match(wide.ridings[0].note,/Wide bid\/ask spread \(25 points\)/);

// Every known slug maps to a district in the forecasts.
const {key}=await import(`../${out}/astra-inputs.js`);
for(const slug of KNOWN_RIDING_SLUGS){const name=slug.replace('-british-columbia-legislative-assembly-election-winner','');assert.ok(astra.districts.some(d=>key(d.name)===key(name.replace(/-/g,' '))),slug);}
console.log('PASS: riding market parsing, candidate matching, rescaling, seat totals, disagreements, thin/unmatched/wide-spread handling.');
