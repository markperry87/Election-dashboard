import {IDS,key,firmKey,pollSample,type Poll,type Candidate,type Party} from './astra-inputs';
import {generator,hash,popularVoteTracker,ELECTION_DAY,type AstraResult,type District} from './astra-model';

// Opus 5.5 model: an independent election-day forecast built by Claude Opus 5.5.
// It reads the same public poll catalogs, candidate list and 2024 baseline as
// Astra, but makes different modelling choices throughout. See OPUS_METHOD.
export const OPUS_VERSION='1.0';
export type HouseEffect={firm:string;polls:number;con:number|null;ndp:number|null;green:number|null};
export type OpusResult=AstraResult&{houseEffects:HouseEffect[]};
export type OpusOptions={electionDay?:string;districtCount?:number;newParties?:Party[];historical?:boolean};

// All judgment calls in one place. Fixed before the retrospective checks were run.
export const OPUS_PARAMS={
 window:35,          // days of polls in the average
 halfLife:7,         // days; recency weight halves every week from fieldwork midpoint
 sampleCap:1500,     // larger samples rarely mean proportionally smaller error
 designEffect:1.6,   // weighting and panel effects inflate sampling variance
 nonSampling:1.5,    // points of per-poll methodological error, added to sampling error
 firmCap:1.5,        // a firm's total weight is at most 1.5x its strongest poll
 houseWindow:60,     // days used to estimate pollster house effects
 housePrior:3,       // pseudo-polls shrinking each house effect toward zero
 uniformShare:.5,    // seat model: 50% uniform swing, 50% proportional swing
 openSeat:2,         // points lost when the 2024 winner does not run again
 sophomore:1,        // points gained when the 2024 winner runs again for the same party
 crossShare:.2,      // floor-crossers carry 20% of their old vote...
 crossCap:6,         // ...up to 6 points
 independent:1.5,    // starting share for an Other candidate without a 2024 vote
 provinceError:3,    // election-day polling error SD in points at 50% support
 drift:.3,           // extra points of SD per square-root day before election day
 newPartyError:1.5,  // polling-error multiplier for parties without an election record
 tails:5,            // multivariate-t degrees of freedom for province-wide error
 regionSD:.06,       // log-share SD of regional deviations
 localSD:.15,        // log-share SD of riding deviations
 simulations:10000,
};
const P=OPUS_PARAMS,DAY=86400000;
const sum=(v:number[])=>v.reduce((a,b)=>a+b,0);
const normalize=(v:number[])=>{const total=sum(v);if(!total)throw Error('Empty vote vector');return v.map(x=>x/total*100);};
// Lists differ on middle names and initials ("Reah Arora" vs "Rohini Reah Arora").
const tokens=(name:string)=>name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().split(/[^a-z]+/).filter(t=>t.length>1);
export function samePerson(a:string,b:string){if(key(a)===key(b))return true;const x=tokens(a),y=tokens(b);if(x.length<2||y.length<2||x.at(-1)!==y.at(-1))return false;const [short,long]=x.length<=y.length?[x,y]:[y,x];return short.every(t=>long.includes(t));}
const mid=(p:Poll)=>(Date.parse(p.start)+Date.parse(p.end))/2;
const MAJOR=[0,1,2];

// Each poll is compared with other firms' polls fielded near the same time.
// A firm's average residual, shrunk toward zero, is its house effect.
function houseEffects(polls:Poll[]){
 const out=new Map<string,{firm:string;polls:number;total:number[];count:number[]}>();
 for(const p of polls){
  const peers=polls.filter(q=>firmKey(q.firm)!==firmKey(p.firm)&&Math.abs(mid(q)-mid(p))<=14*DAY);
  if(peers.length<2)continue;
  const near=peers.map(q=>Math.exp(-(((mid(q)-mid(p))/DAY/7)**2)/2)*Math.sqrt(Math.min(P.sampleCap,pollSample(q))));
  const f=firmKey(p.firm),h=out.get(f)??{firm:p.firm,polls:0,total:[0,0,0],count:[0,0,0]};h.polls++;
  for(const i of MAJOR){
   if(p.shares[i]===null)continue;
   const w=peers.map((q,j)=>q.shares[i]===null?0:near[j]),tw=sum(w);if(!tw)continue;
   h.total[i]+=p.shares[i]!-sum(peers.map((q,j)=>w[j]*(q.shares[i]??0)))/tw;h.count[i]++;
  }
  out.set(f,h);
 }
 return new Map([...out].map(([f,h])=>[f,{firm:h.firm,polls:h.polls,effect:MAJOR.map(i=>h.count[i]?h.total[i]/(h.count[i]+P.housePrior):0)}]));
}

export function opusAverage(all:Poll[],date:string){
 const today=Date.parse(date),past=all.filter(p=>Date.parse(p.end)<=today);
 const house=houseEffects(past.filter(p=>today-Date.parse(p.end)<=P.houseWindow*DAY));
 // Inverse-variance weights: sampling error (capped, design-effect adjusted)
 // plus a fixed non-sampling error, discounted by age.
 const polls=past.filter(p=>today-Date.parse(p.end)<=P.window*DAY).map(p=>{
  const n=Math.min(P.sampleCap,pollSample(p))/P.designEffect;
  return {...p,weight:2**(-Math.max(0,(today-mid(p))/DAY)/P.halfLife)/(.25/n+(P.nonSampling/100)**2)};
 });
 if(polls.length<3)throw Error('Fewer than three polls in the last '+P.window+' days');
 const firms=new Map<string,Poll[]>();for(const p of polls)firms.set(firmKey(p.firm),[...(firms.get(firmKey(p.firm))??[]),p]);
 for(const group of firms.values()){const max=Math.max(...group.map(p=>p.weight!)),total=sum(group.map(p=>p.weight!));if(total>P.firmCap*max)for(const p of group)p.weight!*=P.firmCap*max/total;}
 const total=sum(polls.map(p=>p.weight!));for(const p of polls)p.weight!/=total;
 // Anchor to the weighted industry average: corrections reshape, not shift, the field.
 const center=MAJOR.map(i=>sum(polls.map(p=>p.weight!*(house.get(firmKey(p.firm))?.effect[i]??0))));
 const adjusted=polls.map(p=>({...p,shares:p.shares.map((v,i)=>v===null||i>2?v:Math.max(0,v-((house.get(firmKey(p.firm))?.effect[i]??0)-center[i])))}));
 const avg=IDS.map((_,i)=>{const present=adjusted.filter(p=>p.shares[i]!==null);if(!present.length)throw Error('Missing party polling');return sum(present.map(p=>p.weight!*p.shares[i]!))/sum(present.map(p=>p.weight!));});
 // An undivided Others bucket says nothing about OneBC or CentreBC separately.
 const complete=adjusted.filter(p=>p.shares[3]!==null&&p.shares[4]!==null&&p.shares[5]!==null);
 if(complete.length)avg[5]=sum(complete.map(p=>p.weight!*p.shares[5]!))/sum(complete.map(p=>p.weight!));
 const effectiveSample=1/sum(polls.map(p=>p.weight!**2*P.designEffect/Math.min(P.sampleCap,pollSample(p))));
 const effects=[...house.values()].filter(h=>firms.has(firmKey(h.firm))).map(h=>({firm:h.firm,polls:h.polls,con:h.effect[0]-center[0],ndp:h.effect[1]-center[1],green:h.effect[2]-center[2]}));
 return {polls,average:normalize(avg),effectiveSample,firmCount:firms.size,houseEffects:effects};
}

export function runOpus(all:Poll[],candidates:Candidate[],baseline:District[],date:string,simulations=P.simulations,options:OpusOptions={}):OpusResult{
 const electionDay=options.electionDay??ELECTION_DAY,newParties=options.historical?[]:options.newParties??['one','centre'];
 if(baseline.length!==(options.districtCount??93))throw Error('Wrong district count');
 if(simulations<1||!Number.isInteger(simulations))throw Error('Invalid simulation settings');
 const agg=opusAverage(all,date),target=agg.average;
 const turnouts=baseline.map(d=>sum(d.results.map(r=>r.votes))),totalVotes=sum(turnouts),weights=turnouts.map(t=>t/totalVotes);
 const counts=Object.fromEntries(IDS.map(id=>[id,candidates.filter(c=>c.party===id).length])) as Record<Party,number>;
 const regionalGreen=(region:string)=>{const peers=baseline.filter(x=>x.region===region&&x.results.some(c=>c.party==='green'));return peers.length?sum(peers.map(x=>sum(x.results.filter(c=>c.party==='green').map(c=>c.votes))/sum(x.results.map(c=>c.votes))*100))/peers.length:5;};
 const districts=baseline.map(d=>{
  const running=candidates.filter(c=>key(c.district)===key(d.name));if(running.length<2)throw Error('Missing candidate mapping: '+d.name);
  const region=/^(Surrey|Delta|Langley)/.test(d.name)?'South of Fraser':d.region;
  const votes=sum(d.results.map(c=>c.votes)),shares=IDS.map(id=>sum(d.results.filter(c=>c.party===id).map(c=>c.votes))/votes*100);
  // Other candidates: a returning candidate keeps their own vote; newcomers start small.
  const others=running.filter(c=>c.party==='other'),prior=others.map(c=>{const old=d.results.find(r=>samePerson(r.name,c.name));return old?.party==='other'?Math.max(P.independent,old.share):P.independent;});
  for(const p of newParties)shares[IDS.indexOf(p)]=p==='one'?.1*shares[0]+1:3;
  if(shares[2]===0)shares[2]=regionalGreen(d.region);
  // Incumbency: an open seat loses the former MLA's personal vote; a returning
  // MLA gains slightly; a floor-crosser takes part of their old vote along.
  const winner=[...d.results].sort((a,b)=>b.votes-a.votes)[0],returned=running.find(c=>samePerson(c.name,winner.name)),w=IDS.indexOf(winner.party as Party);
  if(winner.party!=='other'){
   if(!returned)shares[w]=Math.max(0,shares[w]-P.openSeat);
   else if(returned.party===winner.party)shares[w]+=P.sophomore;
   else{const moved=Math.min(P.crossCap,shares[w]*P.crossShare);shares[w]-=moved;if(returned.party==='other')prior[others.indexOf(returned)]+=moved;else shares[IDS.indexOf(returned.party)]+=moved;}
  }
  shares[5]=sum(prior);
  const eligible=IDS.map(id=>running.some(c=>c.party===id));
  return {name:d.name,region,candidates:running,others,otherSplit:others.length?normalize(prior):[],eligible,shares:normalize(shares.map((x,p)=>eligible[p]?Math.max(.5,x):0)),win:Array(6).fill(0) as number[]};
 });
 // Swing: blend uniform (additive) and proportional (multiplicative) swing, each
 // matching the polling average over the ridings a party contests, then rake.
 const base=districts.map(d=>[...d.shares]);
 const contested=IDS.map((_,p)=>sum(districts.map((d,r)=>d.eligible[p]?weights[r]:0)));
 const before=IDS.map((_,p)=>sum(districts.map((d,r)=>base[r][p]*weights[r])));
 districts.forEach((d,r)=>{d.shares=normalize(base[r].map((v,p)=>{if(!d.eligible[p])return 0;const prop=before[p]>0?v*target[p]/before[p]:0,unif=v+(target[p]-before[p])/(contested[p]||1);return Math.max(.3,P.uniformShare*unif+(1-P.uniformShare)*prop);}));});
 for(let i=0;i<60;i++){const totals=IDS.map((_,p)=>sum(districts.map((d,r)=>d.shares[p]*weights[r])));for(const d of districts)d.shares=normalize(d.shares.map((v,p)=>totals[p]>0?v*target[p]/totals[p]:0));}
 // Uncertainty on the log-share scale, so every draw is a valid vote split and
 // a gain for one party is a loss for others. Province-wide errors share one
 // multivariate-t scale: in a bad polling year, every party can miss together.
 const remaining=Math.max(0,(Date.parse(electionDay)-Date.parse(date))/DAY),latestPoll=agg.polls.map(p=>p.end).sort().at(-1)!;
 const pollAgeDays=Math.max(0,(Date.parse(date)-Date.parse(latestPoll))/DAY),horizon=Math.min(60,remaining+pollAgeDays);
 const provinceSD=target.map((v,p)=>{const t=Math.min(.99,Math.max(.005,v/100)),shape=Math.sqrt(t*(1-t))/.5,mult=newParties.includes(IDS[p])?P.newPartyError:1;
  const points=Math.sqrt((P.provinceError*shape*mult)**2+(P.drift*Math.sqrt(horizon)*shape)**2+1e4*t*(1-t)/agg.effectiveSample);return Math.min(.8,points/100/(t*(1-t)));});
 const regions=[...new Set(districts.map(d=>d.region))],ri=districts.map(d=>regions.indexOf(d.region));
 const logBase=districts.map(d=>d.shares.map(v=>v>0?Math.log(v):-Infinity));
 const seed=hash(JSON.stringify({v:OPUS_VERSION,date,polls:agg.polls,candidates,options})),rng=generator(seed);
 const wins=Array(6).fill(0),majorities=Array(6).fill(0),seatSamples=IDS.map(()=>[] as number[]);let ties=0;
 const maxProvinceShare=Array(6).fill(0),provinceSum=Array(6).fill(0),provinceSquares=Array(6).fill(0);let maxShareSumError=0;
 const tScale=()=>Math.sqrt((P.tails-2)/(2*rng.gamma(P.tails/2)));
 const province=Array(6).fill(0),regional=regions.map(()=>Array(6).fill(0)),local=Array(6).fill(0);
 const popular=popularVoteTracker(simulations);
 for(let run=0;run<simulations;run++){
  const scale=tScale();
  for(let p=0;p<6;p++)province[p]=provinceSD[p]*scale*rng.normal()-.5*provinceSD[p]**2;
  for(const g of regional)for(let p=0;p<6;p++)g[p]=P.regionSD*rng.normal()-.5*P.regionSD**2;
  const seats=Array(6).fill(0),otherGroups:Record<string,number>={},realized=Array(6).fill(0);
  for(let r=0;r<districts.length;r++){
   const d=districts[r],lb=logBase[r],g=regional[ri[r]];let total=0;
   for(let p=0;p<6;p++){local[p]=d.eligible[p]?Math.exp(lb[p]+province[p]+g[p]+P.localSD*rng.normal()-.5*P.localSD**2):0;total+=local[p];}
   let best=-1,winningParty=0,winningOther:Candidate|undefined;
   for(let p=0;p<6;p++){
    const share=local[p]/total*100;realized[p]+=share*weights[r];
    if(!d.eligible[p])continue;
    if(p===5){let max=-1,idx=0;for(let i=0;i<d.otherSplit.length;i++){const v=share*d.otherSplit[i]/100;if(v>max){max=v;idx=i;}}if(max>best){best=max;winningParty=5;winningOther=d.others[idx];}}
    else if(share>best){best=share;winningParty=p;}
   }
   seats[winningParty]++;d.win[winningParty]++;
   if(winningParty===5&&winningOther){const group=/independent|unaffiliated/i.test(winningOther.affiliation)?key(d.name)+key(winningOther.name):key(winningOther.affiliation);otherGroups[group]=(otherGroups[group]??0)+1;}
  }
  maxShareSumError=Math.max(maxShareSumError,Math.abs(sum(realized)-100));
  realized.forEach((v,p)=>{maxProvinceShare[p]=Math.max(maxProvinceShare[p],v);provinceSum[p]+=v;provinceSquares[p]+=v*v;});
  const actual=[...seats.slice(0,5),...Object.values(otherGroups)],max=Math.max(...actual),leaders=actual.filter(s=>s===max).length;
  let seatLeader:number|null=null;
  if(leaders>1)ties++;else{const party=seats.slice(0,5).findIndex(s=>s===max);wins[party>=0?party:5]++;if(party>=0)seatLeader=party;}
  popular.add(run,realized,seatLeader);
  for(let p=0;p<6;p++){seatSamples[p].push(seats[p]);if(p<5&&seats[p]>baseline.length/2)majorities[p]++;}
 }
 const pct=(x:number)=>x/simulations*100;
 return {popularVote:popular.result(),date,version:OPUS_VERSION,electionDay,probabilities:Object.fromEntries(IDS.map((p,i)=>[p,pct(wins[i])])) as Record<Party,number>,tie:pct(ties),simulations,latestPoll,pollAgeDays,polls:agg.polls,pollAverage:target,effectiveSample:agg.effectiveSample,firmCount:agg.firmCount,candidateCounts:counts,
  seats:Object.fromEntries(IDS.map((p,i)=>{const v=seatSamples[i].sort((a,b)=>a-b);return[p,{mean:sum(v)/simulations,low:v[Math.floor(simulations*.1)],high:v[Math.floor(simulations*.9)],majority:pct(majorities[i])}];})) as OpusResult['seats'],
  districts:districts.map(d=>({name:d.name,region:d.region,candidates:d.candidates,shares:d.shares,win:d.win.map(pct)})),seed,houseEffects:agg.houseEffects,
  diagnostics:{maxProvinceShare,provinceSD:provinceSum.map((v,p)=>Math.sqrt(Math.max(0,provinceSquares[p]/simulations-(v/simulations)**2))),maxShareSumError},
  warnings:['Built by an AI model; parameters are judgment calls, not fitted to BC data.','House effects are estimated from a few weeks of polls and shrunk heavily toward zero.','Incumbency and open-seat effects rely on matching candidate names to 2024 results.','Shares polling inputs with every other model here; it is not independent evidence.',...(pollAgeDays>7?['Latest poll is more than a week old; forecast uncertainty includes its age.']:[])]};
}
