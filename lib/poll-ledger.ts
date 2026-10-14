import {firmKey,type Poll} from './astra-inputs';

// Tracks when each poll first appeared in a published snapshot, so the page can
// show which polls are new since the previous update. Used by the snapshot build.
export type PollEntry={key:string;firm:string;start:string;end:string;n:number|null;shares:(number|null)[];sources:string[];provisional?:boolean;reportedAt?:string;firstSeen:string|null};
export type PollLedger={updatedAt:string;previousUpdate:string|null;seen:Record<string,string|null>;entries:PollEntry[]};

// Same firm, fieldwork end and rounded Conservative/NDP topline means the same poll.
export const pollKey=(p:Poll)=>[firmKey(p.firm),p.end,...p.shares.slice(0,2).map(v=>v===null?'-':Math.round(v))].join('|');
const entry=(p:Poll,firstSeen:string|null):PollEntry=>({key:pollKey(p),firm:p.firm,start:p.start,end:p.end,n:p.n,shares:p.shares,sources:p.sources,provisional:p.provisional,reportedAt:p.reportedAt,firstSeen});

// Catalogs revise fieldwork dates (Oct 9 becomes Oct 7–11), so a poll from the same
// firm with the same topline and an end date within a week is the one already seen.
function revisionOf(key:string,seen:Record<string,string|null>){
 const [firm,end,con,ndp]=key.split('|');
 return Object.keys(seen).find(k=>{const [f,e,c,n]=k.split('|');return f===firm&&c===con&&n===ndp&&Math.abs(Date.parse(e)-Date.parse(end))<=7*86400000;});
}
// Polls already present when tracking began have no known arrival time (null).
export function updateLedger(previous:PollLedger|null,polls:Poll[],now:string):PollLedger{
 const seen={...previous?.seen};
 for(const p of polls){
  const k=pollKey(p);if(k in seen)continue;
  const earlier=revisionOf(k,seen);
  seen[k]=earlier!==undefined?seen[earlier]:previous?now:null;
 }
 return {updatedAt:now,previousUpdate:previous?.updatedAt??null,seen,entries:polls.map(p=>entry(p,seen[pollKey(p)]))};
}
// Without a ledger (the live app), list the polls with no arrival times.
export const untrackedEntries=(polls:Poll[])=>polls.map(p=>entry(p,null));
