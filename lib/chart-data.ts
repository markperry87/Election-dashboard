import type {Histories,HistoryPoint,MarketHistory} from './history';
import type {Dashboard,Projection} from './election';
import {parties} from './election';
import {weightedMean} from './consensus';
export type ChartRow={t:number;[key:string]:number|null};
export function marketChartRows(history:Histories,current:Dashboard):ChartRow[]{
 const all=[...Object.values(history.poly.data).flat(),...Object.values(history.kalshi.data).flat()];if(!all.length)return [];
 let earliest=Infinity;for(const p of all)if(p.t<earliest)earliest=p.t;
 const first=Math.ceil(earliest/3600)*3600;
 // Stop at the older source's last successful fetch: carrying a stale source's
 // last price forward would draw a flat line that was never observed.
 const fetched=Math.min(Date.parse(history.poly.fetchedAt),Date.parse(history.kalshi.fetchedAt))/1000;
 let latestPoint=-Infinity;for(const p of all)if(p.t>latestPoint)latestPoint=p.t;
 const end=Math.floor(Math.min(Date.now()/1000,fetched,latestPoint)/3600)*3600;
 const rows:ChartRow[]=[];
 const pointers:Record<string,number>={};
 function snapshot(data:MarketHistory,source:string,t:number){const out:Record<string,HistoryPoint|undefined>={};for(const p of parties){const a=data[p.id]??[];const key=source+p.id;let i=pointers[key]??-1;while(i+1<a.length&&a[i+1].t<=t)i++;pointers[key]=i;out[p.id]=i<0?undefined:a[i];}return out;}
 for(let t=first;t<=end;t+=3600){const p=snapshot(history.poly.data,'p',t),k=snapshot(history.kalshi.data,'k',t);const pv=Object.values(p).reduce((s,v)=>s+(v?.volume??0),0),kv=Object.values(k).reduce((s,v)=>s+(v?.volume??0),0);const row:ChartRow={t:t*1000,pv,kv};for(const party of parties)row[party.id]=weightedMean(p[party.id]?.price??null,k[party.id]?.price??null,pv,kv);rows.push(row);}
 // Append current prices only when they are newer than historical observations.
 const latest=Math.min(Date.parse(current.poly.fetchedAt),Date.parse(current.kalshi.fetchedAt));
 if(latest>=(rows.at(-1)?.t??0)){
  // Break the line across hours with no history instead of joining them.
  const last=rows.at(-1);if(last&&latest-last.t>2*3600000){const gap:ChartRow={t:last.t+3600000,pv:null,kv:null};for(const p of parties)gap[p.id]=null;rows.push(gap);}
  const pv=current.poly.data.reduce((s,q)=>s+q.volume,0),kv=current.kalshi.data.reduce((s,q)=>s+q.volume,0);const row:ChartRow={t:latest,pv,kv};for(const p of parties)row[p.id]=weightedMean(current.poly.data.find(q=>q.id===p.id)?.price??null,current.kalshi.data.find(q=>q.id===p.id)?.price??null,pv,kv);rows.push(row);}
 return rows;
}
export function modelChartRows(projection:Projection):ChartRow[]{return projection.dates.map((date,i)=>{const row:ChartRow={t:Date.parse(date+'T12:00:00Z')};for(const p of projection.parties)row[p.label]=p.values[i]??null;return row;});}
