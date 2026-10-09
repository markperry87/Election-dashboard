import seed from './data/history.json';
import polyMarkets from './data/poly.json';
import {fetchText,UpstreamError,type Source} from './election';
export type HistoryPoint={t:number;price:number|null;volume:number};
export type MarketHistory=Record<string,HistoryPoint[]>;
export type Histories={poly:Source<MarketHistory>;kalshi:Source<MarketHistory>};
export const historySeed=seed as Histories;
const mappings=[{id:'ndp',poly:'NDP',kalshi:'NDP'},{id:'con',poly:'Conservative',kalshi:'CON'},{id:'green',poly:'Greens',kalshi:'GRN'},{id:'centre',poly:'CentreBC',kalshi:'CTR'},{id:'one',poly:'OneBC',kalshi:'ONE'}];
const start=Date.parse('2026-09-23T00:00:00Z')/1000;
async function polyHistory():Promise<MarketHistory>{
 const out:MarketHistory={};const end=Math.floor(Date.now()/1000);
 for(const map of mappings){
  const m=polyMarkets.markets.find(m=>m.groupItemTitle===map.poly)!;
  const token=JSON.parse(m.clobTokenIds)[0];
  const h=JSON.parse(await fetchText(`https://clob.polymarket.com/prices-history?market=${token}&startTs=${start}&endTs=${end}&fidelity=60`));
  if(!h.history?.length)throw Error('Missing Polymarket price history');
  const trades:any[]=[];
  for(let offset=0;;offset+=1000){if(offset>9000)throw Error('Trade history exceeds public backfill limit');const batch=JSON.parse(await fetchText(`https://data-api.polymarket.com/trades?market=${m.conditionId}&limit=1000&offset=${offset}&takerOnly=true`));if(!Array.isArray(batch))throw Error('Trade history unavailable');trades.push(...batch);if(batch.length<1000)break;}
  trades.sort((a,b)=>a.timestamp-b.timestamp);let i=0,volume=0;
  out[map.id]=h.history.sort((a:any,b:any)=>a.t-b.t).map((p:any)=>{while(i<trades.length&&trades[i].timestamp<=p.t){const size=Number(trades[i++].size);if(!Number.isFinite(size)||size<0)throw Error('Invalid trade size');volume+=size;}if(!Number.isFinite(p.p)||p.p<0||p.p>1)throw Error('Invalid historical price');return{t:p.t,price:p.p*100,volume};});
 }
 return out;
}
async function kalshiHistory():Promise<MarketHistory>{
 const out:MarketHistory={};const end=Math.floor(Date.now()/1000);
 for(const map of mappings){
  const d=JSON.parse(await fetchText(`https://external-api.kalshi.com/trade-api/v2/series/KXBCELECTION/markets/KXBCELECTION-26OCT24-${map.kalshi}/candlesticks?start_ts=${start}&end_ts=${end}&period_interval=60`));
  if(!d.candlesticks?.length)throw Error('Missing Kalshi price history');let volume=0;let price:number|null=null;
  out[map.id]=d.candlesticks.sort((a:any,b:any)=>a.end_period_ts-b.end_period_ts).map((c:any)=>{const v=Number(c.volume_fp);if(!Number.isFinite(v)||v<0)throw Error('Invalid candle volume');volume+=v;const p=c.price?.close_dollars??c.price?.previous_dollars;if(p!==null&&p!==undefined){const n=Number(p);if(!Number.isFinite(n)||n<0||n>1)throw Error('Invalid candle price');price=n*100;}return {t:c.end_period_ts,price,volume};});
 }
 return out;
}
let flight:Promise<Histories>|null=null;
const memory:Partial<Record<keyof Histories,{source:Source<MarketHistory>;nextAttempt:number}>>={};
async function sourceHistory(name:keyof Histories,read:()=>Promise<MarketHistory>){
 const cache=typeof caches!=='undefined'?(caches as CacheStorage & {default?:Cache}).default:undefined;
 const key=`https://bc-election-watch.mark99.chatgpt.site/internal-cache/history-v1-${name}`;
 try{const r=await cache?.match(key);if(r){const record=await r.json() as NonNullable<typeof memory.poly>;if(!memory[name]||record.nextAttempt>memory[name]!.nextAttempt)memory[name]=record;}}catch{}
 const prior=memory[name];if(prior&&prior.nextAttempt>Date.now())return prior.source;
 let source:Source<MarketHistory>;let delay=3600000;
 try{source={data:await read(),fetchedAt:new Date().toISOString(),live:true};}catch(e){if(e instanceof UpstreamError)delay=Math.max(delay,e.retryAfterMs);source={...(prior?.source??historySeed[name]),live:false,error:'Historical refresh unavailable. Saved source history is shown.',retryAt:new Date(Date.now()+delay).toISOString()};}
 const record={source,nextAttempt:Date.now()+delay};memory[name]=record;
 try{await cache?.put(key,Response.json(record,{headers:{'Cache-Control':'public, max-age=86400'}}));}catch{}
 return source;
}
export async function getHistories():Promise<Histories>{if(flight)return flight;flight=Promise.all([sourceHistory('poly',polyHistory),sourceHistory('kalshi',kalshiHistory)]).then(([poly,kalshi])=>({poly,kalshi})).finally(()=>{flight=null;});return flight;}
