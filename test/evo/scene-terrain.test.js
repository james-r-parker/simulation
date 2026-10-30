// Refuge and cross or stay on a hand-built `basins` world (4000 x 2000, two refuges, one wall gap).

import { describe, expect, it } from 'vitest';
import { computeMetrics } from '../../js/evo/metrics.js';
import {
    MIN_LINEAGE_SAMPLES,
    inRefuge,
    refugeCentres,
    ringDistance,
    sampleTerrain,
} from '../../js/evo/scene-terrain.js';
import { REFUGE_ROCKS, ringRadius } from '../../js/sim/terrain.js';
import { addBlob } from '../sim/helpers/life-world.js';
import { observed } from './helpers/observer-world.js';

const T0 = 10000;
const BASINS = {
    worldWidth: 4000,
    worldHeight: 2000,
    refugeCount: 2,
    wallGaps: 1,
    maxAgents: 64,
};

const read = (/** @type {any} */ r, /** @type {string} */ name) => computeMetrics(r.observer, r.world)[`eval.${name}`];

describe('the refuge centres', () => {
    it('are the middles of the rings of eight rocks, each rock one ring radius away', () => {
        const { world, observer } = observed(BASINS);
        const centres = refugeCentres(observer.scenes.terrain, world);
        const radius = ringRadius(world.config);
        expect(centres).toHaveLength(4);
        const first = world.obsX.length - 2 * REFUGE_ROCKS;
        for (let ring = 0; ring < 2; ring++) {
            for (let r = 0; r < REFUGE_ROCKS; r++) {
                const dx = world.obsX[first + ring * REFUGE_ROCKS + r] - centres[2 * ring];
                const dy = world.obsY[first + ring * REFUGE_ROCKS + r] - centres[2 * ring + 1];
                expect(Math.sqrt(dx * dx + dy * dy)).toBeCloseTo(radius, 2);
            }
        }
    });

    it('measure the distance to the nearest ring edge, 0 inside, and Infinity with no refuge', () => {
        const { world, observer } = observed(BASINS);
        const scene = observer.scenes.terrain;
        const [cx, cy] = refugeCentres(scene, world);
        const radius = ringRadius(world.config);
        expect(ringDistance(scene, world, cx, cy)).toBe(0);
        expect(ringDistance(scene, world, cx + radius + 25, cy)).toBeCloseTo(25, 6);
        const slot = addBlob(world, { x: cx, y: cy });
        expect(inRefuge(scene, world, slot)).toBe(true);
        const open = observed();
        expect(ringDistance(open.observer.scenes.terrain, open.world, 5, 5)).toBe(Infinity);
    });
});

describe('eval.refuge_use_under_threat', () => {
    it('is the threatened share inside a ring minus the unthreatened share', () => {
        const r = observed(BASINS);
        const scene = r.observer.scenes.terrain;
        const [cx, cy] = refugeCentres(scene, r.world);
        const spots = [
            [cx, cy, 0.9],
            [10, 10, 0.9],
            [cx, cy, 0],
            [20, 20, 0.2],
            [30, 30, 0],
        ];
        for (const [x, y, threat] of spots) {
            r.observer.intent.threatProx[addBlob(r.world, { x, y })] = threat;
        }
        r.world.tick = T0;
        sampleTerrain(scene, r.observer, r.world);
        expect(read(r, 'refuge_use_under_threat').value).toBeCloseTo(1 / 2 - 1 / 3, 12);
    });

    it('counts a ray hit at proximity 0.5 and ignores samples before burn-in', () => {
        const r = observed(BASINS);
        const scene = r.observer.scenes.terrain;
        const [cx, cy] = refugeCentres(scene, r.world);
        r.observer.intent.threatProx[addBlob(r.world, { x: cx, y: cy })] = 0.5;
        addBlob(r.world, { x: 10, y: 10 });
        r.world.tick = T0 - 10;
        sampleTerrain(scene, r.observer, r.world);
        expect(read(r, 'refuge_use_under_threat').value).toBeNull();
        r.world.tick = T0;
        sampleTerrain(scene, r.observer, r.world);
        expect(read(r, 'refuge_use_under_threat').value).toBe(1);
    });

    it('is null on an open world', () => {
        const r = observed();
        addBlob(r.world);
        r.world.tick = T0;
        sampleTerrain(r.observer.scenes.terrain, r.observer, r.world);
        expect(read(r, 'refuge_use_under_threat').value).toBeNull();
        expect(read(r, 'gap_crossers').value).toBeNull();
    });
});

describe('eval.gap_crossers and eval.gap_never_share', () => {
    it('are the mean crossings per lineage and the share of lineages that never crossed', () => {
        const r = observed(BASINS);
        const scene = r.observer.scenes.terrain;
        const crosser = addBlob(r.world, { lineageId: 7 });
        const stayer = addBlob(r.world, { lineageId: 8 });
        const brief = addBlob(r.world, { lineageId: 9 });
        for (let i = 0; i < MIN_LINEAGE_SAMPLES; i++) {
            r.world.tick = T0 + 10 * i;
            r.world.x[crosser] = i % 2 === 0 ? 100 : 3900;
            r.world.x[stayer] = 100;
            r.world.x[brief] = i % 2 === 0 ? 100 : 3900;
            r.world.alive[brief] = i < 5 ? 1 : 0;
            sampleTerrain(scene, r.observer, r.world);
        }
        expect(read(r, 'gap_crossers').value).toBe((MIN_LINEAGE_SAMPLES - 1) / 2);
        expect(read(r, 'gap_never_share').value).toBe(0.5);
    });

    it('do not count a new genome in a slot as a crossing', () => {
        const r = observed(BASINS);
        const scene = r.observer.scenes.terrain;
        const slot = addBlob(r.world, { lineageId: 7, x: 100 });
        for (let i = 0; i < MIN_LINEAGE_SAMPLES; i++) {
            r.world.tick = T0 + 10 * i;
            r.world.genomeId[slot] = 1000 + i;
            r.world.x[slot] = i % 2 === 0 ? 100 : 3900;
            sampleTerrain(scene, r.observer, r.world);
        }
        expect(read(r, 'gap_crossers').value).toBe(0);
        expect(read(r, 'gap_never_share').value).toBe(1);
    });
});
