import type {Dashboard, Source} from './election';

export type PollEstimate = {
 date: string;
 probabilities: {con:number; ndp:number};
 tie?: number;
 // Projected province-wide vote share with an 80% range, where the source publishes one.
 vote?: Partial<Record<'con'|'ndp'|'green'|'one'|'centre'|'other', {mean:number; low:number; high:number}>>;
};
export type PollModel = {id:string;name:string;href:string;source:Source<PollEstimate>;basis:string};
const plain=(html:string)=>html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/\s+/g,' ').trim();
function checked(date:string|undefined,con:number,ndp:number,tie?:number):PollEstimate {
 if(!date||!/^\d{4}-\d{2}-\d{2}$/.test(date)||[con,ndp,...(tie===undefined?[]:[tie])].some(n=>!Number.isFinite(n)||n<0||n>100)||con+ndp>101.5)throw Error('Incomplete most-seats probabilities');
 return {date,probabilities:{con,ndp},...(tie===undefined?{}:{tie})};
}
const months=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
// "Oct 13, 2026" -> "2026-10-13"; undefined if the text is not a date.
function isoDate(text:string|undefined){const m=text?.match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),\s+(\d{4})$/);const month=m?months.indexOf(m[1].toLowerCase()):-1;return m&&month>=0?`${m[3]}-${String(month+1).padStart(2,'0')}-${m[2].padStart(2,'0')}`:undefined;}
export function parseNorthern(html:string):PollEstimate {
 // Northern Vibe has labelled its projection both ways: an ISO "Current seat
 // projection" date, and later "If a provincial election were held today Oct 13, 2026".
 const text=plain(html),date=text.match(/Current seat projection\s*[·]?\s*(\d{4}-\d{2}-\d{2})/)?.[1]??isoDate(text.match(/held today\s+([A-Za-z]{3,9}\.?\s+\d{1,2},\s+\d{4})/)?.[1]);
 // Read the published outcome list, not the headline majority call or riding odds.
 const items=[...html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map(m=>plain(m[1]));
 // Small chances are published as "<1%" (sometimes still HTML-escaped); count them as half the bound.
 const read=(label:string)=>{const item=items.find(t=>t.startsWith(label+' '));const value=item?.slice(label.length).trim().replace(/^&lt;\s*/,'<').match(/^(<\s*)?(\d+(?:\.\d+)?)\s*%$/);if(!value)throw Error('Northern Vibe outcome format changed');return value[1]?Number(value[2])/2:Number(value[2]);};
 return checked(date,read('Conservative majority')+read('Conservative most seats, no majority'),read('BC NDP majority')+read('BC NDP most seats, no majority'),read('Tie for most seats'));
}
// Vote-Scope publishes its forecast run as JSON; p_strict_largest excludes ties.
export function parseVoteScope(json:string):PollEstimate {
 const data=JSON.parse(json);if(data.meta?.election_cycle!=='bc_44')throw Error('Wrong Vote-Scope election');
 type Row={party?:string;p_strict_largest?:unknown;vote_mean?:unknown;vote_ci_low_80?:unknown;vote_ci_high_80?:unknown};
 const rows:Row[]=data.parties??[];
 const read=(party:string)=>{const p=rows.find(x=>x.party===party)?.p_strict_largest;if(typeof p!=='number')throw Error('Vote-Scope largest-party format changed');return p*100;};
 // Vote shares are optional extras: keep any party whose three figures are present.
 const vote:PollEstimate['vote']={};
 for(const [id,party] of [['con','bc_con'],['ndp','bc_ndp'],['green','bc_grn'],['one','bc_onebc'],['centre','bc_centre'],['other','bc_oth']] as const){
  const r=rows.find(x=>x.party===party),v=[r?.vote_mean,r?.vote_ci_low_80,r?.vote_ci_high_80];
  if(v.every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=100))vote[id]={mean:v[0] as number,low:v[1] as number,high:v[2] as number};
 }
 return {...checked(data.meta.run_date,read('bc_con'),read('bc_ndp')),...(Object.keys(vote).length?{vote}:{})};
}
export function pollModels(data:Dashboard):PollModel[] {
 const odds=data.model.data.indexodds;
 const value=(label:string)=>odds.parties.find(p=>p.label===label)?.value??NaN;
 return [
  {id:'338',name:'338Canada',href:'https://338canada.com/bc/',source:{...data.model,data:{date:odds.date,probabilities:{con:value('CPBC'),ndp:value('NDP')},tie:value('Tie')}},basis:'Published odds of winning the most seats'},
  {id:'northern',name:'Northern Vibe',href:'https://northernvibe.ca/en/bc',source:data.northern,basis:'Majority + most seats without a majority; rounded source figures'},
  {id:'votescope',name:'Vote-Scope',href:'https://vote-scope.com/en/canada/british-columbia/',source:data.voteScope,basis:'P(largest): finishes strictly first'},
  {id:'astra',name:'Astra model',href:'#astra',source:data.astra,basis:'Experimental election-day forecast: 20,000 correlated riding simulations; outright most seats'},
 ];
}
// Shown beside the four headline models for comparison; not part of the median.
export function opusModel(data:Dashboard):PollModel {
 return {id:'opus',name:'Opus 5.5 model',href:'#opus',source:data.opus,basis:'AI-built challenger to Astra: house-effect-adjusted polls, mixed uniform/proportional swing, fat-tailed joint errors, 10,000 riding simulations; outright most seats. Not in the headline median'};
}
export function pollConsensus(models:PollModel[]) {
 return (['con','ndp'] as const).map(id=>{
  const values=models.map(m=>m.source.data.probabilities[id]).filter(Number.isFinite).sort((a,b)=>a-b);
  if(values.length!==models.length||!values.length)return {id,median:null,min:null,max:null,spread:null};
  const mid=Math.floor(values.length/2),median=values.length%2?values[mid]:(values[mid-1]+values[mid])/2;
  return {id,median,min:values[0],max:values.at(-1)!,spread:values.at(-1)!-values[0]};
 });
}
