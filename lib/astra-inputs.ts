export const ASTRA_URLS = {
 northern: 'https://northernvibe.ca/en/bc/polls',
 votescope: 'https://vote-scope.com/web_data/british-columbia/polls/index.json',
 canada338: 'https://338canada.com/bc/polls.htm',
 candidates: 'https://elections.bc.ca/2026-provincial-election/candidate-list/',
};
export const IDS = ['con','ndp','green','one','centre','other'] as const;
export type Party = typeof IDS[number];
export type Poll = {firm:string;start:string;end:string;n:number|null;shares:(number|null)[];sources:string[];weight?:number;provisional?:boolean;reportedAt?:string;note?:string};
// A weighting assumption, never displayed as a reported sample size.
export const pollSample=(p:Poll)=>p.n??500;
export type Candidate = {district:string;name:string;party:Party;affiliation:string};
export const clean=(s:string)=>s.replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&#x27;|&#039;|&#39;/g,"'").replace(/&nbsp;|&#160;/g,' ').replace(/&[a-z]+;/g,' ').replace(/\s+/g,' ').trim();
export const key=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function firmKey(s:string){const k=key(s);return ['angusreid','innovative','liaison','leger','ipsos','researchco','yorkville','mainstreet','pallas'].find(f=>k.includes(f))??k;}
const cells=(row:string)=>[...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m=>clean(m[1]));
function valid(p:Poll){return /^\d{4}-\d{2}-\d{2}$/.test(p.end)&&Number.isFinite(Date.parse(p.end))&&p.n!==null&&p.n>=100&&p.n<=100000&&p.shares.slice(0,3).every(v=>v!==null&&Number.isFinite(v)&&v>=0&&v<=100)&&p.shares.every(v=>v===null||Number.isFinite(v)&&v>=0&&v<=100)&&p.shares.reduce<number>((a,v)=>a+(v??0),0)<=103;}
export function parseNorthernPolls(html:string):Poll[]{
 const polls=[...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].flatMap(m=>{const c=cells(m[1]);if(c.length!==9)return [];const dates=c[1].match(/\d{4}-\d{2}-\d{2}/g);if(!dates)return [];return [{firm:c[0],start:dates[0],end:dates.at(-1)!,n:Number(c[8].replace(/,/g,'')),shares:c.slice(2,8).map(v=>/^\d/.test(v)?Number(v):null),sources:['Northern Vibe']}];}).filter(valid);
 if(polls.length<3)throw Error('Northern Vibe polling table unavailable');return polls;
}
export function parseVotePolls(text:string):Poll[]{
 const data=JSON.parse(text);if(data.meta?.election_cycle!=='bc_44')throw Error('Wrong Vote-Scope election');
 const fields=['bc_con','bc_ndp','bc_grn','bc_onebc','bc_centre','bc_oth'];
 const polls=(data.polls??[]).map((p:any)=>({firm:p.firm_name??p.firm,start:p.field_start,end:p.field_end,n:p.sample_size,shares:fields.map(k=>p.topline?.[k]??null),sources:['Vote-Scope']})).filter(valid);
 if(polls.length<3)throw Error('Vote-Scope polling data unavailable');return polls;
}
export function parse338Polls(html:string):Poll[]{
 const polls=[...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].flatMap(m=>{
  const row=m[1],c=cells(row),date=clean(row).match(/\d{4}-\d{2}-\d{2}/)?.[0];
  const firm=row.match(/newpt-firm-name[^>]*>([\s\S]*?)<\/a>/)?.[1],n=clean(row).match(/n=([\d,]+)/)?.[1];
  if(!date||!firm||!n||c.length<7)return [];
  const v=c.slice(2,7).map(v=>/^\d+(\.\d+)?$/.test(v)?Number(v):null);
  return [{firm:clean(firm),start:date,end:date,n:Number(n.replace(/,/g,'')),shares:[v[1],v[0],v[2],v[3],v[4],v.every(x=>x!==null)?Math.max(0,100-v.reduce<number>((s,x)=>s+(x??0),0)):null],sources:['338Canada']}];
 }).filter(valid);if(polls.length<3)throw Error('338Canada polling table unavailable');return polls;
}
export function mergePolls(groups:Poll[][]):Poll[]{
 const result:Poll[]=[];
 // Prefer full fieldwork dates from Vote-Scope/Northern Vibe over 338 midpoint dates.
 for(const p of groups.flat()){
  const match=result.find(q=>firmKey(q.firm)===firmKey(p.firm)&&(Math.abs(Date.parse(q.end)-Date.parse(p.end))<=3*86400000||p.end>=q.start&&p.end<=q.end||q.end>=p.start&&q.end<=p.end)&&q.shares.slice(0,3).every((v,i)=>v===p.shares[i]));
  if(match){match.sources=[...new Set([...match.sources,...p.sources])];for(let i=0;i<6;i++)if(match.shares[i]===null)match.shares[i]=p.shares[i];match.n=match.n===null?p.n:p.n===null?match.n:Math.min(match.n,p.n);}
  else result.push({...p,shares:[...p.shares],sources:[...p.sources]});
 }return result.sort((a,b)=>b.end.localeCompare(a.end));
}
// Keep user-supplied reports across refreshes, but replace a matching report
// with catalog metadata when it arrives. Do not count the same wave twice.
export function withSupplementalPolls(polls:Poll[],supplemental:Poll[]):Poll[]{
 const catalog=polls.filter(p=>!p.provisional);
 const pending=supplemental.filter(p=>!catalog.some(q=>firmKey(q.firm)===firmKey(p.firm)&&Math.abs(Date.parse(q.end)-Date.parse(p.reportedAt??p.end))<=7*86400000&&q.shares.slice(0,3).every((v,i)=>v===p.shares[i])));
 return mergePolls([catalog,pending]);
}
export function candidateParty(s:string):Party {if(/conservative/i.test(s))return 'con';if(/ndp/i.test(s))return 'ndp';if(/green/i.test(s))return 'green';if(/one\s?bc/i.test(s))return 'one';if(/centre/i.test(s))return 'centre';return 'other';}
export function parseCandidates(html:string):Candidate[]{
 if(!html.includes('2026 Provincial General Election'))throw Error('Wrong candidate election');
 const rows=[...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].flatMap(m=>{const c=cells(m[1]);return c.length===5&&/^\d+$/.test(c[1])?[{district:c[0],name:c[3],party:candidateParty(c[4]),affiliation:c[4]}]:[];});
 if(new Set(rows.map(r=>key(r.district))).size!==93||rows.length<250)throw Error('Candidate list incomplete');
 return rows;
}
