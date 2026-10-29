// Style: chain-length style for hunters, ring-sitting style for the rest, and the separation of lineage means.

import { describe, expect, it } from 'vitest';
import { computeMetrics } from '../../js/evo/metrics.js';
import { noteChase } from '../../js/evo/observer-watch-counters.js';
import {
    MIN_STYLE_DEATHS,
    STYLE_CHAIN_CAP,
    noteStyleBite,
    noteStyleDeath,
    styleOf,
    tickStyle,
} from '../../js/evo/style.js';
import { refugeCentres } from '../../js/evo/scene-terrain.js';
import { addBlob } from '../sim/helpers/life-world.js';
import { observed } from './helpers/observer-world.js';

const BASINS = {
    worldWidth: 4000,
    worldHeight: 2000,
    refugeCount: 2,
    wallGaps: 1,
    maxAgents: 64,
};

const read = (/** @type {any} */ r, /** @type {string} */ name) => computeMetrics(r.observer, r.world)[`eval.${name}`];

/** Tracks a slot in the observer under its world spec and lineage. */
function track(/** @type {any} */ r, /** @type {number} */ slot) {
    r.observer.slotOf.set(r.world.genomeId[slot], slot);
    r.observer.spec[slot] = r.world.spec[slot];
    r.observer.lineageId[slot] = r.world.lineageId[slot];
    r.observer.genomeId[slot] = r.world.genomeId[slot];
}

describe('styleOf for a hunter', () => {
    it('is the mean capped chain length over the cap', () => {
        const r = observed();
        const hunter = addBlob(r.world, { spec: r.world.config.specialisations.predator.index });
        track(r, hunter);
        const style = r.observer.scenes.style;
        expect(styleOf(r.observer, hunter)).toBe(0);
        noteStyleBite(style, hunter, { continues: false, gap: 0 });
        noteStyleBite(style, hunter, { continues: true, gap: 20 });
        noteStyleBite(style, hunter, { continues: true, gap: 20 });
        expect(styleOf(r.observer, hunter)).toBeCloseTo(40 / STYLE_CHAIN_CAP, 12);
        noteStyleBite(style, hunter, { continues: false, gap: 0 });
        noteStyleBite(style, hunter, { continues: true, gap: 100 });
        expect(styleOf(r.observer, hunter)).toBeCloseTo((40 + STYLE_CHAIN_CAP) / 2 / STYLE_CHAIN_CAP, 12);
    });

    it('is fed by the deliberate-bite chain that noteChase follows', () => {
        const r = observed();
        const hunter = addBlob(r.world, { spec: r.world.config.specialisations.predator.index });
        const prey = addBlob(r.world);
        track(r, hunter);
        track(r, prey);
        r.world.bittenTimer[prey] = 100;
        for (const tick of [100, 120, 140]) {
            r.world.tick = tick;
            r.observer.intent.prey.seen[hunter] = tick;
            r.observer.intent.prey.turn[hunter] = tick;
            r.observer.intent.prey.bits[hunter] = 0x3ff;
            r.world.bittenTimer[prey] = 1;
            r.world.lastBiter[prey] = r.world.genomeId[hunter];
            noteChase(r.observer, r.world);
        }
        expect(r.observer.scenes.style.chains[hunter]).toBe(1);
        expect(styleOf(r.observer, hunter)).toBeCloseTo(40 / STYLE_CHAIN_CAP, 12);
        expect(r.observer.chaseTicks[hunter]).toBe(40);
    });
});

describe('styleOf for a non-hunter', () => {
    it('is the share of life ticks still inside a ring under threat', () => {
        const r = observed(BASINS);
        const [cx, cy] = refugeCentres(r.observer.scenes.terrain, r.world);
        const slot = addBlob(r.world, { x: cx, y: cy });
        track(r, slot);
        r.observer.intent.threatProx[slot] = 0.9;
        const limit = 0.1 * r.world.config.maxVelocity;
        for (let tick = 1; tick <= 10; tick++) {
            r.world.vx[slot] = tick <= 4 ? 0 : limit * 2;
            r.world.x[slot] = tick <= 6 ? cx : 10;
            r.observer.intent.aliveTicks[slot] = tick;
            tickStyle(r.observer, r.world);
        }
        expect(r.observer.scenes.style.ringTicks[slot]).toBe(4);
        expect(styleOf(r.observer, slot)).toBe(0.4);
    });

    it('needs the threat ray: an unthreatened agent sitting in a ring scores 0', () => {
        const r = observed(BASINS);
        const [cx, cy] = refugeCentres(r.observer.scenes.terrain, r.world);
        const slot = addBlob(r.world, { x: cx, y: cy });
        track(r, slot);
        r.observer.intent.threatProx[slot] = 0.49;
        tickStyle(r.observer, r.world);
        expect(r.observer.scenes.style.ringTicks[slot]).toBe(0);
    });
});

describe('eval.style_separation', () => {
    /** Notes `n` deaths of lineage `lineage` in a specialisation with ring share `share`. */
    function die(/** @type {any} */ r, /** @type {Record<string, number>} */ f) {
        for (let i = 0; i < f.n; i++) {
            r.observer.lineageId[0] = f.lineage;
            r.observer.spec[0] = f.spec;
            r.observer.intent.aliveTicks[0] = 10;
            r.observer.scenes.style.ringTicks[0] = f.share * 10;
            noteStyleDeath(r.observer, 0);
        }
    }

    it('is the largest gap between lineage means inside one specialisation, over lineages with enough deaths', () => {
        const r = observed();
        die(r, { lineage: 1, spec: 0, n: MIN_STYLE_DEATHS, share: 0.2 });
        die(r, { lineage: 2, spec: 0, n: MIN_STYLE_DEATHS, share: 0.7 });
        die(r, { lineage: 3, spec: 0, n: MIN_STYLE_DEATHS - 1, share: 1 });
        die(r, { lineage: 4, spec: 2, n: MIN_STYLE_DEATHS, share: 1 });
        die(r, { lineage: 5, spec: 2, n: MIN_STYLE_DEATHS, share: 0.9 });
        expect(read(r, 'style_separation').value).toBeCloseTo(0.5, 12);
    });

    it('is null before any lineage has enough deaths', () => {
        const r = observed();
        die(r, { lineage: 1, spec: 0, n: 3, share: 0.2 });
        expect(read(r, 'style_separation').value).toBeNull();
    });
});
