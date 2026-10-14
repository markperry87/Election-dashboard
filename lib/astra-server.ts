import baseline from './data/astra-baseline.json';
import seedInputs from './data/astra-inputs.json';
import seedResult from './data/astra-result.json';
import supplemental from './data/astra-supplemental-polls.json';
import {ASTRA_URLS,parse338Polls,parseCandidates,parseNorthernPolls,parseVotePolls,mergePolls,withSupplementalPolls,type Poll,type Candidate} from './astra-inputs';
import {runAstra,hash,type AstraResult,ELECTION_DAY,ASTRA_VERSION} from './astra-model';
import type {Source} from './election';
import {env} from 'cloudflare:workers';

const cacheKey='current-v'+ASTRA_VERSION+'-inputs-2026-10-05';
type RecordState={source:Source<AstraResult>;polls:Poll[];candidates:Candidate[];lastAttempt:number;feeds:{name:string;checkedAt:string;ok:boolean;error?:string}[];inputKey?:string};
const initial:RecordState={source:seedResult as Source<AstraResult>,polls:withSupplementalPolls(seedInputs.polls as Poll[],supplemental as Poll[]),candidates:seedInputs.candidates as Candidate[],lastAttempt:0,feeds:[]};
let memory=initial,inFlight:Promise<RecordState>|null=null;
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Vancouver',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export async function getAstra():Promise<RecordState>{
 if(inFlight)return inFlight;
 inFlight=(async()=>{
  // Within the refresh window this isolate's forecast is current; skip D1.
  if(Date.now()-memory.lastAttempt<300000)return memory;
  try{if(env.DB){const row=await env.DB.prepare('SELECT payload FROM astra_cache WHERE id = ?').bind(cacheKey).first<{payload:string}>();if(row){const saved=JSON.parse(row.payload) as RecordState;if(saved.source.data.version===ASTRA_VERSION&&saved.lastAttempt>memory.lastAttempt)memory=saved;}}}catch(e){console.warn('Astra stored forecast unavailable',String(e));}
  if(Date.now()-memory.lastAttempt<300000)return memory;
  // Freeze pre-election forecasting after election day; this is not a results model.
  if(today()>ELECTION_DAY)return {...memory,source:{...memory.source,live:false,error:'Pre-election forecast closed after October 24. This is not an election-results model.'}};
  const attempt=Date.now(),checkedAt=new Date().toISOString();
  const fetchInput=async(url:string)=>{const r=await fetch(url,{headers:{'User-Agent':'Astra-BC-Forecast/'+ASTRA_VERSION,'Accept':'text/html,application/json'},signal:AbortSignal.timeout(18000)});if(!r.ok)throw Error('HTTP '+r.status);return r.text();};
  const specs=[{name:'Vote-Scope',url:ASTRA_URLS.votescope,parse:parseVotePolls},{name:'Northern Vibe',url:ASTRA_URLS.northern,parse:parseNorthernPolls},{name:'338Canada',url:ASTRA_URLS.canada338,parse:parse338Polls}];
  const results=await Promise.allSettled(specs.map(async s=>s.parse(await fetchInput(s.url))));
  const candidateResult=await Promise.allSettled([fetchInput(ASTRA_URLS.candidates).then(parseCandidates)]);
  const feeds=results.map((r,i)=>({name:specs[i].name,checkedAt,ok:r.status==='fulfilled',...(r.status==='rejected'?{error:String(r.reason)}:{})}));
  const cr=candidateResult[0];feeds.push({name:'Elections BC',checkedAt,ok:cr.status==='fulfilled',...(cr.status==='rejected'?{error:String(cr.reason)}:{})});
  const fresh=results.flatMap(r=>r.status==='fulfilled'?[r.value]:[]);
  // Keep records from failed feeds only. Successful feeds may correct or remove a poll.
  const failed=feeds.filter(f=>!f.ok).map(f=>f.name);
  const retained=memory.polls.filter(p=>p.sources.some(s=>failed.includes(s)));
  const polls=withSupplementalPolls(fresh.length?mergePolls([...fresh,retained]):memory.polls,supplemental as Poll[]);
  const candidates=cr.status==='fulfilled'?cr.value:memory.candidates;
  try{
   if(!fresh.length)throw Error('All polling feeds unavailable');
   // The simulation is seeded from its inputs, so identical inputs give an
   // identical forecast; skip the multi-second rerun.
   const date=today(),inputKey=hash(JSON.stringify({date,polls,candidates})).toString(36);
   const data=inputKey===memory.inputKey?memory.source.data:runAstra(polls,candidates,baseline.districts,date);
   const partial=feeds.filter(f=>!f.ok).map(f=>f.name);
   memory={source:{data,live:partial.length===0,fetchedAt:checkedAt,...(partial.length?{error:'Recomputed with saved inputs from '+partial.join(', ')+'.'}:{})},polls,candidates,lastAttempt:attempt,feeds,inputKey};
  }catch(e){memory={...memory,lastAttempt:attempt,feeds,source:{...memory.source,live:false,error:'Astra refresh failed ('+String(e)+'). Showing the last successful forecast.'}};}
  try{if(env.DB)await env.DB.prepare('INSERT INTO astra_cache (id, payload) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload').bind(cacheKey,JSON.stringify(memory)).run();}catch(e){memory.source.error=(memory.source.error??'')+' Forecast computed, but persistent saving is unavailable.';console.warn('Astra save failed',String(e));}
  return memory;
 })().finally(()=>{inFlight=null;});return inFlight;
}
