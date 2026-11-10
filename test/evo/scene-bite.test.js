// The bite detectors (hunter-practice.md T20, T21): the body in a hunter's jaws against its wish to bite, on hand-built worlds.

import { describe, expect, it } from 'vitest';
import { DEFAULTS } from '../../js/sim/config-defaults.js';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { inputOffsets } from '../../js/sim/brain-layout.js';
import { BITE_MIN_OPPORTUNITIES, JAWS, biteMetrics, createBiteScene, tickBite } from '../../js/evo/scene-bite.js';
import { directionOf, namesOf } from './helpers/metric-registry.js';

const N = 8;
const PREDATOR = DEFAULTS.specialisations.predator.index;
const FORAGER = DEFAULTS.specialisations.forager.index;

/**
 * @param {{bodies: Array<{size: number, parent?: number, spec?: number}>, bites: number[], pairs: number[][], arc?: number, views?: Record<string, number>}} w
 *   slot 0 is the hunter; `bites` is the wish of each slot; `pairs` the touching slots
 * @returns {Record<string, any>} a hand-built world: every body faces +x and sits at the origin or on the x axis
 */
function world({ bodies, bites, pairs, arc = Math.PI, views = {} }) {
    const offsets = inputOffsets(DEFAULTS);
    const layout = { inputCount: 128, pooled: offsets.pooled };
    const w = {
        config: { ...DEFAULTS, biteArc: arc },
        layout,
        alive: new Uint8Array(N),
        spec: new Uint8Array(N),
        size: new Float32Array(N),
        genomeId: new Uint32Array(N),
        parentA: new Uint32Array(N),
        parentB: new Uint32Array(N),
        x: new Float32Array(N),
        y: new Float32Array(N),
        angle: new Float32Array(N),
        biteCos: new Float64Array([Math.cos(arc)]),
        outputs: new Float64Array(N * OUTPUT_COUNT),
        pooled: new Float32Array(N * layout.inputCount),
        huntBySpec: new Float64Array([0, 1, 0, 0, 0]),
        contacts: new Int32Array(2 * pairs.length),
        contactCount: pairs.length,
    };
    bodies.forEach(({ size, parent = 0, spec = FORAGER }, slot) => {
        w.alive[slot] = 1;
        w.spec[slot] = slot === 0 ? PREDATOR : spec;
        w.size[slot] = size;
        w.genomeId[slot] = slot + 1;
        w.parentA[slot] = parent;
        w.x[slot] = slot * 5;
        w.outputs[slot * OUTPUT_COUNT + OUTPUT_INDEX.BITE] = bites[slot];
    });
    for (const [channel, value] of Object.entries(views)) {
        w.pooled[layout.pooled[channel]] = value;
    }
    pairs.forEach(([a, b], c) => w.contacts.set([a, b], 2 * c));
    return w;
}

/**
 * @param {Record<string, any>} w the world
 * @param {number} ticks how often to tally it
 * @returns {Record<string, import('../../js/evo/metrics-stats.js').MetricResult>} the metrics
 */
function read(w, ticks) {
    const scene = createBiteScene({ maxAgents: N });
    for (let t = 0; t < ticks; t++) {
        tickBite(scene, w);
    }
    return biteMetrics(scene);
}

const HUNTER = { size: 20 };
const PREY = { size: 5 };
const KIN = { size: 5, parent: 1 };
const BIG = { size: 40 };
const T = BITE_MIN_OPPORTUNITIES;

describe('tickBite without pooled input', () => {
    it('keeps jaw metrics working in a world without pooled brain inputs', () => {
        const w = world({ bodies: [HUNTER], bites: [1], pairs: [] });
        const scene = createBiteScene({ maxAgents: N });
        tickBite(scene, { ...w, pooled: undefined, layout: undefined });
        expect(biteMetrics(scene)['eval.bite_idle']).toEqual({ value: 1 });
    });
});

describe('eval.bite_wish_with_prey_in_jaws', () => {
    it('is 0 for a brain that never bites and 1 for one that always bites', () => {
        const never = world({ bodies: [HUNTER, PREY], bites: [0, 0], pairs: [[0, 1]] });
        const always = world({ bodies: [HUNTER, PREY], bites: [1, 0], pairs: [[0, 1]] });
        expect(read(never, T)['eval.bite_wish_with_prey_in_jaws'].value).toBe(0);
        expect(read(always, T)['eval.bite_wish_with_prey_in_jaws'].value).toBe(1);
    });

    it('is null under 30 opportunities, with the count in the reason', () => {
        const w = world({ bodies: [HUNTER, PREY], bites: [1, 0], pairs: [[0, 1]] });
        const m = read(w, T - 1)['eval.bite_wish_with_prey_in_jaws'];
        expect(m.value).toBeNull();
        expect(m.reason).toContain('29 hunter-ticks');
    });

    it('does not count a victim outside the jaws', () => {
        const w = world({ bodies: [HUNTER, PREY], bites: [1, 0], pairs: [[0, 1]], arc: 0.5 });
        w.angle[0] = Math.PI;
        const m = read(w, T);
        expect(m['eval.bite_wish_with_prey_in_jaws'].value).toBeNull();
        expect(m['eval.bite_idle'].value).toBe(1);
    });
});

describe('the false-positive reads', () => {
    it('a brain that bites only prey reads 1 on prey and 0 on kin, other and idle', () => {
        const prey = world({ bodies: [HUNTER, PREY], bites: [1, 0], pairs: [[0, 1]] });
        const kin = world({ bodies: [HUNTER, KIN], bites: [0, 0], pairs: [[0, 1]] });
        const big = world({ bodies: [HUNTER, BIG], bites: [0, 0], pairs: [[0, 1]] });
        const idle = world({ bodies: [HUNTER], bites: [0], pairs: [] });
        expect(read(prey, T)['eval.bite_wish_with_prey_in_jaws'].value).toBe(1);
        expect(read(kin, T)['eval.bite_wish_with_kin_in_jaws'].value).toBe(0);
        expect(read(big, T)['eval.bite_wish_with_other_in_jaws'].value).toBe(0);
        expect(read(idle, T)['eval.bite_idle'].value).toBe(0);
    });

    it('a brain that always bites reads 1 on kin, other and idle', () => {
        const kin = world({ bodies: [HUNTER, KIN], bites: [1, 0], pairs: [[0, 1]] });
        const big = world({ bodies: [HUNTER, BIG], bites: [1, 0], pairs: [[0, 1]] });
        const idle = world({ bodies: [HUNTER], bites: [1], pairs: [] });
        expect(read(kin, T)['eval.bite_wish_with_kin_in_jaws'].value).toBe(1);
        expect(read(big, T)['eval.bite_wish_with_other_in_jaws'].value).toBe(1);
        expect(read(idle, T)['eval.bite_idle'].value).toBe(1);
    });

    it('classifies each body in the jaws independently', () => {
        const w = world({ bodies: [HUNTER, KIN, PREY], bites: [1, 0, 0], pairs: [[0, 1]] });
        const m = read(w, T);
        expect(m['eval.bite_wish_with_kin_in_jaws'].value).toBe(1);
        expect(m['eval.bite_wish_with_prey_in_jaws'].value).toBeNull();
    });

    it('counts a non-hunter never, and gives each body its own opportunity', () => {
        const w = world({
            bodies: [HUNTER, PREY, KIN],
            bites: [1, 1, 0],
            pairs: [
                [0, 1],
                [0, 2],
                [1, 2],
            ],
        });
        const scene = createBiteScene({ maxAgents: N });
        tickBite(scene, w);
        expect(scene.opportunities.reduce((/** @type {number} */ a, /** @type {number} */ b) => a + b)).toBe(2);
        expect(scene.opportunities[JAWS.PREY]).toBe(1);
        expect(scene.opportunities[JAWS.KIN]).toBe(1);
    });
});

describe('the directions', () => {
    it('name the four metrics', () => {
        expect(namesOf('js/evo/scene-bite.js').sort()).toEqual(
            Object.keys(read(world({ bodies: [HUNTER], bites: [0], pairs: [] }), 1)).sort(),
        );
        expect(directionOf('eval.bite_wish_with_prey_in_jaws')).toBe('higher');
    });
});

describe('pooled view shares', () => {
    it('reads a prey-view bite wish without requiring a body in the jaws', () => {
        const w = world({ bodies: [HUNTER], bites: [1], pairs: [], views: { prey: 1 } });
        const m = read(w, T);
        expect(m['eval.bite_on_prey_view']).toEqual({ value: 1 });
        expect(m['eval.bite_wish_with_prey_in_jaws'].value).toBeNull();
    });

    it('reads kin and other view channels independently', () => {
        const kin = world({ bodies: [HUNTER], bites: [0], pairs: [], views: { kin: 1 } });
        const other = world({ bodies: [HUNTER], bites: [1], pairs: [], views: { other: 1 } });
        expect(read(kin, T)['eval.bite_off_kin_view']).toEqual({ value: 0 });
        expect(read(other, T)['eval.bite_off_other_view']).toEqual({ value: 1 });
    });
});
