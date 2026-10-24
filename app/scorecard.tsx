import type {Source} from '@/lib/election';
import type {AstraResult} from '@/lib/astra-model';
import type {OpusResult} from '@/lib/opus-model';
import {IDS,type Party} from '@/lib/astra-inputs';
import {probability} from '@/lib/astra-format';
import {finalForecast} from '@/lib/final-forecast';
import {results,scoreModel,SEATS,type ModelScore,type PartyScore} from '@/lib/scorecard';
const names:Record<Party|'tie',string>={con:'BC Conservatives',ndp:'BC NDP',green:'BC Greens',one:'OneBC',centre:'CentreBC',other:'Other candidates',tie:'Seat tie'};
const short:Record<Party,string>={con:'Con',ndp:'NDP',green:'Green',one:'OneBC',centre:'Centre',other:'Other'};
const time=(s:string)=>new Date(s).toLocaleString('en-CA',{timeZone:'America/Vancouver',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+' PT';
const day=(s:string)=>new Date(s+'T12:00:00Z').toLocaleDateString('en-CA',{timeZone:'UTC',month:'short',day:'numeric'});
const status={pending:'Awaiting results',preliminary:'Preliminary results',final:'Final results'};
const range=(p:PartyScore)=><>{p.mean.toFixed(1)}<small className="vote-range">{p.low}–{p.high}</small></>;
export default function Scorecard({astra,opus}:{astra:Source<AstraResult>;opus:Source<OpusResult>}){
 const models:[string,Source<AstraResult>,ModelScore][]=[['Astra',astra,scoreModel(astra.data)],['Opus 5.5',opus,scoreModel(opus.data)]];
 const [a,o]=models.map(m=>m[2]);
 const ids=IDS.filter(id=>a.parties.some(p=>p.id===id)||o.parties.some(p=>p.id===id));
 const row=(s:ModelScore,id:Party)=>s.parties.find(p=>p.id===id);
 const seats=a.seats&&o.seats,ridings=a.ridings&&o.ridings,scored=seats||ridings;
 const metric=(f:(s:ModelScore)=>string|null)=>models.map(([name,,s])=><td key={name}>{f(s)??'—'}</td>);
 const misses=[...new Set([...(a.ridings?.misses??[]),...(o.ridings?.misses??[])].map(m=>m.name))].sort();
 const call=(s:ModelScore,name:string,src:Source<AstraResult>)=>{const m=s.ridings?.misses.find(x=>x.name===name);if(m)return <>{short[m.projected]} {probability(m.probability)}</>;const d=src.data.districts.find(x=>x.name===name)!;return <span className="score-hit">Correct · {probability(Math.max(...d.win))}</span>;};
 const unmatched=[...new Set([...a.unmatched,...o.unmatched])];
 return <section id="scorecard" className="astra-section scorecard-section" aria-labelledby="scorecard-title">
 <div className="section-heading"><div><span className="astra-symbol">✓</span><h2 id="scorecard-title">Forecast scorecard</h2></div><span className="poll-method-tag">{status[results.status]}{results.updatedAt&&` · ${time(results.updatedAt)}`}</span></div>
 <p className="poll-intro">{results.status==='pending'?'The final election-day seat projections from Astra and Opus 5.5. They lock after the last update on October 24. Once Elections BC reports results, both models are scored here the same way as in their 2020 and 2024 checks.':`Final election-day forecasts from Astra and Opus 5.5, scored against ${results.status} Elections BC results.`}</p>
 <p className="astra-caption">{models.map(([name,src])=>`${name}: forecast for ${day(src.data.date)}, calculated ${time(src.fetchedAt)}`).join(' · ')}{finalForecast.frozenAt?` · Locked ${time(finalForecast.frozenAt)}`:''}</p>
 {results.status==='preliminary'&&<p className="model-warning">Preliminary results can change in the final count, which includes absentee and mail-in ballots counted later.</p>}
 {unmatched.length>0&&<p className="model-warning">Results entered for unrecognized ridings were not scored: {unmatched.join(', ')}.</p>}
 <div className="table-panel"><div className="table-scroll"><table className="opus-compare"><thead><tr><th>Party</th><th>Astra · average<small className="vote-range">80% range</small></th><th>Astra · riding favourites</th><th>Opus 5.5 · average<small className="vote-range">80% range</small></th><th>Opus 5.5 · riding favourites</th><th>Actual seats</th></tr></thead><tbody>{ids.map(id=>{const pa=row(a,id),po=row(o,id),actual=pa?.actual??po?.actual??null;return <tr key={id}><th>{names[id]}</th><td>{pa?range(pa):'—'}</td><td>{pa?.favourite??'—'}</td><td>{po?range(po):'—'}</td><td>{po?.favourite??'—'}</td><td>{actual===null?'—':<strong>{actual}</strong>}</td></tr>;})}</tbody></table></div><p className="table-note">Average is the mean seat count across all simulations; the 80% range holds the middle 80% of simulated outcomes. Riding favourites counts the ridings where each party has the highest win chance: the closest thing to a single seat call. {SEATS} seats; 47 for a majority.{results.status==='pending'?' Actual seats appear once results are entered.':''}</p></div>
 {scored&&<div className="table-panel score-panel"><div className="table-scroll"><table className="opus-compare"><thead><tr><th>Measure</th><th>Astra</th><th>Opus 5.5</th></tr></thead><tbody>
  {seats&&<tr><th>Chance given to the winner<small className="vote-range">{a.seats!.winner==='tie'?'Result: tied for most seats':`${names[a.seats!.winner]} won most seats`}</small></th>{metric(s=>s.seats&&probability(s.seats.winnerProbability))}</tr>}
  {seats&&<tr><th>Brier score, most seats<small className="vote-range">Lower is better; 0 is perfect</small></th>{metric(s=>s.seats&&s.seats.brier.toFixed(3))}</tr>}
  {seats&&<tr><th>Average seat error · averages<small className="vote-range">Seats per party, lower is better</small></th>{metric(s=>s.seats&&s.seats.seatMAE.toFixed(1))}</tr>}
  {seats&&<tr><th>Average seat error · riding favourites</th>{metric(s=>s.seats&&s.seats.favouriteMAE.toFixed(1))}</tr>}
  {seats&&<tr><th>Seat totals inside the 80% range</th>{metric(s=>s.seats&&`${s.seats.covered} of ${s.seats.scored}`)}</tr>}
  {ridings&&<tr><th>Ridings called correctly</th>{metric(s=>s.ridings&&`${s.ridings.called} of ${s.ridings.scored}`)}</tr>}
  {ridings&&<tr><th>Brier score, ridings<small className="vote-range">Average per riding, lower is better</small></th>{metric(s=>s.ridings&&s.ridings.brier.toFixed(3))}</tr>}
  {a.voteMAE!==null&&o.voteMAE!==null&&<tr><th>Average popular-vote error<small className="vote-range">Percentage points per party</small></th>{metric(s=>s.voteMAE===null?null:s.voteMAE.toFixed(1))}</tr>}
 </tbody></table></div><p className="table-note">The Brier score measures probability accuracy: it adds the squared gaps between each forecast chance and what happened (1 for the outcome that occurred, 0 otherwise). One election is a single test; a model can be well calibrated and still miss, or poorly calibrated and get lucky.</p></div>}
 {ridings&&<details className="poll-definitions"><summary>Ridings either model called wrong ({misses.length})</summary>{misses.length?<div className="table-scroll"><table><thead><tr><th>Riding</th><th>Winner</th><th>Astra call</th><th>Opus 5.5 call</th></tr></thead><tbody>{misses.map(name=>{const actual=[...a.ridings!.misses,...o.ridings!.misses].find(m=>m.name===name)!.actual;return <tr key={name}><th>{name}</th><td>{names[actual]}</td><td>{call(a,name,astra)}</td><td>{call(o,name,opus)}</td></tr>;})}</tbody></table></div>:<p>Both models called every scored riding correctly.</p>}<p>A call is the party with the highest win chance; the percentage is that chance. A 60% favourite should lose about 4 times in 10.</p></details>}
 </section>;
}
