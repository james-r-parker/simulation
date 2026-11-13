// The eat-choice detectors (eat-choice.md, T1): the two bite shares and the fat speed ratio, against hand-built worlds.

import { describe, expect, it } from 'vitest';
import { FOOD_KIND } from '../../js/sim/carcass.js';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { BURN_IN_TICKS } from '../../js/evo/burn-in.js';
import { EAT_CONTACT } from '../../js/sim/eat-contact.js';
import { createEatScene, eatMetrics, sampleEat } from '../../js/evo/scene-eat.js';
import { directionOf, intendedOf, namesOf } from './helpers/metric-registry.js';

const T = Math.ceil(BURN_IN_TICKS / 1000) * 1000;
const MAX = 1000;
const FORAGER = 0;
const PREDATOR = 1;
const SCOUT = 2;
const SIZE = 5;
const RADIUS = 2;

/**
 * @typedef {object} Agent one hand-built agent, and the food item placed beside it
 * @property {number} [spec] its specialisation (default the forager)
 * @property {number} [fraction] its store over `MAX` (default 0.5)
 * @property {boolean} [bite] whether its BITE output is above 0
 * @property {number} [speed] its speed (default 1)
 * @property {number} [gap] the distance from its centre to its food (default 1; `SIZE + RADIUS` or more is no contact)
 * @property {number} [kind] its food's kind (default plant)
 * @property {boolean} [foodAlive] whether the food is alive (default true)
 * @property {boolean} [alive] whether the agent is alive (default true)
 * @property {number} [dose] its toxin dose (default 0)
 * @property {number} [ateTimer] ticks since its last meal (default 100)
 */

/**
 * @param {Agent[]} agents the agents, one food item each
 * @param {Record<string, number>} [config] config overrides
 * @returns {Record<string, any>} a hand-built world at the first checkpoint after burn-in
 */
function world(agents, config = {}) {
    const n = agents.length;
    const w = {
        tick: T,
        config: {
            specialisations: { forager: { index: FORAGER }, predator: { index: PREDATOR }, scout: { index: SCOUT } },
            sickDose: 5,
            satiationShare: 0.95,
            digestTicks: 10,
            worldWidth: 100 * n + 1000,
            worldHeight: 1000,
            maxFood: n,
            ...config,
        },
        huntBySpec: Float64Array.from([0, 1, 0]),
        maxEnergyBySpec: Float64Array.from([MAX, MAX, MAX]),
        plantFoodBySpec: Float64Array.from([1, 0, 0]),
        meatFoodBySpec: Float64Array.from([0, 1, 1]),
        alive: new Uint8Array(n),
        spec: new Uint8Array(n),
        energy: new Float64Array(n),
        size: new Float32Array(n).fill(SIZE),
        x: new Float32Array(n),
        y: new Float32Array(n),
        vx: new Float32Array(n),
        vy: new Float32Array(n),
        dose: new Float64Array(n),
        ateTimer: new Uint32Array(n),
        outputs: new Float32Array(n * OUTPUT_COUNT),
        eatContacts: new Float64Array(EAT_CONTACT.COUNT),
        foodAlive: new Uint8Array(n),
        foodKind: new Uint8Array(n),
        foodX: new Float32Array(n),
        foodY: new Float32Array(n),
        foodRadius: new Float32Array(n).fill(RADIUS),
    };
    agents.forEach((a, i) => {
        w.alive[i] = a.alive === false ? 0 : 1;
        w.spec[i] = a.spec ?? FORAGER;
        w.energy[i] = (a.fraction ?? 0.5) * MAX;
        w.x[i] = 100 * i;
        w.vx[i] = a.speed ?? 1;
        w.dose[i] = a.dose ?? 0;
        w.ateTimer[i] = a.ateTimer ?? 100;
        w.outputs[i * OUTPUT_COUNT + OUTPUT_INDEX.BITE] = a.bite ? 1 : -1;
        w.foodAlive[i] = a.foodAlive === false ? 0 : 1;
        w.foodKind[i] = a.kind ?? FOOD_KIND.PLANT;
        w.foodX[i] = 100 * i + (a.gap ?? 1);
    });
    return w;
}

/**
 * @param {Record<string, any>} w a world
 * @returns {Record<string, any>} the scene after one sample of it
 */
function sampled(w) {
    const scene = createEatScene(w.config);
    sampleEat(scene, w);
    return scene;
}

/** @param {Record<string, any>} scene @param {string} name @returns {number | null} the metric's value */
const read = (scene, name) => /** @type {any} */ (eatMetrics(scene))[name].value;

describe('the bite shares', () => {
    /** @param {Record<string, any>} w a world @param {number[]} counts contact, contact and bite, full, full and bite */
    const count = (w, counts) => w.eatContacts.set(counts);

    it('read the tallies the feed phase wrote: bites over contacts, and in the full band', () => {
        const w = world([{ gap: 50 }]);
        const scene = createEatScene(w.config);
        sampleEat(scene, w);
        count(w, [6, 4, 3, 2]);
        w.tick = T + 100;
        sampleEat(scene, w);
        expect(read(scene, 'eval.food_contact_bite_share')).toBeCloseTo(4 / 6, 12);
        expect(read(scene, 'eval.full_contact_bite_share')).toBeCloseTo(2 / 3, 12);
    });

    it('count only what was tallied after the first sample from burn-in', () => {
        const w = world([{ gap: 50 }]);
        count(w, [100, 100, 40, 40]); // before burn-in: every contact bit
        const scene = createEatScene(w.config);
        sampleEat(scene, w);
        count(w, [104, 101, 41, 40]);
        w.tick = T + 100;
        sampleEat(scene, w);
        expect(read(scene, 'eval.food_contact_bite_share')).toBeCloseTo(1 / 4, 12);
        expect(read(scene, 'eval.full_contact_bite_share')).toBe(0);
    });

    it('ignore the tally before burn-in and off the sample ticks', () => {
        const w = world([{ gap: 50 }]);
        const scene = createEatScene(w.config);
        w.tick = BURN_IN_TICKS - 1;
        count(w, [5, 5, 5, 5]);
        sampleEat(scene, w);
        w.tick = T + 1;
        sampleEat(scene, w);
        expect(scene.based).toBe(false);
        expect(read(scene, 'eval.food_contact_bite_share')).toBeNull();
    });

    it('are not read off the sampled agents: foragers in contact at the sample add nothing the feed phase did not tally', () => {
        const w = world([{ bite: true }, { fraction: 0.9, bite: false }]);
        const scene = createEatScene(w.config);
        sampleEat(scene, w);
        expect(read(scene, 'eval.food_contact_bite_share')).toBeNull();
        expect(read(scene, 'eval.full_contact_bite_share')).toBeNull();
    });

    it('is null with a reason when nothing was tallied, or nothing in the full band', () => {
        const w = world([{ gap: 50 }]);
        const scene = createEatScene(w.config);
        sampleEat(scene, w);
        expect(eatMetrics(scene)['eval.food_contact_bite_share']).toEqual({
            value: null,
            reason: 'no non-hunter contact with edible food after burn-in',
        });
        count(w, [3, 3, 0, 0]);
        w.tick = T + 100;
        sampleEat(scene, w);
        expect(read(scene, 'eval.food_contact_bite_share')).toBe(1);
        expect(eatMetrics(scene)['eval.full_contact_bite_share']?.value).toBeNull();
    });
});

describe('the fat speed ratio', () => {
    const agents = [
        // forager: mean fraction 0.5 over the moving ones; above 0.75 (speed 1), below 0.25 (speed 4), 0.5 on the mean
        { fraction: 0.25, speed: 4, gap: 50 },
        { fraction: 0.5, speed: 100, gap: 50 },
        { fraction: 0.75, speed: 1, gap: 50 },
        { fraction: 0.9, speed: 0, gap: 50 }, // standing: in neither the mean nor a side
        // scout: above 0.75 (speed 3), below 0.25 (speed 2)
        { spec: SCOUT, fraction: 0.25, speed: 2, gap: 50 },
        { spec: SCOUT, fraction: 0.75, speed: 3, gap: 50 },
        { spec: PREDATOR, fraction: 0.1, speed: 50, gap: 50 }, // a hunter
        { fraction: 0.1, speed: 50, gap: 50, alive: false },
    ];

    it('is the mean over the specialisations of the speed above their mean store over the speed below it', () => {
        expect(read(sampled(world(agents)), 'eval.fat_speed_ratio')).toBeCloseTo((0.25 + 1.5) / 2, 12);
    });

    it('pools the speeds over the checkpoints before it takes the ratio', () => {
        const w = world(agents);
        const scene = createEatScene(w.config);
        sampleEat(scene, w);
        w.vx[0] = 4;
        w.vx[2] = 3;
        w.tick = T + 100;
        sampleEat(scene, w);
        // forager: above (1 + 3) / 2 = 2 over below 4; scout: 3 over 2 both times
        expect(read(scene, 'eval.fat_speed_ratio')).toBeCloseTo((0.5 + 1.5) / 2, 12);
    });

    it('skips a specialisation that has moving agents on one side only', () => {
        const one = [{ fraction: 0.25, speed: 4, gap: 50 }, ...agents.slice(4, 6)];
        expect(read(sampled(world(one)), 'eval.fat_speed_ratio')).toBeCloseTo(1.5, 12);
    });

    it('is null with a reason when no specialisation has both sides', () => {
        const equal = [
            { fraction: 0.5, gap: 50 },
            { fraction: 0.5, gap: 50 },
        ];
        const metric = eatMetrics(sampled(world(equal)))['eval.fat_speed_ratio'];
        expect(metric?.value).toBeNull();
        expect(metric?.reason).toBe(
            'no specialisation with moving non-hunters above and below its mean store fraction',
        );
    });
});

describe('the graze and linger detectors on the same sample', () => {
    it('read the non-hunters for the graze time share and the hunters for the plant linger share', () => {
        const w = world(
            [
                { bite: true, gap: 50 }, // a forager holding BITE
                { bite: false, gap: 50 }, // a forager not holding it
                { spec: PREDATOR, speed: 0.5 }, // a hunter on plant, slow
                { spec: PREDATOR, speed: 5 }, // a hunter on plant, fast
                { spec: PREDATOR, speed: 0, alive: false },
            ],
            { maxVelocity: 8 },
        );
        const scene = sampled(w);
        expect(read(scene, 'eval.graze_time_share')).toBe(0.5);
        expect(read(scene, 'eval.hunter_plant_linger_share')).toBe(0.5);
    });
});

describe('the sample', () => {
    it('is taken only on a 100-tick multiple at or after burn-in', () => {
        for (const tick of [T - 100, T + 1, T + 99]) {
            const w = world([{ bite: true }]);
            w.tick = tick;
            expect(sampled(w).based).toBe(false);
        }
        expect(sampled(world([{ bite: true }])).based).toBe(true);
    });
});

describe('the registry', () => {
    it('lists the three detectors with their directions', () => {
        expect(namesOf('js/evo/scene-eat.js')).toEqual([
            'eval.fat_speed_ratio',
            'eval.food_contact_bite_share',
            'eval.full_contact_bite_share',
        ]);
        expect(directionOf('eval.food_contact_bite_share')).toBe('watch');
        expect(directionOf('eval.full_contact_bite_share')).toBe('lower');
        expect(directionOf('eval.fat_speed_ratio')).toBe('watch');
        expect(intendedOf('eval.fat_speed_ratio')).toBe('lower');
    });
});
