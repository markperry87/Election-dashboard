import {getAstra} from '@/lib/astra-server';
import backtests from '@/lib/data/astra-backtests.json';
export const dynamic='force-dynamic';
export async function GET(){const result=await getAstra();return Response.json({source:result.source,feeds:result.feeds,backtests},{headers:{'Cache-Control':'no-store'}});}
