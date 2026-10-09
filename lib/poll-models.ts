import type {Dashboard, Source} from './election';

export type PollEstimate = {
 date: string;
 probabilities: {con:number; ndp:number};
 tie?: number;
};
export type PollModel = {id:string;name:string;href:string;source:Source<PollEstimate>;basis:string};
const plain=(html:string)=>html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/\s+/g,' ').trim();
function checked(date:string|undefined,con:number,ndp:number,tie?:number):PollEstimate {
 if(!date||!/^\d{4}-\d{2}-\d{2}$/.test(date)||[con,ndp,...(tie===undefined?[]:[tie])].some(n=>!Number.isFinite(n)||n<0||n>100)||con+ndp>101.5)throw Error('Incomplete most-seats probabilities');
 return {date,probabilities:{con,ndp},...(tie===undefined?{}:{tie})};
}
export function parseNorthern(html:string):PollEstimate {
 const text=plain(html),date=text.match(/Current seat projection\s*[·]?\s*(\d{4}-\d{2}-\d{2})/)?.[1];
 // Read the published outcome list, not the headline majority call or riding odds.
 const items=[...html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map(m=>plain(m[1]));
 const read=(label:string)=>{const item=items.find(t=>t.startsWith(label+' '));const value=item?.slice(label.length).trim().match(/^(\d+(?:\.\d+)?)\s*%$/);if(!value)throw Error('Northern Vibe outcome format changed');return Number(value[1]);};
 return checked(date,read('Conservative majority')+read('Conservative most seats, no majority'),read('BC NDP majority')+read('BC NDP most seats, no majority'),read('Tie for most seats'));
}
export function parseVoteScope(html:string):PollEstimate {
 const text=plain(html),date=text.match(/Latest run:\s*(\d{4}-\d{2}-\d{2})/)?.[1];
 const cards=html.split(/<div\b[^>]*class="pe-projection-card"[^>]*>/).slice(1).map(plain);
 const read=(party:string)=>{const card=cards.find(t=>t.startsWith(party+' '));const match=card?.match(/P\(largest\)\s*(\d+(?:\.\d+)?)\s*%/);if(!match)throw Error('Vote-Scope largest-party format changed');return Number(match[1]);};
 return checked(date,read('Conservative Party of BC'),read('BC NDP'));
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
export function pollConsensus(models:PollModel[]) {
 return (['con','ndp'] as const).map(id=>{
  const values=models.map(m=>m.source.data.probabilities[id]).filter(Number.isFinite).sort((a,b)=>a-b);
  if(values.length!==models.length||!values.length)return {id,median:null,min:null,max:null,spread:null};
  const mid=Math.floor(values.length/2),median=values.length%2?values[mid]:(values[mid-1]+values[mid])/2;
  return {id,median,min:values[0],max:values.at(-1)!,spread:values.at(-1)!-values[0]};
 });
}
