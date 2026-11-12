// The graze detectors (eat-choice.md, Phase 5, T21): the time share and the speed ratio, against hand-built worlds.

import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { createGrazeScene, grazeMetrics, tallyGraze } from '../../js/evo/scene-graze.js';
import { directionOf, intendedOf, namesOf } from './helpers/metric-registry.js';

const CONFIG = { specialisations: { forager: { index: 0 }, scout: { index: 1 } } };

/**
 * @param {{spec: number, bite: boolean, speed: number}[]} agents the agents
 * @returns {Record<string, any>} a hand-built world of non-hunters
 */
function world(agents) {
    const n = agents.length;
    const w = {
        spec: new Uint8Array(n),
        vx: new Float32Array(n),
        vy: new Float32Array(n),
        outputs: new Float32Array(n * OUTPUT_COUNT),
    };
    agents.forEach((a, i) => {
        w.spec[i] = a.spec;
        w.vx[i] = a.speed;
        w.outputs[i * OUTPUT_COUNT + OUTPUT_INDEX.BITE] = a.bite ? 0.5 : -0.5;
    });
    return w;
}

/** @param {Record<string, any>[]} worlds samples in turn @returns {Record<string, any>} the scene after tallying each agent of each */
function tallied(...worlds) {
    const scene = createGrazeScene(CONFIG);
    for (const w of worlds) {
        for (let slot = 0; slot < w.spec.length; slot++) {
            tallyGraze(scene, w, slot);
        }
    }
    return scene;
}

/** @param {Record<string, any>} scene @param {string} name @returns {number | null} the metric's value */
const read = (scene, name) => /** @type {any} */ (grazeMetrics(scene))[name].value;

describe('the graze time share', () => {
    it('is the share of non-hunter samples holding BITE, standing ones included', () => {
        const scene = tallied(
            world([
                { spec: 0, bite: true, speed: 0 },
                { spec: 0, bite: true, speed: 2 },
                { spec: 1, bite: false, speed: 2 },
                { spec: 1, bite: false, speed: 0 },
            ]),
        );
        expect(read(scene, 'eval.graze_time_share')).toBe(0.5);
    });

    it('is null with a reason before any sample', () => {
        const metric = grazeMetrics(createGrazeScene(CONFIG))['eval.graze_time_share'];
        expect(metric?.value).toBeNull();
        expect(metric?.reason).toBe('no non-hunter at a sample after burn-in');
    });
});

describe('the graze speed ratio', () => {
    const agents = [
        // forager: holding at 1 and 3 (mean 2), not holding at 4 (mean 4): 0.5
        { spec: 0, bite: true, speed: 1 },
        { spec: 0, bite: true, speed: 3 },
        { spec: 0, bite: false, speed: 4 },
        { spec: 0, bite: true, speed: 0 }, // standing: in neither mean
        // scout: holding at 3, not holding at 2: 1.5
        { spec: 1, bite: true, speed: 3 },
        { spec: 1, bite: false, speed: 2 },
    ];

    it('is the mean over the specialisations of the speed holding BITE over the speed not holding it', () => {
        expect(read(tallied(world(agents)), 'eval.graze_speed_ratio')).toBeCloseTo((0.5 + 1.5) / 2, 12);
    });

    it('pools the speeds over the samples before it takes the ratio', () => {
        const second = world([
            { spec: 0, bite: true, speed: 5 }, // forager holding: (1 + 3 + 5) / 3 = 3 over not holding (4 + 2) / 2 = 3
            { spec: 0, bite: false, speed: 2 },
        ]);
        expect(read(tallied(world(agents), second), 'eval.graze_speed_ratio')).toBeCloseTo((1 + 1.5) / 2, 12);
    });

    it('skips a specialisation that has moving agents on one side only', () => {
        expect(read(tallied(world(agents.slice(0, 4))), 'eval.graze_speed_ratio')).toBeCloseTo(0.5, 12);
    });

    it('is null with a reason when no specialisation has both sides', () => {
        const metric = grazeMetrics(tallied(world([{ spec: 0, bite: true, speed: 1 }])))['eval.graze_speed_ratio'];
        expect(metric?.value).toBeNull();
        expect(metric?.reason).toBe('no specialisation with moving non-hunters holding BITE and not holding it');
    });
});

describe('the registry', () => {
    it('lists the two graze detectors with their directions', () => {
        expect(namesOf('js/evo/scene-graze.js')).toEqual(['eval.graze_speed_ratio', 'eval.graze_time_share']);
        expect(directionOf('eval.graze_time_share')).toBe('watch');
        expect(directionOf('eval.graze_speed_ratio')).toBe('watch');
        expect(intendedOf('eval.graze_speed_ratio')).toBe('lower');
    });
});
