// Starts the app locally, captures fresh dashboard data and builds the static snapshot.
// Usage (from the project root): node scripts/snapshot/refresh.mjs <out-dir>
// Used by .github/workflows/snapshot.yml; also works on a developer machine.
import {spawn, execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const outDir = process.argv[2];
if (!outDir) throw Error('Usage: refresh.mjs <out-dir>');
const port = Number(process.env.SNAPSHOT_PORT || 5199), base = `http://127.0.0.1:${port}`;
const dataDir = path.join('.sites-runtime', 'snapshot');
fs.mkdirSync(dataDir, {recursive: true});

const windows = process.platform === 'win32';
const server = spawn(process.execPath, ['scripts/run-framework.mjs', 'dev', '--port', String(port), '--strictPort'], {stdio: 'ignore', windowsHide: true, detached: !windows});
const stop = () => {
 try { if (windows) execFileSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], {stdio: 'ignore'}); else process.kill(-server.pid, 'SIGTERM'); }
 catch { server.kill(); }
};
try {
 for (let i = 0; ; i++) {
  try { if ((await fetch(base + '/api/opus', {signal: AbortSignal.timeout(90000)})).ok) break; } catch { /* still starting */ }
  if (i > 60) throw Error('The app did not start within about two minutes.');
  await new Promise(r => setTimeout(r, 2000));
 }
 const get = async route => {
  const r = await fetch(base + route, {signal: AbortSignal.timeout(180000)});
  if (!r.ok) throw Error(`${route} returned HTTP ${r.status}`);
  const file = path.join(dataDir, route.split('/').pop() + '.json');
  fs.writeFileSync(file, await r.text());
  return file;
 };
 const [election, history] = await Promise.all([get('/api/election'), get('/api/history')]);
 execFileSync(process.execPath, ['scripts/snapshot/build.mjs', outDir, election, history], {stdio: 'inherit'});
 const e = JSON.parse(fs.readFileSync(election, 'utf8')), h = JSON.parse(fs.readFileSync(history, 'utf8'));
 const saved = ['poly', 'kalshi', 'model', 'northern', 'voteScope', 'astra', 'opus'].filter(k => !e[k].live).concat(['poly', 'kalshi'].filter(k => !h[k].live).map(k => k + ' history'));
 console.log(saved.length ? `Saved data used for: ${saved.join(', ')}` : 'All sources refreshed live.');
} finally { stop(); }
