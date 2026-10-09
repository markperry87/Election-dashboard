import type {Quote} from './election';
export function totalVolume(q:Quote[]){return q.reduce((v,q)=>v+(Number.isFinite(q.volume)?q.volume:0),0);}
export function weightedMean(p:number|null,k:number|null,pv:number,kv:number):number|null{
 if(pv<0||kv<0||!Number.isFinite(pv+kv)||pv+kv===0)return null;
 if(pv>0&&p===null||kv>0&&k===null)return null;
 return ((p??0)*pv+(k??0)*kv)/(pv+kv);
}
// Normalize market quotes across all five matched parties, preserving the existing
// market weighting. Use the displayed polling median unchanged in the 50/50 blend.
// Partywise medians need not sum to 100%; no tie probability is invented.
export function blendedEstimate(rows:{id:string;average:number|null}[],polls:{id:string;median:number|null}[]){
 if(rows.some(r=>r.average===null)||polls.some(p=>p.median===null))return null;
 const marketTotal=rows.reduce((s,r)=>s+r.average!,0);
 if(marketTotal<=0)return null;
 return polls.map(p=>{const raw=rows.find(r=>r.id===p.id)?.average;if(raw===null||raw===undefined)return null;const market=raw/marketTotal*100;return {id:p.id,market,model:p.median!,value:(market+p.median!)/2};}).filter((p):p is NonNullable<typeof p>=>p!==null).sort((a,b)=>b.value-a.value);
}
