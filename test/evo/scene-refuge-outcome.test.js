// What cover does for prey: crowding, the bite deficit, the eligible share and the cold bands, on a hand-built `basins`
// world with two rings (refuge.md, Detectors).

import { describe, expect, it } from 'vitest';
import { computeMetrics } from '../../js/evo/metrics.js';
import {
    MIN_RING_PREY_SAMPLES,
    REFUGE_CLEARANCE_PX,
    sampleRefugeOutcome,
    tickRefugeBites,
} from '../../js/evo/scene-refuge-outcome.js';
import { refugeCentres } from '../../js/evo/scene-terrain.js';
import { addBlob } from '../sim/helpers/life-world.js';
import { observed } from './helpers/observer-world.js';

const T0 = 10000;
const BASINS = {
    worldWidth: 4000,
    worldHeight: 2000,
    refugeCount: 2,
    wallGaps: 1,
    coldMarginWidth: 600,
    maxAgents: 64,
};

function setup() {
    const r = observed(BASINS);
    const centres = refugeCentres(r.observer.scenes.terrain, r.world);
    return { ...r, centres, tick: T0 };
}

/** Puts a new agent at a point with a threat level, and returns its slot. */
function place(/** @type {any} */ r, /** @type {number[]} */ at, threat = 0) {
    const slot = addBlob(r.world, { x: at[0], y: at[1] });
    r.observer.intent.threatProx[slot] = threat;
    return slot;
}

function sample(/** @type {any} */ r) {
    r.world.tick = r.tick;
    r.tick += 10;
    sampleRefugeOutcome(r.observer.scenes.refugeOutcome, r.observer, r.world);
}

/** Makes a slot a hunter. */
function hunt(/** @type {any} */ r, /** @type {number} */ slot) {
    r.world.spec[slot] = 1;
    r.observer.intent.hunterSpec[1] = 1;
}

const read = (/** @type {any} */ r, /** @type {string} */ name) => computeMetrics(r.observer, r.world)[`eval.${name}`];

describe('eval.refuge_crowding', () => {
    it('is the mean prey inside the rings that hold a threatened prey', () => {
        const r = setup();
        const [x0, y0, x1, y1] = r.centres;
        place(r, [x0, y0], 0.9);
        place(r, [x0 + 20, y0], 0);
        place(r, [x0, y0 + 20], 0);
        place(r, [x1, y1], 0);
        place(r, [x1 + 20, y1], 0);
        place(r, [10, 10], 0.9);
        sample(r);
        expect(read(r, 'refuge_crowding').value).toBe(3);
        place(r, [x0 - 20, y0], 0);
        place(r, [x0, y0 - 20], 0);
        sample(r);
        expect(read(r, 'refuge_crowding').value).toBe((3 + 5) / 2);
    });

    it('leaves hunters out, and is null when no ring holds a threatened prey', () => {
        const r = setup();
        const [x0, y0] = r.centres;
        hunt(r, place(r, [x0, y0], 0.9));
        place(r, [x0, y0], 0);
        sample(r);
        expect(read(r, 'refuge_crowding').value).toBeNull();
    });
});

describe('eval.refuge_eligible_share', () => {
    it('is the share of prey whose radius leaves the clearance under refugeSizeMax', () => {
        const r = setup();
        const fits = r.world.config.refugeSizeMax - REFUGE_CLEARANCE_PX;
        for (const size of [20, fits, fits + 0.5, 40]) {
            r.world.size[place(r, [10, 10])] = size;
        }
        const hunter = place(r, [10, 10]);
        r.world.size[hunter] = 20;
        hunt(r, hunter);
        sample(r);
        expect(read(r, 'refuge_eligible_share').value).toBe(0.5);
    });
});

describe('eval.cold_margin_use_under_threat', () => {
    it('is the threatened share in the cold bands minus the calm share, over prey', () => {
        const r = setup();
        place(r, [100, 100], 0.9);
        place(r, [100, 1000], 0.9);
        place(r, [100, 1900], 0);
        place(r, [100, 1000], 0);
        place(r, [100, 1000], 0);
        hunt(r, place(r, [100, 100], 0.9));
        sample(r);
        expect(read(r, 'cold_margin_use_under_threat').value).toBeCloseTo(1 / 2 - 1 / 3, 12);
    });
});

describe('eval.refuge_bite_deficit', () => {
    /** Ten prey in a ring and ten outside for ten samples; the bites are counted at the tick they land. */
    function bitten(/** @type {number} */ inside, /** @type {number} */ outside) {
        const r = setup();
        const [x0, y0] = r.centres;
        const ins = Array.from({ length: 10 }, () => place(r, [x0, y0]));
        const outs = Array.from({ length: 10 }, () => place(r, [10, 10]));
        for (let i = 0; i < 10; i++) {
            sample(r);
        }
        for (const slot of [...ins.slice(0, inside), ...outs.slice(0, outside)]) {
            r.world.bittenTimer[slot] = 1;
        }
        tickRefugeBites(r.observer.scenes.refugeOutcome, r.observer, r.world);
        return r;
    }

    it('is bites per prey-tick inside a ring over the same outside', () => {
        expect(MIN_RING_PREY_SAMPLES).toBeLessThanOrEqual(100);
        expect(read(bitten(1, 4), 'refuge_bite_deficit').value).toBe(0.25);
    });

    it('counts prey only, and not before burn-in', () => {
        const r = bitten(1, 1);
        const hunter = place(r, [r.centres[0], r.centres[1]]);
        hunt(r, hunter);
        r.world.bittenTimer[hunter] = 1;
        r.world.tick = 50;
        tickRefugeBites(r.observer.scenes.refugeOutcome, r.observer, r.world);
        const scene = r.observer.scenes.refugeOutcome;
        expect([scene.bitesIn, scene.bitesOut]).toEqual([1, 1]);
    });

    it('is null with no bite outside a ring, and under the minimum samples inside', () => {
        expect(read(bitten(1, 0), 'refuge_bite_deficit').value).toBeNull();
        const r = setup();
        place(r, [r.centres[0], r.centres[1]]);
        place(r, [10, 10]);
        sample(r);
        r.world.bittenTimer[1] = 1;
        tickRefugeBites(r.observer.scenes.refugeOutcome, r.observer, r.world);
        expect(read(r, 'refuge_bite_deficit').value).toBeNull();
    });
});
