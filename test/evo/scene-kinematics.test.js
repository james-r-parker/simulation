import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { BURN_IN_TICKS } from '../../js/evo/burn-in.js';
import { CHASE_OUTCOME } from '../../js/evo/scene-competence.js';
import {
    createKinematicsScene,
    kinematicsMetrics,
    noteKinematicsChase,
    tickKinematics,
} from '../../js/evo/scene-kinematics.js';
import { directionOf, namesOf } from './helpers/metric-registry.js';

const KINEMATICS_NAMES = ['eval.chase_overshoot_share', 'eval.chase_cover_use_share', 'eval.chase_turn_jitter'];

/**
 * @param {number} n
 * @returns {Record<string, any>}
 */
function makeWorld(n = 4) {
    return {
        tick: BURN_IN_TICKS,
        alive: new Uint8Array(n),
        genomeId: new Uint32Array(n),
        x: new Float64Array(n),
        y: new Float64Array(n),
        outputs: new Float64Array(n * OUTPUT_COUNT),
        config: {
            worldWidth: 1000,
            worldHeight: 1000,
            refugeCount: 1,
            refugeCluster: 1,
            refugeSizeMax: 30,
        },
        refuges: [{ x: 300, y: 100, radius: 40 }],
    };
}

describe('scene-kinematics', () => {
    it('registers every emitted chase-kinematics metric with its expected direction', () => {
        const scene = createKinematicsScene({ maxAgents: 4 });
        const emitted = Object.keys(kinematicsMetrics(scene));
        expect(emitted).toEqual(KINEMATICS_NAMES);
        expect(namesOf('js/evo/scene-kinematics.js')).toEqual([...KINEMATICS_NAMES].sort());
        expect(directionOf('eval.chase_overshoot_share')).toBe('watch');
        expect(directionOf('eval.chase_cover_use_share')).toBe('watch');
        expect(directionOf('eval.chase_turn_jitter')).toBe('lower');
    });

    it('tracks overshoot, cover use on evaded chases, and turn sign reversals after burn-in', () => {
        const scene = createKinematicsScene({ maxAgents: 4 });
        const approach = { phase: new Uint8Array([1, 0, 0, 0]), victim: new Uint32Array([2, 0, 0, 0]) };
        const terrain = { centres: new Float64Array([300, 100]) };
        const observer = {
            slotOf: new Map([
                [1, 0],
                [2, 1],
            ]),
            scenes: { approach, terrain },
        };
        const w = makeWorld(4);
        w.alive[0] = 1;
        w.genomeId[0] = 1;
        w.x[0] = 0;
        w.y[0] = 100;
        w.alive[1] = 1;
        w.genomeId[1] = 2;
        w.x[1] = 100;
        w.y[1] = 100;

        // Tick 0: close to 100px, positive turn
        w.outputs[OUTPUT_INDEX.TURN] = 0.5;
        tickKinematics(scene, observer, w);

        // Tick 1: close to 20px, negative turn (1st reversal)
        w.tick += 1;
        w.x[0] = 80;
        w.outputs[OUTPUT_INDEX.TURN] = -0.5;
        tickKinematics(scene, observer, w);

        // Tick 2: range re-opens to 220px inside refuge ring (300, 100), positive turn (2nd reversal)
        w.tick += 1;
        w.x[1] = 300;
        w.outputs[OUTPUT_INDEX.TURN] = 0.5;
        tickKinematics(scene, observer, w);

        noteKinematicsChase(scene, w, { slot: 0, outcome: CHASE_OUTCOME.ESCAPED });

        const m = kinematicsMetrics(scene);
        expect(m['eval.chase_overshoot_share']?.value).toBe(1);
        expect(m['eval.chase_cover_use_share']?.value).toBe(1);
        expect(m['eval.chase_turn_jitter']?.value).toBe(1);
    });
});
