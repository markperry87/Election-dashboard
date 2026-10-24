import ts from 'typescript';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const dir='.sites-runtime/snapshot-check';
fs.mkdirSync(dir,{recursive:true});
fs.cpSync('lib/data',dir+'/data',{recursive:true});
for(const name of ['snapshots','election','final-forecast','poll-models','ridings','snapshot-store']){
 const code=ts.transpile(fs.readFileSync('lib/'+name+'.ts','utf8'),{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022})
  .replace(/from ['"]cloudflare:workers['"]/g,"from './mock-env'")
  .replace(/from (['"])(\.\/[^'"]+)\1/g,(_,q,p)=>p.endsWith('.json')?`from '${p}' with {type:'json'}`:`from '${p}.js'`);
 fs.writeFileSync(dir+'/'+name+'.js',code);
}
// Exercise real SQLite UPSERT semantics, including late writes from another
// server. The Cloudflare binding is replaced only at the transport boundary.
const sqlite=`import sqlite3,json,sys
c=sqlite3.connect(sys.argv[1])
a=json.loads(sys.argv[2])
if 'batch' in a:
 for s in a['batch']: c.execute(s['sql'],s['args'])
 c.commit(); print('{}')
else:
 c.row_factory=sqlite3.Row
 print(json.dumps({'results':[dict(r) for r in c.execute(a['sql'],a['args'])]}))
`;
fs.writeFileSync(dir+'/sqlite.py',sqlite);
const db=process.cwd()+'/'+dir+'/test.sqlite';
fs.rmSync(db,{force:true});
execFileSync('python',['-c',`import sqlite3,sys; sqlite3.connect(sys.argv[1]).executescript(sys.argv[2])`,db,fs.readFileSync('drizzle/0001_flimsy_gideon.sql','utf8')]);
fs.writeFileSync(dir+'/mock-env.js',`import {execFileSync} from 'node:child_process';
const run=value=>JSON.parse(execFileSync('python',[${JSON.stringify(process.cwd()+'/'+dir+'/sqlite.py')},${JSON.stringify(db)},JSON.stringify(value)],{encoding:'utf8'}));
export const env={DB:{prepare(sql){return {sql,args:[],bind(...args){this.args=args;return this;},async all(){return run(this);}};},async batch(statements){return run({batch:statements});}}};`);
const {initialData,getDashboard}=await import('../'+dir+'/election.js');
const {mergeSnapshots,encodeSnapshot,decodeSnapshot,savedSnapshot,sourceKeys}=await import('../'+dir+'/snapshots.js');
const {readDashboardSnapshot,saveDashboardSnapshot}=await import('../'+dir+'/snapshot-store.js');
assert.ok(decodeSnapshot(encodeSnapshot(initialData)),'All existing feed schemas are accepted');
const fresh=structuredClone(initialData);
for(const key of sourceKeys)fresh[key].fetchedAt=new Date(Date.now()-3600000).toISOString();
fresh.checkedAt=new Date().toISOString();
fresh.poly.data[0].volume=99999;
fresh.kalshi.data[0].volume=77777;
fresh.kalshi.retryAt=new Date(Date.now()+900000).toISOString();
fresh.kalshi.error='Kalshi is rate-limiting requests (HTTP 429).';
await saveDashboardSnapshot(fresh);
await saveDashboardSnapshot(initialData); // Simulate a slower, older request finishing last.
const reopened=await readDashboardSnapshot();
assert.equal(reopened.poly.data[0].volume,99999);
assert.equal(reopened.kalshi.data[0].volume,77777);
assert.equal(reopened.kalshi.retryAt,fresh.kalshi.retryAt);
assert.equal(reopened.poly.live,false);
// Cold process state + all upstreams down must retain persisted values.
const requests=[];
globalThis.fetch=async url=>{requests.push(url);return new Response('Unavailable',{status:503});};
const failed=await getDashboard(reopened);
assert.equal(failed.poly.data[0].volume,99999);
assert.equal(failed.poly.fetchedAt,fresh.poly.fetchedAt);
assert.equal(failed.kalshi.data[0].volume,77777);
assert.ok(!requests.some(url=>url.includes('kalshi')),'Persisted retry deadline prevents requests');
// Reload the browser's saved state, then receive a server fallback with a
// newer check time but older source data. Neither market may go backwards.
const browser=decodeSnapshot(encodeSnapshot(fresh));
const oldResponse={...initialData,checkedAt:new Date().toISOString()};
const merged=mergeSnapshots(savedSnapshot(browser),oldResponse);
assert.equal(merged.poly.data[0].volume,99999);
assert.equal(merged.kalshi.data[0].volume,77777);
assert.equal(merged.poly.fetchedAt,fresh.poly.fetchedAt);
const partial=structuredClone(initialData);
partial.poly={...fresh.poly,fetchedAt:new Date().toISOString(),data:fresh.poly.data.map(q=>({...q,volume:123456}))};
const combined=mergeSnapshots(fresh,partial);
assert.equal(combined.poly.data[0].volume,123456);
assert.equal(combined.kalshi.data[0].volume,77777);
for(const raw of ['not json','null','{}',JSON.stringify({version:2,data:fresh}),encodeSnapshot({...fresh,poly:{data:[]}})])assert.equal(decodeSnapshot(raw),null);
console.log('PASS: persistent snapshots, concurrent older writes, cold-start failures, Kalshi backoff, browser reload, per-source updates, corrupt storage.');
