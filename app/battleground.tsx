import type {Source} from '@/lib/election';
import type {AstraResult} from '@/lib/astra-model';
import type {OpusResult} from '@/lib/opus-model';
import type {RidingMarket} from '@/lib/ridings';
import {battleground,BATTLEGROUND as B,type RidingComparison} from '@/lib/battleground';
const pct=(n:number)=>n>0&&n<.5?'<1%':n>99.5&&n<100?'>99%':n.toFixed(0)+'%';
const seats=(n:number)=>n.toFixed(1);
const signed=(n:number)=>(n>0?'+':n<0?'−':'')+Math.abs(n).toFixed(0);
const dollars=(v:number)=>'$'+Math.round(v).toLocaleString('en-US');
const time=(s:string)=>new Date(s).toLocaleString('en-CA',{timeZone:'America/Vancouver',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+' PT';
const partyName={con:'Conservative',ndp:'NDP',green:'Green',one:'OneBC',centre:'CentreBC',other:'Independent/other'} as const;
const CON='#567fe9',NDP='#df762e';
function Row({r,gap}:{r:RidingComparison;gap?:number}){
 return <tr className={r.counted?undefined:'bg-uncounted'}>
  <th><a href={'https://polymarket.com/event/'+r.slug} target="_blank" rel="noreferrer">{r.riding}</a><small>{r.favourite.name} ({partyName[r.favourite.party]}) favoured · {dollars(r.volume)} traded{r.note?' · '+r.note:''}</small></th>
  <td>{pct(r.market.con)}</td><td>{pct(r.astra.con)}</td><td>{pct(r.opus.con)}</td>
  {gap!==undefined&&<td><span className={Math.abs(gap)>=20?'gap-badge prominent':'gap-badge'}>{signed(gap)}</span></td>}
 </tr>;
}
export default function Battleground({ridings,astra,opus}:{ridings:Source<RidingMarket[]>;astra:AstraResult;opus:OpusResult}){
 const b=battleground(ridings.data,astra,opus),n=b.counted;
 const diff=b.seats.market.con-(b.seats.astra.con+b.seats.opus.con)/2;
 const cards=[['Markets',b.seats.market,'Polymarket riding prices'],['Astra',b.seats.astra,'AI-built model'],['Opus 5.5',b.seats.opus,'AI-built model']] as const;
 return <section id="battleground" className="battleground" aria-labelledby="battleground-title">
  <div className="section-heading"><div><span className="section-no">03</span><h2 id="battleground-title">Battleground ridings</h2></div><span className="poll-method-tag">Riding markets vs Astra &amp; Opus</span></div>
  <p className="poll-intro">Polymarket has winner markets in only some ridings, mostly the competitive ones. These are the seats most likely to decide the election, so they are a fair place to compare what bettors expect with what the AI-built models expect.</p>
  {!b.ridings.length?<p className="model-warning">Riding market prices are not available yet{ridings.error?` (${ridings.error})`:''}.</p>:!n?<><p className="model-warning">None of the {b.ridings.length} riding markets passed the checks below, so there are no totals to compare.</p><details className="poll-definitions"><summary>All {b.ridings.length} riding markets</summary><div className="table-scroll"><table className="bg-table"><thead><tr><th>Riding</th><th>Markets</th><th>Astra</th><th>Opus</th></tr></thead><tbody>{b.ridings.map(r=><Row key={r.slug} r={r}/>)}</tbody></table></div></details></>:<>
  <div className="bg-cards">{cards.map(([name,s,sub])=><article key={name} className="bg-card">
   <h3>{name}<span>{sub}</span></h3>
   <div className="bg-seats"><div><strong style={{color:CON}}>{seats(s.con)}</strong><span>Conservative</span></div><div><strong style={{color:NDP}}>{seats(s.ndp)}</strong><span>NDP</span></div></div>
   <p>Expected seats of {n}</p>
  </article>)}</div>
  <p className="bg-takeaway">{Math.abs(diff)<.5?`Markets and the models expect about the same Conservative seat count in these ${n} ridings.`:`Markets expect ${seats(Math.abs(diff))} ${diff>0?'more':'fewer'} Conservative seats in these ${n} ridings than the average of Astra and Opus.`}</p>
  <div className="table-panel"><div className="bg-table-head"><h3>Where markets and models disagree most</h3><span>Conservative chance of winning the riding</span></div><div className="table-scroll"><table className="bg-table"><thead><tr><th>Riding</th><th>Markets</th><th>Astra</th><th>Opus</th><th>Gap <span>(pp)</span></th></tr></thead><tbody>
   {b.disagreements.slice(0,5).map(r=><Row key={r.slug} r={r} gap={r.gap}/>)}
  </tbody></table></div><p className="table-note">Gap = market minus the average of Astra and Opus. Positive means bettors rate the Conservatives higher than the models do. Bettors may know about local candidates, independents or floor-crossers that the models only adjust for roughly; they may also just be wrong in a thin market.</p></div>
  <details className="poll-definitions"><summary>All {b.ridings.length} riding markets</summary><div className="table-scroll"><table className="bg-table"><thead><tr><th>Riding</th><th>Markets</th><th>Astra</th><th>Opus</th></tr></thead><tbody>{b.ridings.map(r=><Row key={r.slug} r={r}/>)}</tbody></table></div></details>
  </>}
  <details className="poll-definitions"><summary>How this is calculated</summary>
   <p>Each candidate’s price is the midpoint of the best bid and ask, or the last price if one side is missing. Candidates are matched to parties using the Elections BC candidate list; placeholder and unmatched names are dropped, and the rest are rescaled to add to 100%, because raw prices usually total a little over 100%. A riding is counted only if at least US{dollars(B.minVolume)} has been traded and at least {B.minMatched}% of its price can be matched to listed candidates. Spreads over {B.wideSpread} points are flagged: those prices could easily be several points off.</p>
   <p>Expected seats add up each party’s chance of winning across the counted ridings. They cover only ridings with markets, so they are not a province-wide seat projection, and riding markets are far thinner than the province-wide winner markets. Astra and Opus figures are their own riding win chances from the same simulations as their headline forecasts.</p>
   <p className="bg-status">Riding prices {ridings.live?'fetched':'saved'} {time(ridings.fetchedAt)} · refreshed at most every 30 minutes{b.unmatched.length?` · Not matched to a riding: ${b.unmatched.join(', ')}`:''}{ridings.error&&n?` · ${ridings.error}`:''}</p>
  </details>
 </section>;
}
