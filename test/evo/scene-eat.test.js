// The eat-choice detectors (eat-choice.md, T1): the two bite shares and the fat speed ratio, against hand-built worlds.

import { describe, expect, it } from 'vitest';
import { FOOD_KIND } from '../../js/sim/carcass.js';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { BURN_IN_TICKS } from '../../js/evo/burn-in.js';
import { FULL_SHARE, createEatScene, eatMetrics, sampleEat } from '../../js/evo/scene-eat.js';
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
    const agents = [
        { fraction: 0.5, bite: true }, // contact, bites
        { fraction: 0.85, bite: false }, // contact, full, does not bite
        { fraction: 0.9, bite: true }, // contact, full, bites
        { fraction: 0.97, bite: true }, // satiated: canEatNow is false, so not counted
        { fraction: FULL_SHARE, bite: true }, // the band's lower edge is in
        { fraction: 0.79, bite: true }, // just under the band: contact only
        { bite: true, gap: SIZE + RADIUS }, // touching exactly is not contact
        { bite: true, foodAlive: false }, // the food is gone
        { spec: PREDATOR, bite: true }, // a hunter is never looked at
        { spec: SCOUT, bite: true, kind: FOOD_KIND.PLANT }, // plant is not its food
        { spec: SCOUT, bite: false, kind: FOOD_KIND.MEAT }, // meat is: contact, does not bite
        { bite: true, alive: false }, // dead
        { bite: true, dose: 5 }, // sick
        { bite: true, ateTimer: 3 }, // still digesting
    ];
    const scene = sampled(world(agents));

    it('counts the non-hunters in contact with edible food they can eat now, and those that hold BITE', () => {
        expect(scene.contact).toBe(6);
        expect(scene.contactBite).toBe(4);
        expect(read(scene, 'eval.food_contact_bite_share')).toBeCloseTo(4 / 6, 12);
    });

    it('counts the band from 0.8 up to the satiation share', () => {
        expect(scene.full).toBe(3);
        expect(scene.fullBite).toBe(2);
        expect(read(scene, 'eval.full_contact_bite_share')).toBeCloseTo(2 / 3, 12);
    });

    it('runs the band to a full store when satiation is off', () => {
        const off = sampled(world([{ fraction: 1, bite: true }], { satiationShare: 0 }));
        expect(read(off, 'eval.full_contact_bite_share')).toBe(1);
    });

    it('pools the checkpoints', () => {
        const w = world([{ bite: true }]);
        const scene2 = createEatScene(w.config);
        sampleEat(scene2, w);
        w.outputs[OUTPUT_INDEX.BITE] = 0;
        w.tick = T + 100;
        sampleEat(scene2, w);
        expect(read(scene2, 'eval.food_contact_bite_share')).toBe(0.5);
    });

    it('is null with a reason when no non-hunter touches food, or none touches it with a nearly full store', () => {
        const none = sampled(world([{ gap: 50 }]));
        expect(eatMetrics(none)['eval.food_contact_bite_share']?.value).toBeNull();
        expect(eatMetrics(none)['eval.full_contact_bite_share']?.value).toBeNull();
        const lean = sampled(world([{ fraction: 0.2 }]));
        expect(read(lean, 'eval.food_contact_bite_share')).toBe(0);
        expect(eatMetrics(lean)['eval.full_contact_bite_share']?.value).toBeNull();
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
            expect(sampled(w).contact).toBe(0);
        }
        expect(sampled(world([{ bite: true }])).contact).toBe(1);
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
