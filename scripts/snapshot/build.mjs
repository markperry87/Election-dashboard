// Builds a static snapshot of the dashboard as one self-contained HTML page.
// Usage (from the project root): node scripts/snapshot/build.mjs <out-dir> <election.json> <history.json>
// SNAPSHOT_NOTE sets the text after the snapshot time, e.g. "Updates every 2 hours".
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const [outDir, electionFile, historyFile] = process.argv.slice(2);
if (!outDir || !electionFile || !historyFile) throw Error('Usage: build.mjs <out-dir> <election.json> <history.json>');
const root = process.cwd();
const require = createRequire(path.join(root, 'package.json'));
// esbuild and postcss are installed as dependencies of the toolchain, not directly.
const pnpm = path.join(root, 'node_modules/.pnpm');
const esbuildDir = fs.readdirSync(pnpm).filter(d => /^esbuild@\d/.test(d)).sort((a, b) => b.localeCompare(a, undefined, {numeric: true}))[0];
const esbuild = require(path.join(pnpm, esbuildDir, 'node_modules/esbuild'));
const twRequire = createRequire(require.resolve('@tailwindcss/postcss'));
const postcss = twRequire('postcss'), tailwind = twRequire('@tailwindcss/postcss');
const note = process.env.SNAPSHOT_NOTE || 'This copy does not update';

// Text changes for a page without API routes; each must match exactly once.
const patches = {
 'app/dashboard.tsx': [
  ['`Checked ${time(data.checkedAt)} · Refreshes every 5 minutes while open`', `\`Snapshot taken \${time(data.checkedAt)} · ${note.replace(/[`$\\]/g, '')}\``],
  ['{!busy&&stale&&<span className="warning">Includes saved market data</span>}', ''],
  ['{(stale||pollStale)&&<span className="warning"> Includes saved source data.</span>}', ''],
  ['{!data.model.live&&!busy&&<p className="model-warning">338Canada refresh unavailable · showing the saved {date(odds.date)} projection.</p>}', ''],
 ],
 'app/astra-panel.tsx': [[' <a href="/api/astra" target="_blank" rel="noreferrer">View forecast data and feed status</a>.', '']],
 'app/opus-panel.tsx': [[' <a href="/api/opus" target="_blank" rel="noreferrer">View forecast data</a>.', '']],
};
const patcher = {name: 'snapshot-patches', setup(build) {
 build.onLoad({filter: /app[\\/](dashboard|astra-panel|opus-panel)\.tsx$/}, args => {
  const rel = path.relative(root, args.path).replaceAll('\\', '/');
  let code = fs.readFileSync(args.path, 'utf8');
  for (const [from, to] of patches[rel]) {
   if (code.split(from).length !== 2) throw Error(`Snapshot patch no longer matches ${rel}: ${from.slice(0, 60)}`);
   code = code.replace(from, to);
  }
  return {contents: code, loader: 'tsx'};
 });
}};
const bundle = await esbuild.build({
 entryPoints: [path.join(root, 'scripts/snapshot/entry.tsx')], bundle: true, write: false, minify: true, format: 'iife', target: 'es2022',
 jsx: 'automatic', define: {'process.env.NODE_ENV': '"production"'}, logLevel: 'error', plugins: [patcher], alias: {'@': root},
});
const cssFile = path.join(root, 'app/globals.css');
const css = (await postcss([tailwind({base: root})]).process(fs.readFileSync(cssFile, 'utf8'), {from: cssFile})).css;

const election = JSON.parse(fs.readFileSync(electionFile, 'utf8'));
// Persistence warnings describe the build machine, not the forecast.
for (const key of ['astra', 'opus']) if (/persistent saving is unavailable/.test(election[key].error ?? '')) delete election[key].error;
const history = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
const data = JSON.stringify({dashboard: election, history}).replace(/</g, '\\u003c');
const js = bundle.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>BC Election Watch</title>
<meta name="description" content="BC election 2026 probabilities: prediction markets blended with polling models, plus the Astra and Opus 5.5 forecasts.">
<link rel="icon" href="favicon.svg">
<style>${css}
:root{color-scheme:dark}body{background:#0c1420;color:#e7edf5}.page-heading>button{display:none}</style>
</head>
<body>
<div id="root"></div>
<script>window.__SNAPSHOT__=${data};</script>
<script>${js}</script>
</body>
</html>
`;
fs.mkdirSync(outDir, {recursive: true});
fs.writeFileSync(path.join(outDir, 'index.html'), html);
fs.copyFileSync(path.join(root, 'public/favicon.svg'), path.join(outDir, 'favicon.svg'));
console.log(`Built ${path.join(outDir, 'index.html')} (${(html.length / 1024).toFixed(0)} KB)`);
