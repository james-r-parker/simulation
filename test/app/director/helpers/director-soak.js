// A unit-level director soak: runs a headless world through the worker's own tick (`tickOnce`), records the effect stream
// it would post, and every simulated second asks `findMoments` for candidates over the last 10 s of effects (chases are
// left out: no snapshot is passed). A shot takes the best candidate at or above `MOMENT_THRESHOLD` when none is on and
// lasts `SHOT_S`; the repeat penalty applies. It reports `director.max_kind_share` and `director.shots_per_hour` in
// simulated time. A stand-in for `npm run director:dry` (worker-and-renderer.md T50), which does not exist yet.

import { createSimLog } from '../../../../js/sim/log.js';
import { buildRun, readyLayout, tickOnce, worldInfo } from '../../../../js/worker/host-world.js';
import { EFFECT_CAPACITY, EFFECT_WORDS, writeEffects } from '../../../../js/worker/effects.js';
import { findMoments } from '../../../../js/app/director/moments.js';
import { MOMENT_THRESHOLD } from '../../../../js/app/director/scoring.js';
import { noisePolicy } from '../../../worker/helpers/host-harness.js';

/** How long a shot holds the screen, simulated seconds. */
export const SHOT_S = 12;
const WINDOW_S = 10;

/**
 * @param {Uint32Array} u32 the drained effects part
 * @param {Float32Array} f32 the same words as floats
 * @param {any[]} into where the records go
 * @returns {void}
 */
function decode(u32, f32, into) {
    for (let i = 0; i < u32[0]; i++) {
        const w = 2 + i * EFFECT_WORDS;
        into.push({
            kind: u32[w],
            tick: u32[w + 1],
            x: f32[w + 2],
            y: f32[w + 3],
            a: u32[w + 4],
            b: u32[w + 5],
            c: u32[w + 6],
            d: u32[w + 7],
        });
    }
}

/**
 * @param {{seed: number, overrides: Record<string, any>, ticks: number}} options the world and how long to run it
 * @returns {{shots: number, shotsPerHour: number, maxKindShare: number, shares: Record<string, number>}} the shot counts
 */
export function directorSoak({ seed, overrides, ticks }) {
    const run = buildRun({
        seed,
        overrides,
        createPolicy: noisePolicy,
        log: createSimLog(() => {}, { level: 'error' }),
    });
    const info = { ...worldInfo(run), ticksPerSecond: 60 };
    const layout = readyLayout(run);
    const buffer = new ArrayBuffer((2 + EFFECT_CAPACITY * EFFECT_WORDS) * 4);
    const u32 = new Uint32Array(buffer);
    const f32 = new Float32Array(buffer);
    let effects = /** @type {any[]} */ ([]);
    /** @type {Record<string, number>} */
    const counts = {};
    /** @type {Record<string, number>} */
    const lastShownS = {};
    let busyUntilS = 0;
    let shots = 0;
    for (let t = 1; t <= ticks; t++) {
        tickOnce(run);
        writeEffects(run.effects, u32, 0);
        decode(u32, f32, effects);
        if (t % info.ticksPerSecond !== 0) {
            continue;
        }
        const nowS = t / info.ticksPerSecond;
        effects = effects.filter((e) => t - e.tick <= WINDOW_S * info.ticksPerSecond);
        if (nowS < busyUntilS) {
            continue;
        }
        const [best] = findMoments({ snapshot: [], effects, info, layout, tick: t, lastShownS });
        if (best !== undefined && best.score >= MOMENT_THRESHOLD) {
            counts[best.kind] = (counts[best.kind] ?? 0) + 1;
            lastShownS[best.kind] = nowS;
            busyUntilS = nowS + SHOT_S;
            shots += 1;
        }
    }
    const shares = Object.fromEntries(Object.entries(counts).map(([k, n]) => [k, n / Math.max(shots, 1)]));
    return {
        shots,
        shotsPerHour: (shots * 3600 * info.ticksPerSecond) / ticks,
        maxKindShare: Math.max(0, ...Object.values(shares)),
        shares,
    };
}
