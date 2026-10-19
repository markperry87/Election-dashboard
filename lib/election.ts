import {mergeSnapshots,newerSource} from './snapshots';
import polySeed from './data/poly.json';
import kalshiSeed from './data/kalshi.json';
import modelSeed from './data/model.json';
import pollSeeds from './data/poll-models.json';
import astraSeed from './data/astra-result.json';
import opusSeed from './data/opus-result.json';
import type {AstraResult} from './astra-model';
import type {OpusResult} from './opus-model';
import {parseNorthern,parseTaylor,parseVoteScope,type PollEstimate} from './poll-models';
import {KNOWN_RIDING_SLUGS,RIDING_SEARCH,isRidingEvent,parseRidingEvent,type RidingMarket} from './ridings';
export const links = { poly: 'https://polymarket.com/event/british-columbia-general-election-winner', kalshi: 'https://kalshi.com/markets/kxbcelection/british-columbia-general-election-winner/kxbcelection-26oct24', model: 'https://338canada.com/bc/' };
export const parties = [{id:'ndp',name:'BC NDP',color:'#df762e'},{id:'con',name:'BC Conservatives',color:'#567fe9'},{id:'green',name:'BC Greens',color:'#389e79'},{id:'centre',name:'CentreBC',color:'#b09ae0'},{id:'one',name:'OneBC',color:'#b68c70'}];
export type Quote = {id:string; price:number|null; bid:number|null; ask:number|null; status:string; volume:number};
export type Source<T> = {data:T; fetchedAt:string; live:boolean; error?:string; retryAt?:string};
export type Projection = {date:string;dates:string[];parties:{label:string;value:number;values:number[]}[]};
export type Model = {indexodds:Projection;indexoutcome:Projection};
export type Dashboard = {poly:Source<Quote[]>;kalshi:Source<Quote[]>;model:Source<Model>;northern:Source<PollEstimate>;taylor:Source<PollEstimate>;voteScope:Source<PollEstimate>;ridings:Source<RidingMarket[]>;astra:Source<AstraResult>;opus:Source<OpusResult>;checkedAt:string};
const seedTime = '2026-09-30T23:15:46.197Z';
function probability(value:unknown):number|null { if(value===null||value===undefined||value==='') return null; const n=Number(value);return Number.isFinite(n)&&n>=0&&n<=1?n*100:null; }
function identity(name:string) { if(/ndp/i.test(name))return 'ndp';if(/conservative/i.test(name))return 'con';if(/green/i.test(name))return 'green';if(/centre/i.test(name))return 'centre';if(/onebc/i.test(name))return 'one';return null; }
export function parsePoly(event:any):Quote[] { const quotes=(event?.markets??[]).flatMap((m:any)=>{const id=identity(m.groupItemTitle??'');if(!id)return [];const outcomes=typeof m.outcomes==='string'?JSON.parse(m.outcomes):m.outcomes;const prices=typeof m.outcomePrices==='string'?JSON.parse(m.outcomePrices):m.outcomePrices;return [{id,price:probability(prices?.[outcomes?.indexOf('Yes')]),bid:probability(m.bestBid),ask:probability(m.bestAsk),status:m.closed?'closed':'active',volume:Math.max(0,Number(m.volumeNum??m.volume)||0)}];});validate(quotes);return quotes; }
export function parseKalshi(input:any):Quote[] { const markets=input.event?.markets?.length?input.event.markets:input.markets;const quotes=(markets??[]).flatMap((m:any)=>{const id=identity(m.yes_sub_title??'');return id?[{id,price:probability(m.last_price_dollars),bid:probability(m.yes_bid_dollars),ask:probability(m.yes_ask_dollars),status:m.status,volume:Math.max(0,Number(m.volume_fp)||0)*Number(m.notional_value_dollars??1)}]:[];});validate(quotes);return quotes; }
function validate(q:Quote[]) { if(!q.some(v=>v.id==='ndp'&&v.price!==null)||!q.some(v=>v.id==='con'&&v.price!==null))throw new Error('Source format changed'); }
// 338Canada has switched to French labels (PCCB, NPD, Égalité); store English ones.
const englishLabel=(label:string)=>label.trim().replace(/^PCCB(?= |$)/,'CPBC').replace(/^NPD(?= |$)/,'NDP').replace(/^(Égalité|Egalite)$/i,'Tie').replace(/ majoritaire$/,' majority').replace(/ minoritaire$/,' plurality');
export function parseModel(html:string):Model { const result:any={};for(const name of ['indexodds','indexoutcome']){const section=html.split('window.'+name+'_DATA = {')[1]?.split('</script>')[0];if(!section)throw new Error('Projection format changed');const dates=[...section.split('rangeOptions:')[0].matchAll(/'(\d{4}-\d{2}-\d{2})'/g)].map(m=>m[1]);const rows=[...section.matchAll(/label:\s*'([^']+)'[\s\S]*?values:\s*\[([^\]]+)\]/g)].map(m=>{const values=m[2].split(',').filter(v=>v.trim()).map(Number);if(values.length!==dates.length)throw new Error('Projection dates do not match values');return {label:englishLabel(m[1]),value:values[values.length-1],values};});if(!dates.length||rows.length<(name==='indexodds'?3:5)||rows.some(r=>!Number.isFinite(r.value)||r.value<0||r.value>100))throw new Error('Incomplete projection');result[name]={date:dates[dates.length-1],parties:rows,dates};}return result; }
export const initialData:Dashboard={poly:{data:parsePoly(polySeed),fetchedAt:seedTime,live:false},kalshi:{data:parseKalshi(kalshiSeed),fetchedAt:seedTime,live:false},model:{data:modelSeed,fetchedAt:pollSeeds.northern.fetchedAt,live:false},northern:pollSeeds.northern,taylor:pollSeeds.taylor,voteScope:pollSeeds.voteScope,ridings:{data:[],fetchedAt:seedTime,live:false},astra:astraSeed as Source<AstraResult>,opus:opusSeed as unknown as Source<OpusResult>,checkedAt:seedTime};
export function quoteValue(q:Quote|undefined,mode:'reported'|'midpoint'){if(!q)return null;if(mode==='reported')return q.price;if(q.bid===null||q.ask===null||q.bid>q.ask||q.status!=='active')return null;return(q.bid+q.ask)/2;}
let latest:Dashboard=initialData;
let inFlight:Promise<Dashboard>|null=null;
let lastAttempt=0;
export class UpstreamError extends Error { constructor(public status:number, public retryAfterMs=0){super('Source returned '+status);} }
export async function fetchText(url:string){const r=await fetch(url,{headers:{Accept:'application/json,text/html','User-Agent':'BC-Election-Watch/1.0'},signal:AbortSignal.timeout(18000),cache:'no-store'});if(!r.ok){const retry=r.headers.get('Retry-After');const seconds=retry===null?NaN:Number(retry);const wait=Number.isFinite(seconds)?seconds*1000:retry?Date.parse(retry)-Date.now():0;throw new UpstreamError(r.status,Number.isFinite(wait)?Math.max(0,wait):0);}return r.text();}
async function loadSource<T>(previous:Source<T>,read:()=>Promise<T>):Promise<Source<T>>{try{return{data:await read(),fetchedAt:new Date().toISOString(),live:true};}catch(error){console.error('Election source refresh failed', error instanceof Error ? error.message : 'Unknown error');return{...previous,live:false,error:'Refresh unavailable ('+(error instanceof Error ? error.message : 'unknown error')+'). Showing the last successful snapshot.'};}}
// Use Kalshi's current documented public API host. Retry with the markets
// resource if the event resource is temporarily unavailable or incomplete.
async function getKalshi():Promise<Quote[]> {
 const endpoints=[
  'https://external-api.kalshi.com/trade-api/v2/events/KXBCELECTION-26OCT24?with_nested_markets=true',
  'https://external-api.kalshi.com/trade-api/v2/markets?event_ticker=KXBCELECTION-26OCT24&limit=100'
 ];
 const errors:string[]=[];
 for(const url of endpoints){try{return parseKalshi(JSON.parse(await fetchText(url)));}catch(error){const reason=error instanceof Error?error.message:'Unknown error';console.error('Kalshi request failed',url,reason);if(error instanceof UpstreamError && error.status===429)throw error;errors.push(reason);}}
 throw new Error('Kalshi: '+errors.join('; '));
}
// Shared edge cache preserves both successful snapshots and retry deadlines
// across cold starts at the same location. It is a cache, not a historical log.
const kalshiCacheKey='https://bc-election-watch.mark99.chatgpt.site/internal-cache/kalshi-v2';
let kalshiRecord:{source:Source<Quote[]>;nextAttempt:number}|null=null;
async function getKalshiSource():Promise<Source<Quote[]>>{
 const cache=typeof caches!=='undefined'?(caches as CacheStorage & {default?:Cache}).default:undefined;
 try { const cached=await cache?.match(kalshiCacheKey);if(cached){const record=await cached.json() as NonNullable<typeof kalshiRecord>;if(!kalshiRecord||record.nextAttempt>kalshiRecord.nextAttempt)kalshiRecord=record;} }catch(error){console.warn('Kalshi cache read unavailable');}
 // The persistent snapshot can be newer than a regional edge-cache entry.
 if(kalshiRecord)kalshiRecord.source=newerSource(kalshiRecord.source,latest.kalshi);
 const deadline=Math.max(Date.parse(latest.kalshi.retryAt??'')||0,Date.parse(latest.kalshi.fetchedAt)+300000);
 if(!kalshiRecord||deadline>kalshiRecord.nextAttempt)kalshiRecord={source:latest.kalshi,nextAttempt:deadline};
 if(kalshiRecord && Date.now()<kalshiRecord.nextAttempt)return kalshiRecord.source;
 const previous=kalshiRecord?.source??latest.kalshi;
 let source:Source<Quote[]>;let nextAttempt:number;
 try {source={data:await getKalshi(),live:true,fetchedAt:new Date().toISOString()};nextAttempt=Date.now()+300000;}
 catch(error){const rateLimited=error instanceof UpstreamError&&error.status===429;const delay=rateLimited?Math.max(900000,error.retryAfterMs):300000;nextAttempt=Date.now()+delay;source={...previous,live:false,retryAt:new Date(nextAttempt).toISOString(),error:rateLimited?'Kalshi is rate-limiting requests (HTTP 429). Showing the last successful snapshot.':'Kalshi refresh failed. Showing the last successful snapshot.'};console.error('Kalshi refresh unavailable',error instanceof Error?error.message:'Unknown error');}
 kalshiRecord={source,nextAttempt};
 try{await cache?.put(kalshiCacheKey,Response.json(kalshiRecord,{headers:{'Cache-Control':'public, max-age=86400'}}));}catch{console.warn('Kalshi cache write unavailable');}
 return source;
}
// Riding markets: one search for newly listed ridings, then each market by slug.
// Refreshed at most every 30 minutes to keep request counts low; a riding whose
// fetch fails keeps its last prices, and a 404 means the market is gone.
const ridingInterval=1800000,ridingRetry=600000,gamma='https://gamma-api.polymarket.com';
async function getRidingsSource(previous:Source<RidingMarket[]>):Promise<Source<RidingMarket[]>>{
 if(Date.now()<(Date.parse(previous.retryAt??'')||0)||!previous.error&&Date.now()-Date.parse(previous.fetchedAt)<ridingInterval)return previous;
 try{
  const slugs=new Set(KNOWN_RIDING_SLUGS);
  try{const found=JSON.parse(await fetchText(gamma+RIDING_SEARCH));for(const ev of found?.events??[])if(isRidingEvent(ev))slugs.add(ev.slug);}catch(error){console.warn('Riding market search unavailable',error instanceof Error?error.message:'Unknown error');}
  const list=[...slugs],results=await Promise.allSettled(list.map(async slug=>parseRidingEvent(JSON.parse(await fetchText(gamma+'/events/slug/'+encodeURIComponent(slug))))));
  const data:RidingMarket[]=[],failed:string[]=[];
  results.forEach((r,i)=>{if(r.status==='fulfilled'){data.push(r.value);return;}if(r.reason instanceof UpstreamError&&r.reason.status===404)return;failed.push(list[i]);const old=previous.data.find(m=>m.slug===list[i]);if(old)data.push(old);});
  if(failed.length===list.length)throw Error('All riding markets unavailable');
  return {data,fetchedAt:new Date().toISOString(),live:failed.length===0,...(failed.length?{error:`${failed.length} riding market${failed.length>1?'s':''} could not be refreshed; showing their last saved prices.`}:{})};
 }catch(error){console.error('Riding markets refresh failed',error instanceof Error?error.message:'Unknown error');return {...previous,live:false,retryAt:new Date(Date.now()+ridingRetry).toISOString(),error:'Riding markets refresh failed. Showing the last successful snapshot.'};}
}
export async function getDashboard(saved:Dashboard=initialData):Promise<Dashboard>{latest=mergeSnapshots(latest,saved);if(inFlight)return inFlight;if(Date.now()-lastAttempt<60000)return latest;lastAttempt=Date.now();inFlight=(async()=>{const [poly,kalshi,model,northern,taylor,voteScope,ridings]=await Promise.all([loadSource(latest.poly,async()=>parsePoly(JSON.parse(await fetchText('https://gamma-api.polymarket.com/events?slug=british-columbia-general-election-winner'))[0])),getKalshiSource(),loadSource(latest.model,async()=>parseModel(await fetchText(links.model))),loadSource(latest.northern,async()=>parseNorthern(await fetchText('https://northernvibe.ca/en/bc'))),loadSource(latest.taylor,async()=>parseTaylor(await fetchText('https://www.stephentaylor.ca/data/political/canada/provincial/projection/bc/'))),loadSource(latest.voteScope,async()=>parseVoteScope(await fetchText('https://vote-scope.com/web_data/british-columbia/latest.json'))),getRidingsSource(latest.ridings)]);latest=mergeSnapshots(latest,{poly,kalshi,model,northern,taylor,voteScope,ridings,astra:latest.astra,opus:latest.opus,checkedAt:new Date().toISOString()});return latest;})().finally(()=>{inFlight=null;});return inFlight;}
