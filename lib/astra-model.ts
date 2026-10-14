import {IDS,key,firmKey,pollSample,type Poll,type Candidate,type Party} from './astra-inputs';

export const ASTRA_VERSION='2.0';
export const ELECTION_DAY='2026-10-24';
export type District={name:string;region:string;url:string;results:{name:string;party:string;votes:number;share:number}[]};
export type AstraResult={date:string;version:string;electionDay:string;probabilities:Record<Party,number>;tie:number;simulations:number;latestPoll:string;pollAgeDays:number;polls:Poll[];pollAverage:number[];effectiveSample:number;firmCount:number;candidateCounts:Record<Party,number>;seats:Record<Party,{mean:number;low:number;high:number;majority:number}>;districts:{name:string;region:string;shares:number[];win:number[];candidates:Candidate[]}[];seed:number;diagnostics:{maxProvinceShare:number[];provinceSD:number[];maxShareSumError:number};warnings:string[]};
const sum=(v:number[])=>v.reduce((a,b)=>a+b,0);
const normalize=(v:number[])=>{const total=sum(v);if(!total)throw Error('Empty vote vector');return v.map(x=>x/total*100);};
export function hash(s:string){let h=2166136261;for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);return h>>>0;}
export function generator(seed:number){
 let a=seed,spare:number|undefined;
 const uniform=()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return Math.max(1e-12,((t^t>>>14)>>>0)/4294967296);};
 const normal=()=>{if(spare!==undefined){const n=spare;spare=undefined;return n;}const r=Math.sqrt(-2*Math.log(uniform())),theta=2*Math.PI*uniform();spare=r*Math.sin(theta);return r*Math.cos(theta);};
 const gamma=(shape:number):number=>{
  if(shape<=0)return 0;
  if(shape<1)return gamma(shape+1)*uniform()**(1/shape);
  const d=shape-1/3,c=1/Math.sqrt(9*d);
  for(;;){const x=normal(),root=1+c*x;if(root<=0)continue;const v=root**3,u=uniform();if(u<1-.0331*x**4||Math.log(u)<.5*x*x+d*(1-v+Math.log(v)))return d*v;}
 };
 return {normal,dirichlet:(mean:number[],concentration:number)=>normalize(mean.map(p=>gamma(p/100*concentration)))};
}
export type AstraOptions={electionDay?:string;districtCount?:number;newParties?:Party[];historical?:boolean};


export function pollingAverage(all:Poll[],date:string){
 const today=Date.parse(date),polls=all.filter(p=>Date.parse(p.end)<=today&&today-Date.parse(p.end)<=42*86400000).map(p=>({...p,weight:Math.sqrt(Math.min(2000,pollSample(p)))*2**(-Math.max(0,(today-(Date.parse(p.start)+Date.parse(p.end))/2)/86400000)/10)}));
 if(polls.length<3)throw Error('Fewer than three polls in the last 42 days');
 const firms=new Map<string,{total:number;max:number}>();
 for(const p of polls){const f=firmKey(p.firm),v=firms.get(f)??{total:0,max:0};v.total+=p.weight;v.max=Math.max(v.max,p.weight);firms.set(f,v);}
 for(const p of polls){const f=firms.get(firmKey(p.firm))!;p.weight*=f.max/f.total;}
 const total=sum(polls.map(p=>p.weight));for(const p of polls)p.weight/=total;
 const avg=IDS.map((_,i)=>{const present=polls.filter(p=>p.shares[i]!==null);if(!present.length)throw Error('Missing party polling');return sum(present.map(p=>p.weight*p.shares[i]!))/sum(present.map(p=>p.weight));});
 // Missing minor-party options are not zero. Ignore the ambiguous Others bucket
 // in polls which did not name both new parties, then renormalize the six means.
 const completeOther=polls.filter(p=>p.shares[3]!==null&&p.shares[4]!==null&&p.shares[5]!==null);
 if(completeOther.length)avg[5]=sum(completeOther.map(p=>p.weight*p.shares[5]!))/sum(completeOther.map(p=>p.weight));
 const effectiveSample=1/sum(polls.map(p=>p.weight*p.weight/pollSample(p)))/2;
 return {polls,average:normalize(avg),effectiveSample,firmCount:firms.size};
}

export function runAstra(all:Poll[],candidates:Candidate[],baseline:District[],date:string,simulations=20000,uncertaintyScale=1,options:AstraOptions={}):AstraResult{
 const electionDay=options.electionDay??ELECTION_DAY,newParties=options.newParties??['one','centre'];
 const agg=pollingAverage(all,date);if(baseline.length!==(options.districtCount??93))throw Error('Wrong district count');
 if(simulations<1||!Number.isInteger(simulations)||uncertaintyScale<=0)throw Error('Invalid simulation settings');
 const pollAverage=agg.average,turnouts=baseline.map(d=>sum(d.results.map(r=>r.votes))),totalVotes=sum(turnouts),weights=turnouts.map(t=>t/totalVotes);
 const counts=Object.fromEntries(IDS.map(id=>[id,candidates.filter(c=>c.party===id).length])) as Record<Party,number>;
 const districts=baseline.map(d=>{
  const running=candidates.filter(c=>key(c.district)===key(d.name));if(running.length<2)throw Error('Missing candidate mapping: '+d.name);
  const region=/^(Surrey|Delta|Langley)/.test(d.name)?'South of Fraser':d.region;
  const votes=sum(d.results.map(c=>c.votes)),shares=IDS.map(id=>sum(d.results.filter(c=>c.party===id).map(c=>c.votes))/votes*100);
  // Historical independent vote belongs to a person, not a transferable party.
  shares[5]=Math.max(3*running.filter(c=>c.party==='other').length,sum(d.results.filter(c=>c.party==='other'&&running.some(r=>key(r.name)===key(c.name))).map(c=>c.votes))/votes*100);
  if(!options.historical){shares[3]=1+shares[0]/44;shares[4]=1+shares[0]/44;}
  if(shares[2]===0){const peers=baseline.filter(x=>x.region===d.region);shares[2]=sum(peers.map(x=>sum(x.results.filter(c=>c.party==='green').map(c=>c.votes))/sum(x.results.map(c=>c.votes))*100))/peers.length;}
  const winner=[...d.results].sort((a,b)=>b.votes-a.votes)[0],returned=running.find(c=>key(c.name)===key(winner.name));
  if(!options.historical&&returned&&returned.party!==winner.party&&winner.party!=='other'){
   const moved=Math.min(10,shares[IDS.indexOf(winner.party as Party)]*.3);shares[IDS.indexOf(winner.party as Party)]-=moved;shares[IDS.indexOf(returned.party)]+=moved;
  }
  // Other candidates compete separately; their relative split is fixed per riding.
  const others=running.filter(c=>c.party==='other');
  const otherSplit=others.length?normalize(others.map(c=>{const old=d.results.find(o=>key(o.name)===key(c.name));return old?old.party==='other'?Math.max(1,old.share):key(old.name)===key(winner.name)?10:1:1;})):[];
  return {name:d.name,region,candidates:running,others,otherSplit,shares:normalize(shares.map((x,p)=>running.some(c=>c.party===IDS[p])?Math.max(.2,x):0)),win:Array(6).fill(0) as number[]};
 });
 // Rake district shares to province-wide polling, using 2024 turnout weights.
 // Structural zeros stay zero; provincial support is concentrated where eligible.
 for(let iteration=0;iteration<120;iteration++){
  const totals=IDS.map((_,p)=>sum(districts.map((d,r)=>d.shares[p]*weights[r])));
  for(const d of districts)d.shares=normalize(d.shares.map((v,p)=>totals[p]>0?v*pollAverage[p]/totals[p]:0));
 }
 const regions=[...new Set(districts.map(d=>d.region))],ri=districts.map(d=>regions.indexOf(d.region));
 const seed=hash(JSON.stringify({v:ASTRA_VERSION,date,polls:agg.polls,candidates,options})),rng=generator(seed);
 const wins=Array(6).fill(0),majorities=Array(6).fill(0),seatSamples=IDS.map(()=>[] as number[]);let ties=0;
 const remaining=Math.max(0,(Date.parse(electionDay)-Date.parse(date))/86400000),latestPoll=agg.polls.map(p=>p.end).sort().at(-1)!;
 const pollAgeDays=Math.max(0,(Date.parse(date)-Date.parse(latestPoll))/86400000);
 const futureSD=.35*Math.sqrt(Math.min(60,remaining+pollAgeDays));
 // Fixed before retrospective testing. At 40% support, shared-error SD is
 // sqrt(sampling variance + 2pp^2 + time-to-election variance). Dirichlet
 // variance scales as p(1-p); new parties also get 0.35 log-odds SD.
 const concentration=(variance:number)=>Math.max(2,.24/(variance*uncertaintyScale**2)-1);
 const provinceK=concentration(.24/agg.effectiveSample+(4+futureSD**2)/10000);
 const regionK=concentration(.015**2),localK=concentration(.035**2);
 const maxProvinceShare=Array(6).fill(0),provinceSum=Array(6).fill(0),provinceSquares=Array(6).fill(0);let maxShareSumError=0;
 for(let run=0;run<simulations;run++){
  const center=normalize(pollAverage.map((v,p)=>newParties.includes(IDS[p])?v*Math.exp(rng.normal()*.35*uncertaintyScale-.5*(.35*uncertaintyScale)**2):v));
  const province=rng.dirichlet(center,provinceK);
  province.forEach((v,p)=>{maxProvinceShare[p]=Math.max(maxProvinceShare[p],v);provinceSum[p]+=v;provinceSquares[p]+=v*v;});
  const regional=regions.map(()=>rng.dirichlet(province,regionK));
  maxShareSumError=Math.max(maxShareSumError,Math.abs(sum(province)-100));
  const seats=Array(6).fill(0),otherGroups:Record<string,number>={};
  for(let r=0;r<districts.length;r++){
   const d=districts[r];let best=-Infinity,winningParty=0;let dOther:Candidate|undefined;
   const localMean=normalize(d.shares.map((v,p)=>pollAverage[p]>0?v*regional[ri[r]][p]/pollAverage[p]:0));
   const local=rng.dirichlet(localMean,localK);
   maxShareSumError=Math.max(maxShareSumError,Math.abs(sum(local)-100));
   for(let p=0;p<6;p++){
    if(d.shares[p]===0)continue;
    const value=local[p];
    if(p===5){
     // Other candidates compete separately; independents never form one party.
     const split=d.otherSplit;let max=-1,idx=0;for(let i=0;i<split.length;i++){const score=value*split[i]/100;if(score>max){max=score;idx=i;}}
     if(max>best){best=max;winningParty=p;dOther=d.others[idx];}
    }else if(value>best){best=value;winningParty=p;}
   }
   seats[winningParty]++;d.win[winningParty]++;
   if(winningParty===5&&dOther){const group=/independent|unaffiliated/i.test(dOther.affiliation)?key(d.name)+key(dOther.name):key(dOther.affiliation);otherGroups[group]=(otherGroups[group]??0)+1;}
  }
  const actual=[...seats.slice(0,5),...Object.values(otherGroups)],max=Math.max(...actual),leaders=actual.filter(s=>s===max).length;
  if(leaders>1)ties++;else {const party=seats.slice(0,5).findIndex(s=>s===max);wins[party>=0?party:5]++;}
  for(let p=0;p<6;p++){seatSamples[p].push(seats[p]);if(p<5&&seats[p]>baseline.length/2)majorities[p]++;}
 }
 const pct=(x:number)=>x/simulations*100;
 return {date,version:ASTRA_VERSION,electionDay,probabilities:Object.fromEntries(IDS.map((p,i)=>[p,pct(wins[i])])) as Record<Party,number>,tie:pct(ties),simulations,latestPoll,pollAgeDays,polls:agg.polls,pollAverage,effectiveSample:agg.effectiveSample,firmCount:agg.firmCount,candidateCounts:counts,seats:Object.fromEntries(IDS.map((p,i)=>{const v=seatSamples[i].sort((a,b)=>a-b);return[p,{mean:sum(v)/simulations,low:v[Math.floor(simulations*.1)],high:v[Math.floor(simulations*.9)],majority:pct(majorities[i])}];})) as AstraResult['seats'],districts:districts.map(d=>({name:d.name,region:d.region,candidates:d.candidates,shares:d.shares,win:d.win.map(pct)})),seed,diagnostics:{maxProvinceShare,provinceSD:provinceSum.map((v,p)=>Math.sqrt(Math.max(0,provinceSquares[p]/simulations-(v/simulations)**2))),maxShareSumError},warnings:['Experimental: parameters are judgment calls. Two retrospective election tests do not establish calibration.','Poll catalogs can contain errors; source disagreement and missing minor-party options remain limitations.','New-party geography, floor-crossing personal votes and turnout are uncertain.','Astra shares polling inputs with the other models; it is not independent evidence.',...(pollAgeDays>7?['Latest poll is more than a week old; forecast uncertainty includes its age.']:[])]};
}
