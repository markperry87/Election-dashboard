import {getDashboard} from '@/lib/election';
import {getAstra} from '@/lib/astra-server';
export const dynamic='force-dynamic';
export async function GET(){const [dashboard,astra]=await Promise.all([getDashboard(),getAstra()]);return Response.json({...dashboard,astra:astra.source},{headers:{'Cache-Control':'no-store'}});}
