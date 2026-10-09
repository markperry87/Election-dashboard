import Dashboard from './dashboard';
import {initialData} from '@/lib/election';
import {historySeed} from '@/lib/history';
export default function Home(){return <Dashboard initial={initialData} initialHistory={historySeed}/>;}
