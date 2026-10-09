import Dashboard from './dashboard';
import {readDashboardSnapshot} from '@/lib/snapshot-store';
import {historySeed} from '@/lib/history';
export const dynamic='force-dynamic';
export default async function Home(){return <Dashboard initial={await readDashboardSnapshot()} initialHistory={historySeed}/>;}
