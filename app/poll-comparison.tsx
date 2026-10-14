import {Table,TableHeader,TableBody,TableRow,TableHead,TableCell} from '@/components/ui/table';
import {parties} from '@/lib/election';
import {pollConsensus,type PollModel} from '@/lib/poll-models';
const pct=(n:number|null)=>n===null?'—':n.toFixed(1)+'%';
const date=(s:string)=>new Date(s+'T12:00:00Z').toLocaleDateString('en-CA',{timeZone:'UTC',month:'short',day:'numeric'});
export default function PollComparison({models,challenger}:{models:PollModel[];challenger:PollModel}) {
 const consensus=pollConsensus(models);
 return <section className="poll-section" aria-labelledby="poll-title">
  <div className="section-heading"><div><span className="section-no">01</span><h2 id="poll-title">Polling model consensus</h2></div><span className="poll-method-tag">Median of 4 models · 50% of headline</span></div>
  <p className="poll-intro">Chance of winning the most seats. With four models, the median averages the middle two estimates; the spread shows how far the modelers disagree.</p>
  <div className="poll-summary-grid">{consensus.map(c=>{const party=parties.find(p=>p.id===c.id)!;return <article key={c.id} className="poll-card" style={{'--party':party.color} as React.CSSProperties}>
   <div className="poll-card-top"><h3><span className="party-dot" style={{background:party.color}}/>{party.name}</h3><span>MODEL MEDIAN</span></div>
   <div className="poll-card-numbers"><strong>{pct(c.median)}</strong><div><span>Model range</span><b>{pct(c.min)}–{pct(c.max)}</b><small>{c.spread===null?'—':c.spread.toFixed(1)} percentage-point spread</small></div></div>
   <div className="poll-range" role="img" aria-label={`${party.name}: median ${pct(c.median)}, model range ${pct(c.min)} to ${pct(c.max)}.`}>
    <div className="poll-range-line"/>{c.min!==null&&c.max!==null&&<div className="poll-range-band" style={{left:c.min+'%',width:(c.max-c.min)+'%'}}/>}
    {[...models,challenger].map((m,i)=><span key={m.id} className={`poll-marker marker-${i}`} style={{left:m.source.data.probabilities[c.id]+'%'}} title={`${m.name}: ${pct(m.source.data.probabilities[c.id])}`}/>)}
   </div><div className="poll-axis"><span>0%</span><span>50%</span><span>100%</span></div>
  </article>;})}</div>
  <div className="poll-legend">{models.map((m,i)=><span key={m.id}><i className={`legend-marker marker-${i}`}/>{m.name}</span>)}<span><i className={`legend-marker marker-${models.length}`}/>{challenger.name} (not in median)</span></div>
  <div className="table-panel poll-table"><Table><TableHeader><TableRow><TableHead>Modeler</TableHead><TableHead>Projection date</TableHead><TableHead>BC Conservatives</TableHead><TableHead>BC NDP</TableHead></TableRow></TableHeader><TableBody>
   {models.map(m=><TableRow key={m.id}><TableCell><a href={m.href} target={m.id==='astra'?undefined:'_blank'} rel="noreferrer">{m.name}{m.id==='astra'?' · experimental':' ↗'}</a><small>{m.source.live?(m.id==='astra'?'Recomputed from current feeds':'Fetched successfully'):m.id==='astra'&&m.source.error?'Saved or partial inputs':'Saved snapshot'}</small></TableCell><TableCell>{date(m.source.data.date)}</TableCell><TableCell>{pct(m.source.data.probabilities.con)}</TableCell><TableCell>{pct(m.source.data.probabilities.ndp)}</TableCell></TableRow>)}
   <TableRow className="poll-median-row"><TableCell>Median used in headline</TableCell><TableCell>Average of middle 2</TableCell>{consensus.map(c=><TableCell key={c.id}>{pct(c.median)}</TableCell>)}</TableRow>
   <TableRow className="poll-challenger-row"><TableCell><a href={challenger.href}>{challenger.name} · AI-built</a><small>{challenger.source.live?'Recomputed from current feeds':challenger.source.error?'Saved or partial inputs':'Saved snapshot'} · comparison only</small></TableCell><TableCell>{date(challenger.source.data.date)}</TableCell><TableCell>{pct(challenger.source.data.probabilities.con)}</TableCell><TableCell>{pct(challenger.source.data.probabilities.ndp)}</TableCell></TableRow>
  </TableBody></Table><p className="table-note">Spread = highest minus lowest estimate, not a confidence interval. Source dates and forecast horizons differ; these models share polling inputs. Astra targets October 24; the other models use their published definitions. Northern Vibe’s published figures are rounded before we add majority and non-majority wins.</p></div>
  <details className="poll-definitions"><summary>Definitions, ties & calculation</summary><ul>{[...models,challenger].map(m=><li key={m.id}><strong>{m.name}:</strong> {m.basis}.</li>)}</ul><p>Winning the most seats includes a majority or an outright plurality. Ties are excluded from the party estimates. The median is calculated separately for each party and feeds the headline unchanged; party medians and blended estimates need not total 100%. We do not infer a shared tie probability or a four-model estimate for the smaller parties.</p><p>338Canada reports {pct(models[0].source.data.tie??null)} for a tie; Northern Vibe reports {pct(models[1].source.data.tie??null)}. Vote-Scope’s largest-party figures exclude ties, but no separate tie probability is used here. Astra reports {pct(models.find(m=>m.id==='astra')?.source.data.tie??null)} for a tie; the Opus model reports {pct(challenger.source.data.tie??null)}. Detailed 338Canada outcomes and history are retained below.</p></details>
 </section>;
}
