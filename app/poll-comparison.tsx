import {Table,TableHeader,TableBody,TableRow,TableHead,TableCell} from '@/components/ui/table';
import {parties} from '@/lib/election';
import {pollConsensus,type PollModel} from '@/lib/poll-models';
const pct=(n:number|null)=>n===null?'—':n.toFixed(1)+'%';
const date=(s:string)=>new Date(s+'T12:00:00Z').toLocaleDateString('en-CA',{timeZone:'UTC',month:'short',day:'numeric'});
// Astra and Opus 5.5 are computed on this site; the others are published elsewhere.
const aiBuilt=(m:PollModel)=>m.id==='astra'||m.id==='opus';
export default function PollComparison({models:all}:{models:PollModel[]}) {
 // Excluded models are listed for reference below the median, not counted in it.
 const models=all.filter(m=>!m.excluded),excluded=all.filter(m=>m.excluded);
 const consensus=pollConsensus(all);
 const odd=models.length%2===1;
 const medianRule=odd?`Middle of ${models.length}`:'Average of middle 2';
 const tie=(id:string)=>pct(models.find(m=>m.id===id)?.source.data.tie??null);
 return <section id="polling" className="poll-section" aria-labelledby="poll-title">
  <div className="section-heading"><div><span className="section-no">01</span><h2 id="poll-title">Polling model consensus</h2></div><span className="poll-method-tag">Median of {models.length} models · 50% of headline</span></div>
  <p className="poll-intro">Chance of winning the most seats. With {models.length} models, the median is {odd?'the middle estimate':'the average of the middle two estimates'}; the spread shows how far the modelers disagree.</p>
  <div className="poll-summary-grid">{consensus.map(c=>{const party=parties.find(p=>p.id===c.id)!;return <article key={c.id} className="poll-card" style={{'--party':party.color} as React.CSSProperties}>
   <div className="poll-card-top"><h3><span className="party-dot" style={{background:party.color}}/>{party.name}</h3><span>MODEL MEDIAN</span></div>
   <div className="poll-card-numbers"><strong>{pct(c.median)}</strong><div><span>Model range</span><b>{pct(c.min)}–{pct(c.max)}</b><small>{c.spread===null?'—':c.spread.toFixed(1)} percentage-point spread</small></div></div>
   <div className="poll-range" role="img" aria-label={`${party.name}: median ${pct(c.median)}, model range ${pct(c.min)} to ${pct(c.max)}.`}>
    <div className="poll-range-line"/>{c.min!==null&&c.max!==null&&<div className="poll-range-band" style={{left:c.min+'%',width:(c.max-c.min)+'%'}}/>}
    {models.map((m,i)=><span key={m.id} className={`poll-marker marker-${i}`} style={{left:m.source.data.probabilities[c.id]+'%'}} title={`${m.name}: ${pct(m.source.data.probabilities[c.id])}`}/>)}
   </div><div className="poll-axis"><span>0%</span><span>50%</span><span>100%</span></div>
  </article>;})}</div>
  <div className="poll-legend">{models.map((m,i)=><span key={m.id}><i className={`legend-marker marker-${i}`}/>{m.name}</span>)}</div>
  <div className="table-panel poll-table"><Table><TableHeader><TableRow><TableHead>Modeler</TableHead><TableHead>Projection date</TableHead><TableHead>BC Conservatives</TableHead><TableHead>BC NDP</TableHead></TableRow></TableHeader><TableBody>
   {models.map(m=><TableRow key={m.id}><TableCell><a href={m.href} target={aiBuilt(m)?undefined:'_blank'} rel="noreferrer">{m.name}{aiBuilt(m)?' · AI-built':' ↗'}</a><small>{m.source.live?(aiBuilt(m)?'Recomputed from current feeds':'Fetched successfully'):aiBuilt(m)&&m.source.error?'Saved or partial inputs':'Saved snapshot'}</small></TableCell><TableCell>{date(m.source.data.date)}</TableCell><TableCell>{pct(m.source.data.probabilities.con)}</TableCell><TableCell>{pct(m.source.data.probabilities.ndp)}</TableCell></TableRow>)}
   <TableRow className="poll-median-row"><TableCell>Median used in headline</TableCell><TableCell>{medianRule}</TableCell>{consensus.map(c=><TableCell key={c.id}>{pct(c.median)}</TableCell>)}</TableRow>
   {excluded.map(m=><TableRow key={m.id} className="poll-excluded-row"><TableCell><a href={m.href} target="_blank" rel="noreferrer">{m.name} ↗</a><small className="poll-distrust">⚠ We don’t trust this one · not in the median</small></TableCell><TableCell>{date(m.source.data.date)}</TableCell><TableCell>{pct(m.source.data.probabilities.con)}</TableCell><TableCell>{pct(m.source.data.probabilities.ndp)}</TableCell></TableRow>)}
  </TableBody></Table><p className="table-note">Spread = highest minus lowest estimate, not a confidence interval. Source dates and forecast horizons differ; these models share polling inputs. Astra and Opus 5.5 target October 24; the other models use their published definitions. Northern Vibe’s published figures are rounded before we add majority and non-majority wins.</p>{excluded.map(m=><p key={m.id} className="table-note poll-distrust-note"><strong>⚠ Why {m.name} is left out:</strong> {m.excluded}.</p>)}</div>
  <details className="poll-definitions"><summary>Definitions, ties & calculation</summary><ul>{all.map(m=><li key={m.id}><strong>{m.name}{m.excluded?' (not in the median)':''}:</strong> {m.basis}.</li>)}</ul><p>Winning the most seats includes a majority or an outright plurality. Ties are excluded from the party estimates. The median is calculated separately for each party and feeds the headline unchanged; party medians and blended estimates need not total 100%. We do not infer a shared tie probability or a combined estimate for the smaller parties.</p><p>338Canada reports {tie('338')} for a tie; Northern Vibe reports {tie('northern')}. Stephen Taylor publishes no separate tie figure. Vote-Scope’s largest-party figures exclude ties; it is shown for reference only and does not affect the median. Astra reports {tie('astra')} for a tie; Opus 5.5 reports {tie('opus')}. Detailed 338Canada outcomes and history are retained below.</p></details>
 </section>;
}
