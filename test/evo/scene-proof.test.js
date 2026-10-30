// The proof-rule detectors: the proven and established shares of the deaths, and lineage persistence through a winter
// and a hunted year, on hand-built worlds.

import { describe, expect, it } from 'vitest';
import { DEATH_CAUSE } from '../../js/sim/events.js';
import { WINTER } from '../../js/sim/eras.js';
import { noteProofDeath, noteProofKill, proofMetrics, trackProof } from '../../js/evo/scene-proof.js';
import { addBlob } from '../sim/helpers/life-world.js';
import { observed } from './helpers/observer-world.js';

const T0 = 10000;
const SEASON = 1000;

/**
 * @param {any} r the world and observer
 * @param {number} slot the slot
 * @param {{proven?: number, established?: number, lineage?: number}} fields its proof state
 * @returns {number} the slot
 */
function mark(r, slot, { proven = 0, established = 0, lineage = slot + 1 }) {
    r.world.proven[slot] = proven;
    r.world.established[slot] = established;
    r.world.lineageId[slot] = lineage;
    r.observer.genomeId[slot] = r.world.genomeId[slot];
    return slot;
}

describe('proven and established shares', () => {
    it('are the shares of the deaths after burn-in, read from the last tick of the slot', () => {
        const r = observed();
        const scene = r.observer.scenes.proof;
        const [a, b, c] = [0, 1, 2].map(() => addBlob(r.world));
        mark(r, a, { proven: 1, established: 1 });
        mark(r, b, { proven: 1 });
        mark(r, c, {});
        r.world.tick = T0 + 1;
        trackProof(scene, r.world);
        for (const slot of [a, b, c]) {
            r.world.alive[slot] = 0;
            noteProofDeath(scene, r.observer, { slot, genomeId: r.observer.genomeId[slot], tick: T0 + 2 });
        }
        const m = proofMetrics(scene);
        expect(m['eval.proven_share'].value).toBeCloseTo(2 / 3, 12);
        expect(m['eval.established_share'].value).toBeCloseTo(1 / 3, 12);
    });

    it('ignore a death before burn-in and one the observer does not track, and read null with none', () => {
        const r = observed();
        const scene = r.observer.scenes.proof;
        expect(proofMetrics(scene)['eval.proven_share'].value).toBeNull();
        const slot = mark(r, addBlob(r.world), { proven: 1, established: 1 });
        r.world.tick = T0 + 1;
        trackProof(scene, r.world);
        noteProofDeath(scene, r.observer, { slot, genomeId: r.observer.genomeId[slot], tick: T0 - 1 });
        expect(proofMetrics(scene)['eval.proven_share'].value).toBeNull();
        noteProofDeath(scene, r.observer, { slot, genomeId: 999, tick: T0 + 2 });
        expect(proofMetrics(scene)['eval.proven_share'].value).toBe(0);
    });
});

describe('lineage persistence', () => {
    /**
     * @param {any} r the world and observer
     * @param {number} tick the tick to run the boundary at
     * @param {number} season the season index at that tick
     * @returns {void}
     */
    function boundary(r, tick, season) {
        r.world.tick = tick;
        r.world.season[0] = season;
        trackProof(r.observer.scenes.proof, r.world);
    }

    /** Two established lineages, 10 and 20, and a third that is not established. */
    function lineages() {
        const r = observed({ eraSeasonTicks: SEASON });
        const slots = [10, 20, 30].map((lineage, i) =>
            mark(r, addBlob(r.world), { proven: 1, established: i < 2 ? 1 : 0, lineage }),
        );
        return { r, slots };
    }

    it('scores the established lineages alive at a winter start by whether they live to spring', () => {
        const { r, slots } = lineages();
        boundary(r, T0 + 3 * SEASON, WINTER);
        r.world.alive[slots[1]] = 0;
        boundary(r, T0 + 4 * SEASON, 0);
        expect(proofMetrics(r.observer.scenes.proof)['eval.lineage_persistence'].value).toBe(0.5);
    });

    it('scores a hunted year by the hunted lineages alive at its end, and ignores lineages never eaten', () => {
        const { r, slots } = lineages();
        const scene = r.observer.scenes.proof;
        boundary(r, T0, 0);
        noteProofKill(scene, { cause: DEATH_CAUSE.STARVED, lineageId: 10 });
        noteProofKill(scene, { cause: DEATH_CAUSE.EATEN, lineageId: 20 });
        noteProofKill(scene, { cause: DEATH_CAUSE.EATEN, lineageId: 30 });
        boundary(r, T0 + 4 * SEASON, 0);
        expect(proofMetrics(scene)['eval.lineage_persistence'].value).toBe(1);
        noteProofKill(scene, { cause: DEATH_CAUSE.EATEN, lineageId: 20 });
        r.world.alive[slots[1]] = 0;
        boundary(r, T0 + 8 * SEASON, 0);
        expect(scene.samples).toBe(2);
        expect(proofMetrics(scene)['eval.lineage_persistence'].value).toBe(0.5);
    });

    it('is the mean of all the samples', () => {
        const { r, slots } = lineages();
        const scene = r.observer.scenes.proof;
        boundary(r, T0, 0);
        boundary(r, T0 + 3 * SEASON, WINTER);
        noteProofKill(scene, { cause: DEATH_CAUSE.EATEN, lineageId: 20 });
        r.world.alive[slots[1]] = 0;
        boundary(r, T0 + 4 * SEASON, 0);
        expect(scene.samples).toBe(2);
        expect(proofMetrics(scene)['eval.lineage_persistence'].value).toBe(0.25);
    });

    it('takes no sample and no snapshot at the start of a season that is neither spring nor winter', () => {
        const { r, slots } = lineages();
        boundary(r, T0 + SEASON, 1);
        boundary(r, T0 + 2 * SEASON, 2);
        r.world.alive[slots[1]] = 0;
        boundary(r, T0 + 4 * SEASON, 0);
        expect(r.observer.scenes.proof.samples).toBe(0);
        expect(proofMetrics(r.observer.scenes.proof)['eval.lineage_persistence'].value).toBeNull();
    });

    it('reads null before burn-in and with no established lineage', () => {
        const { r } = lineages();
        boundary(r, T0 - SEASON, WINTER);
        boundary(r, T0, 0);
        expect(proofMetrics(r.observer.scenes.proof)['eval.lineage_persistence'].value).toBeNull();
    });
});
