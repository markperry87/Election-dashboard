// Browser entry for the static snapshot page built by scripts/snapshot/build.mjs.
import {createRoot} from 'react-dom/client';
import Dashboard from '../../app/dashboard';
import {savedSnapshot} from '../../lib/snapshots';
import type {Dashboard as Data} from '../../lib/election';
import type {Histories} from '../../lib/history';

declare global {interface Window {__SNAPSHOT__: {dashboard: Data; history: Histories}}}
const {dashboard, history} = window.__SNAPSHOT__;
const saved = savedSnapshot(dashboard);
// A static page has no API routes: answer the dashboard's own requests from the snapshot.
const native = window.fetch.bind(window);
window.fetch = (input, init) => {
 const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
 if (url.includes('/api/election')) return Promise.resolve(Response.json(saved));
 if (url.includes('/api/history')) return Promise.resolve(Response.json(history));
 return native(input, init);
};
createRoot(document.getElementById('root')!).render(<Dashboard initial={saved} initialHistory={history}/>);
