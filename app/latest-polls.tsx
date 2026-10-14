import type {Poll} from '@/lib/astra-inputs';
import {untrackedEntries,type PollLedger} from '@/lib/poll-ledger';
const pct=(n:number|null)=>n===null?'—':Number.isInteger(n)?n+'%':n.toFixed(1)+'%';
const time=(s:string)=>new Date(s).toLocaleString('en-CA',{timeZone:'America/Vancouver',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+' PT';
const day=(s:string)=>new Date(s+'T12:00:00Z').toLocaleDateString('en-CA',{timeZone:'UTC',month:'short',day:'numeric'});
const fieldwork=(start:string,end:string)=>start===end?day(end):`${day(start)} – ${day(end)}`;
const SHOWN=6;
export default function LatestPolls({polls,ledger}:{polls:Poll[];ledger?:PollLedger}){
 const entries=ledger?.entries??untrackedEntries(polls);
 const since=ledger?.previousUpdate??null;
 const isNew=(firstSeen:string|null)=>since!==null&&firstSeen!==null&&firstSeen>since;
 // Newest arrivals first, then most recent fieldwork.
 const sorted=[...entries].sort((a,b)=>(b.firstSeen??'').localeCompare(a.firstSeen??'')||b.end.localeCompare(a.end));
 const fresh=sorted.filter(e=>isNew(e.firstSeen));
 const shown=sorted.slice(0,Math.max(SHOWN,fresh.length));
 const summary=!ledger?'The most recent polls in the Astra and Opus 5.5 polling averages.'
  :since===null?'Tracking of new polls starts with this update. The most recent polls are below.'
  :fresh.length?`${fresh.length} new poll${fresh.length>1?'s':''} since the last update at ${time(since)}.`
  :`No new polls since the last update at ${time(since)}. The most recent are below.`;
 return <section className="latest-polls" aria-labelledby="latest-polls-title">
  <div className="section-heading"><div><h2 id="latest-polls-title">Latest polls</h2></div><span className="poll-method-tag">Inputs to Astra and Opus 5.5</span></div>
  <p className={fresh.length?'latest-summary has-new':'latest-summary'}>{summary}</p>
  <div className="table-panel"><div className="table-scroll"><table><thead><tr><th>Pollster · fieldwork</th>{ledger&&<th>Added</th>}<th>Sample</th><th>Con</th><th>NDP</th><th>Green</th><th>OneBC</th><th>Centre</th></tr></thead><tbody>
   {shown.map(e=><tr key={e.key} className={isNew(e.firstSeen)?'is-new':undefined}>
    <th>{e.firm}{isNew(e.firstSeen)&&<span className="new-pill">New</span>}<small className="astra-field-date">{e.provisional?`Reported ${e.reportedAt}; fieldwork unknown`:fieldwork(e.start,e.end)}</small></th>
    {ledger&&<td>{e.firstSeen?time(e.firstSeen):'Before tracking'}</td>}
    <td>{e.n===null?'Unknown':e.n.toLocaleString()}</td>
    {e.shares.slice(0,5).map((v,i)=><td key={i}>{pct(v)}</td>)}
   </tr>)}
  </tbody></table></div><p className="table-note">Polls published in the last six weeks, after removing duplicates listed by more than one catalog (338Canada, Northern Vibe, Vote-Scope). “Added” is the update in which a poll first appeared here, not its release time. Full weights are in each model’s panel.</p></div>
 </section>;
}
