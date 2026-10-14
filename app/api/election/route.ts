import {getDashboard} from '@/lib/election';
import {getAstra} from '@/lib/astra-server';
import {readDashboardSnapshot,saveDashboardSnapshot} from '@/lib/snapshot-store';
import {mergeSnapshots} from '@/lib/snapshots';
export const dynamic='force-dynamic';
export async function GET(){
 const saved=await readDashboardSnapshot();
 const [dashboard,astra]=await Promise.all([getDashboard(saved),getAstra()]);
 const result=mergeSnapshots(saved,{...dashboard,astra:astra.source,opus:astra.opus});
 await saveDashboardSnapshot(result,saved);
 return Response.json(result,{headers:{'Cache-Control':'no-store'}});
}
