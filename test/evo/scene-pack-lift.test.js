// Pack lift on hand-built kills: the observer's combat counters know two lineages of hunters, kills are noted with
// their killer and previous biter, and a naive recount of the same list is the reference.

import { describe, expect, it } from 'vitest';
import { BURN_IN_TICKS } from '../../js/evo/burn-in.js';
import { SPEC_RADIX } from '../../js/evo/hunter-table.js';
import {
    MIN_PAIRED_KILLS,
    createPackLiftScene,
    notePackKill,
    packLiftMetrics,
    notePackBite,
} from '../../js/evo/scene-pack-lift.js';
import { directionOf, namesOf } from './helpers/metric-registry.js';

const HUNTER = 1;
// Genome ids 11 and 12 are hunters of lineage 1, 21 and 22 of lineage 2, 31 is a forager of lineage 1.
const AGENTS = [
    [11, 1, HUNTER],
    [12, 1, HUNTER],
    [21, 2, HUNTER],
    [22, 2, HUNTER],
    [31, 1, 0],
];

/** @returns {Record<string, any>} an observer with just the combat counters the scene reads */
function observer() {
    const knownAgents = new Map(AGENTS.map(([id, lineage, spec]) => [id, lineage * SPEC_RADIX + spec]));
    return { combat: { knownAgents, hunterSpec: Uint8Array.from([0, 1]) } };
}

/**
 * The world has no `size` array: the slot of a victim is zeroed before the observer reads its death, so a scene that
 * read the size from the world would read 0 (E187: the ratio was null on 128 of 128 seeds).
 * @returns {Record<string, any>} a world past burn-in
 */
function world() {
    return { tick: BURN_IN_TICKS + 1, size: Float32Array.of(0) };
}

/**
 * @param {Record<string, any>} scene the scene
 * @param {Array<[number, number]>} kills each kill's killer and previous biter genome ids (0 for none)
 * @param {number} [size] the victims' size
 * @returns {void}
 */
function kill(scene, kills, size = 1) {
    const o = observer();
    for (const [killer, previous] of kills) {
        notePackKill(scene, o, { world: world(), size, killer, previous });
    }
}

/**
 * The lift by a naive recount: bites by lineage are the kills' (each fatal bite is a bite), a paired kill has a hunter
 * as previous biter.
 * @param {Array<[number, number]>} kills the kills
 * @returns {number} the pack kills over the sum of the killers' lineage shares of all bites
 */
function naiveLift(kills) {
    const lineageOf = new Map(AGENTS.map(([id, lineage]) => [id, lineage]));
    const bites = new Map();
    for (const [killer] of kills) {
        bites.set(lineageOf.get(killer), (bites.get(lineageOf.get(killer)) ?? 0) + 1);
    }
    let pack = 0;
    let expected = 0;
    for (const [killer, previous] of kills) {
        if (previous === 0) {
            continue;
        }
        expected += bites.get(lineageOf.get(killer)) / kills.length;
        pack += lineageOf.get(killer) === lineageOf.get(previous) ? 1 : 0;
    }
    return pack / expected;
}

/** @param {number} sameLineagePairs how many of each killer lineage's 30 kills have a same-lineage previous biter */
function mixedKills(sameLineagePairs) {
    /** @type {Array<[number, number]>} */
    const kills = [];
    for (let i = 0; i < 30; i++) {
        const same = i < sameLineagePairs;
        kills.push([11, same ? 12 : 22], [21, same ? 22 : 12]);
    }
    return kills;
}

describe('eval.pack_lift', () => {
    it('reads 1 when the previous biter is drawn by the lineage mix', () => {
        const kills = mixedKills(15);
        const scene = createPackLiftScene();
        kill(scene, kills);
        expect(packLiftMetrics(scene)['eval.pack_lift']?.value).toBeCloseTo(1, 12);
        expect(naiveLift(kills)).toBeCloseTo(1, 12);
    });

    it('reads above 1 when the pairs are all kin, as the naive recount does', () => {
        const kills = mixedKills(30);
        const scene = createPackLiftScene();
        kill(scene, kills);
        expect(packLiftMetrics(scene)['eval.pack_lift']?.value).toBeCloseTo(naiveLift(kills), 12);
        expect(naiveLift(kills)).toBeCloseTo(2, 12);
    });

    it('counts a live bite by a hunter in the lineage shares, not a bite by a forager, nor one before burn-in', () => {
        const scene = createPackLiftScene();
        const w = {
            tick: BURN_IN_TICKS + 1,
            spec: Uint8Array.of(HUNTER, 0),
            lineageId: Uint32Array.of(1, 2),
            huntBySpec: Uint8Array.from([0, 1]),
        };
        notePackBite(scene, w, 0);
        notePackBite(scene, w, 1);
        notePackBite(scene, { ...w, tick: BURN_IN_TICKS - 1 }, 0);
        expect(scene.bites).toBe(1);
        expect(scene.lineages.log.bites[scene.lineages.index.get(1) ?? -1]).toBe(1);
    });

    it('is null under the paired-kill minimum and before burn-in', () => {
        const scene = createPackLiftScene();
        kill(scene, mixedKills(15).slice(0, MIN_PAIRED_KILLS - 1));
        expect(packLiftMetrics(scene)['eval.pack_lift']?.value).toBeNull();
        const early = createPackLiftScene();
        notePackKill(early, observer(), {
            world: { tick: 5 },
            size: 1,
            killer: 11,
            previous: 12,
        });
        expect(early.bites).toBe(0);
    });
});

describe('eval.pack_prey_size_ratio', () => {
    it('reads the mean victim size at pack kills over that at solo kills', () => {
        const scene = createPackLiftScene();
        kill(
            scene,
            Array.from({ length: 10 }, () => [11, 12]),
            3,
        );
        kill(
            scene,
            Array.from({ length: 10 }, () => [11, 0]),
            1.5,
        );
        expect(packLiftMetrics(scene)['eval.pack_prey_size_ratio']?.value).toBeCloseTo(2, 12);
    });

    it('is null under 10 pack kills or 10 solo kills', () => {
        const scene = createPackLiftScene();
        kill(
            scene,
            Array.from({ length: 9 }, () => [11, 12]),
        );
        kill(
            scene,
            Array.from({ length: 10 }, () => [11, 0]),
        );
        expect(packLiftMetrics(scene)['eval.pack_prey_size_ratio']?.value).toBeNull();
    });
});

describe('registry', () => {
    it('registers the emitted names with their directions', () => {
        expect(Object.keys(packLiftMetrics(createPackLiftScene()))).toEqual(
            namesOf('js/evo/scene-pack-lift.js').sort(),
        );
        expect(directionOf('eval.pack_lift')).toBe('higher');
        expect(directionOf('eval.pack_prey_size_ratio')).toBe('watch');
    });
});
