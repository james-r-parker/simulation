// The director's scene moments (docs/principles.md, "Scenes"): a herd animal's carcass (Scavenge), a pack call (Pack, or
// loner), a patch that wilts (Leave a dying patch), a strain's emergence (Boom and bust) and a die-off of starving blobs
// (Boom and bust). Each comes from an effect the snapshot already carries; they join the candidates `findMoments`
// ranks, so a world that offers one kind of moment most of the time still has others to cut to.

import { largestCluster } from './cluster.js';
import { MOMENT_KIND } from './scoring.js';

/** A die-off: starved deaths within this radius and window. */
export const DIE_OFF_RADIUS = 1000;
export const DIE_OFF_WINDOW_S = 8;
/** Fewest starved deaths that make a die-off. */
export const DIE_OFF_MIN = 4;

/**
 * Single-effect scene moments by the name of their effect kind: the moment, its starting score and how long it lasts.
 * @type {Readonly<Record<string, {kind: string, score: number, windowS: number}>>}
 */
export const SCENE_EFFECTS = Object.freeze({
    HERD_DIED: { kind: MOMENT_KIND.CARCASS, score: 60, windowS: 10 },
    PACK_CALL: { kind: MOMENT_KIND.PACK_CALL, score: 60, windowS: 8 },
    PATCH_WILTED: { kind: MOMENT_KIND.PATCH_WILT, score: 55, windowS: 8 },
    STRAIN_EMERGED: { kind: MOMENT_KIND.STRAIN, score: 70, windowS: 10 },
});

/**
 * @param {number} n starved deaths in the cluster
 * @returns {number} `45 + 5n` capped at 70, 0 below `DIE_OFF_MIN`
 */
export function scoreDieOff(n) {
    return n < DIE_OFF_MIN ? 0 : Math.min(70, 45 + 5 * n);
}

/**
 * @param {{kind: number, x: number, y: number}} effect an effect record
 * @param {{ageS: number, kinds: Record<string, number>}} ctx its age and the layout's effect kinds
 * @returns {{kind: string, score: number} | null} the scene moment the effect makes, linearly faded over its window
 */
export function scoreSceneEffect(effect, { ageS, kinds }) {
    for (const [name, rule] of Object.entries(SCENE_EFFECTS)) {
        if (kinds[name] === effect.kind && ageS >= 0 && ageS < rule.windowS) {
            return { kind: rule.kind, score: rule.score * (1 - ageS / rule.windowS) };
        }
    }
    return null;
}

/**
 * @param {readonly import('./moments.js').RawEffectRecord[]} effects recent effect records
 * @param {{tick: number, ticksPerSecond: number, layout: Record<string, any>}} ctx timing and layout codes
 * @returns {import('./moments.js').MomentCandidate[]} the scene moment candidates
 */
export function findSceneMoments(effects, { tick, ticksPerSecond, layout }) {
    const kinds = layout.effectKinds;
    const starved = layout.deathCauses?.STARVED ?? -1;
    const out = /** @type {import('./moments.js').MomentCandidate[]} */ ([]);
    const deaths = /** @type {{x: number, y: number}[]} */ ([]);
    for (const effect of effects) {
        const ageS = (tick - effect.tick) / ticksPerSecond;
        const single = scoreSceneEffect(effect, { ageS, kinds });
        if (single !== null) {
            out.push({ ...single, x: effect.x, y: effect.y });
        }
        if (
            effect.kind === kinds.DIED &&
            ((effect.c >>> 8) & 0xff) === starved &&
            ageS >= 0 &&
            ageS <= DIE_OFF_WINDOW_S
        ) {
            deaths.push(effect);
        }
    }
    const cluster = largestCluster(deaths, DIE_OFF_RADIUS);
    const score = scoreDieOff(cluster.count);
    if (score > 0) {
        out.push({ kind: MOMENT_KIND.DIE_OFF, score, x: cluster.x, y: cluster.y, count: cluster.count });
    }
    return out;
}
