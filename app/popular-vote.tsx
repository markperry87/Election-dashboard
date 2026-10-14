import type {Source} from '@/lib/election';
import type {AstraResult,VoteShare} from '@/lib/astra-model';
import type {OpusResult} from '@/lib/opus-model';
import type {PollEstimate} from '@/lib/poll-models';
import {IDS} from '@/lib/astra-inputs';
const names=['BC Conservatives','BC NDP','BC Greens','OneBC','CentreBC','Other candidates'];
const colors=['#567fe9','#df762e','#389e79','#b68c70','#b09ae0','#82919f'];
const SEATS=93;
const pct=(n:number)=>n>0&&n<.1?'<0.1%':n.toFixed(1)+'%';
const range=(v:VoteShare|undefined)=>v?<>{pct(v.mean)}<small className="vote-range">{v.low.toFixed(1)}–{v.high.toFixed(1)}</small></>:'—';
const day=(s:string)=>new Date(s+'T12:00:00Z').toLocaleDateString('en-CA',{timeZone:'UTC',month:'short',day:'numeric'});
export default function PopularVote({astra,opus,voteScope}:{astra:AstraResult;opus:OpusResult;voteScope:Source<PollEstimate>}){
 const o=opus.popularVote,a=astra.popularVote,vs=voteScope.data.vote;
 if(!o&&!a)return null;
 // Cards use the Opus estimate, falling back to Astra when only it is available.
 const lead=o?{name:'Opus 5.5',vote:o,seats:opus.seats}:{name:'Astra',vote:a!,seats:astra.seats};
 return <section className="popular-vote" aria-labelledby="popular-vote-title">
  <div className="section-heading"><div><h2 id="popular-vote-title">Popular vote</h2></div><span className="poll-method-tag">Election-day estimates · October 24</span></div>
  <p className="poll-intro">Each party’s expected share of the province-wide vote, with the range that covers 8 in 10 simulated outcomes. Individual polls measure intention on the days they were taken; these estimates combine them and allow for polling error and movement before election day.</p>
  <div className="vote-cards">
   {[0,1].map(p=>{const seatShare=lead.seats[IDS[p]].mean/SEATS*100;return <article key={p} className="vote-card" style={{'--party':colors[p]} as React.CSSProperties}>
    <h3><span className="party-dot"/>{names[p]}</h3>
    <div className="vote-flow"><div><strong>{pct(lead.vote.share[p].mean)}</strong><span>of the vote</span></div><span className="vote-arrow" aria-hidden="true">→</span><div><strong>{pct(seatShare)}</strong><span>of the seats</span></div></div>
    <p>About {Math.round(lead.seats[IDS[p]].mean)} of {SEATS} seats, by the {lead.name} model.</p>
   </article>;})}
   <article className="vote-card split-card">
    <h3>Most votes, but not most seats</h3>
    <div className="vote-flow"><div><strong>{o?pct(o.splitWinner):'—'}</strong><span>Opus 5.5</span></div><div><strong>{a?pct(a.splitWinner):'—'}</strong><span>Astra</span></div></div>
    <p>Chance that one party wins the most seats outright while another wins the most votes.</p>
   </article>
  </div>
  <div className="table-panel"><div className="table-scroll"><table className="vote-table"><thead><tr><th>Party</th><th>Opus 5.5</th><th>Astra</th><th>Vote-Scope <span>{day(voteScope.data.date)}</span></th><th>Share of seats <span>Opus 5.5</span></th></tr></thead><tbody>
   {IDS.map((id,p)=><tr key={id}><th><span className="party-dot" style={{background:colors[p]}}/>{names[p]}</th><td>{range(o?.share[p])}</td><td>{range(a?.share[p])}</td><td>{range(vs?.[id])}</td><td>{pct(opus.seats[id].mean/SEATS*100)}</td></tr>)}
  </tbody></table></div><p className="table-note">Vote shares are averages across simulations, with 80% ranges in small type. The Greens’ and new parties’ support is spread thinly, so their share of seats falls well below their share of the vote, while the two leading parties win a larger share of seats than of votes. Vote-Scope publishes its own estimate; its ranges are its own 80% intervals. Other candidates’ votes are combined here, although they compete separately for seats.</p></div>
 </section>;
}
