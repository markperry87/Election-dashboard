// The final election-day forecasts, frozen after October 24 by scripts/freeze-final.mjs.
// When present, they replace the October 5 seed forecasts as the fallback, so a
// rebuild that cannot reach earlier data still shows the true final forecasts.
import raw from './data/final-forecast.json';
import type {Source} from './election';
import type {AstraResult} from './astra-model';
import type {OpusResult} from './opus-model';

export type FinalForecast = {frozenAt: string | null; snapshotCheckedAt: string | null; astra: Source<AstraResult> | null; opus: Source<OpusResult> | null};
export const finalForecast = raw as unknown as FinalForecast;
