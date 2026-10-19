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

// Real Polymarket shape (Oct 19): 26 unused "Person A–Z" outcomes and "Other",
// each priced 50 with an empty book. They must not swamp the real candidates.
const blanks=[...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map(l=>({name:'Person '+l,price:50,bid:0,ask:100,volume:0})).concat({name:'Other',price:50,bid:0,ask:100,volume:0});
const real=[
 {riding:'Vancouver-Yaletown',volume:5409.17,quotes:[{name:'Terry Yung',price:46.5,bid:43,ask:50,volume:1412.5},{name:'Margareta Dovgal',price:52,bid:49,ask:55,volume:2037.72},{name:'Sam Chandola',price:1.1,bid:.3,ask:1.9,volume:841.31},{name:'Priyan Samarakoone',price:1.05,bid:.2,ask:1.9,volume:749.82},{name:'Timothy Webster',price:1.15,bid:.3,ask:2,volume:367.81}]},
 {riding:'Vancouver-Langara',volume:2945.25,quotes:[{name:'Sunita Dhir',price:30,bid:28,ask:32,volume:1045.28},{name:'Jaime Stein',price:69.5,bid:67,ask:72,volume:1479.46},{name:'John Atoyebi',price:.75,bid:.2,ask:1.3,volume:189.77},{name:'Alan Beesley',price:.5,bid:.1,ask:.9,volume:230.74}]},
].map(m=>({...m,slug:m.riding.toLowerCase(),quotes:[...m.quotes,...blanks]}));
const live=battleground(real,astra,opus);
assert.equal(live.counted,2,'Both real ridings count once placeholders are dropped: '+JSON.stringify(live.ridings.map(r=>r.note)));
for(const r of live.ridings){assert.ok(r.overround>-2&&r.overround<5,'Overround from real candidates only');assert.ok(Math.max(r.market.con,r.market.ndp)>45);}

// Thin or unmatched markets are listed but not counted; unknown ridings are reported.
const thin=battleground([{...parsed,volume:100}],astra,opus);
assert.equal(thin.counted,0);assert.equal(thin.ridings.length,1);assert.match(thin.ridings[0].note,/Too little trading/);
const strangers=battleground([{...parsed,quotes:[{name:'Jane Nobody',price:60,bid:null,ask:null,volume:1},{name:ndp.name,price:40,bid:null,ask:null,volume:1}]}],astra,opus);
assert.equal(strangers.counted,0,'Less than 80% of the price matched');
assert.deepEqual(battleground([{...parsed,riding:'Atlantis'}],astra,opus).unmatched,['Atlantis']);
const wide=battleground([{...parsed,quotes:[{...parsed.quotes[0],bid:40,ask:65},parsed.quotes[1]]}],astra,opus);
assert.match(wide.ridings[0].note,/Wide bid\/ask spread \(25 points\)/);
assert.equal(wide.counted,1,'A wide spread is flagged but still counted');
const empty=battleground([{...parsed,quotes:[{...parsed.quotes[0],bid:27,ask:78},parsed.quotes[1]]}],astra,opus);
assert.equal(empty.counted,0,'No real market on the favourite');assert.match(empty.ridings[0].note,/No real market/);

// Every known slug maps to a district in the forecasts.
const {key}=await import(`../${out}/astra-inputs.js`);
for(const slug of KNOWN_RIDING_SLUGS){const name=slug.replace('-british-columbia-legislative-assembly-election-winner','');assert.ok(astra.districts.some(d=>key(d.name)===key(name.replace(/-/g,' '))),slug);}
for(const r of live.ridings)console.log(r.riding,'market con/ndp',r.market.con.toFixed(1),r.market.ndp.toFixed(1),'astra',r.astra.con.toFixed(1),'opus',r.opus.con.toFixed(1),r.note??'');
console.log('PASS: riding market parsing, candidate matching, rescaling, seat totals, disagreements, thin/unmatched/wide-spread handling.');
