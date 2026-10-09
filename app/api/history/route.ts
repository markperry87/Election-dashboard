import {getHistories} from '@/lib/history';
export const dynamic='force-dynamic';
export async function GET(){return Response.json(await getHistories(),{headers:{'Cache-Control':'no-store'}});}
