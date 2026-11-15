import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { BURN_IN_TICKS } from '../../js/evo/burn-in.js';
import { CHASE_FLAG, CHASE_OUTCOME, createChaseTally, tallyChase } from '../../js/evo/chase-outcome.js';
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
        const emitted = Object.keys(kinematicsMetrics(scene, createChaseTally()));
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

        const chase = { slot: 0, outcome: CHASE_OUTCOME.ESCAPED, flags: 0 };
        noteKinematicsChase(scene, w, chase);
        expect(chase.flags).toBe(CHASE_FLAG.OVERSHOT | CHASE_FLAG.CROSSED_COVER);
        const tally = createChaseTally();
        tallyChase(tally, chase);

        const m = kinematicsMetrics(scene, tally);
        expect(m['eval.chase_overshoot_share']?.value).toBe(1);
        expect(m['eval.chase_cover_use_share']?.value).toBe(1);
        expect(m['eval.chase_turn_jitter']?.value).toBe(1);
    });

    /**
     * One hunter at slot 0 on an active approach to a victim at slot 1.
     * @returns {{scene: Record<string, any>, observer: Record<string, any>, w: Record<string, any>}}
     */
    function setupChase(centres = [300, 100]) {
        const scene = createKinematicsScene({ maxAgents: 4 });
        const approach = { phase: new Uint8Array([1, 0, 0, 0]), victim: new Uint32Array([2, 0, 0, 0]) };
        const observer = {
            slotOf: new Map([
                [1, 0],
                [2, 1],
            ]),
            scenes: { approach, terrain: { centres: new Float64Array(centres) } },
        };
        const w = makeWorld(4);
        w.alive.set([1, 1, 0, 0]);
        w.genomeId.set([1, 2, 0, 0]);
        w.x.set([0, 100, 0, 0]);
        w.y.set([100, 100, 0, 0]);
        return { scene, observer, w };
    }

    it('reads the turn from turnRate when the world has one, and a zero turn is no reversal', () => {
        const { scene, observer, w } = setupChase();
        w.turnRate = new Float64Array(4);
        for (const turn of [0.5, 0, -0.5]) {
            w.turnRate[0] = turn;
            tickKinematics(scene, observer, w);
        }
        noteKinematicsChase(scene, w, { slot: 0, outcome: CHASE_OUTCOME.ESCAPED, flags: 0 });
        expect(scene.totalTurnPairs).toBe(2);
        expect(scene.totalTurnReversals).toBe(1);
    });

    it('does not flag overshoot or cover on a chase that never left its range or reached a refuge', () => {
        const { scene, observer, w } = setupChase([]);
        tickKinematics(scene, observer, w);
        const chase = { slot: 0, outcome: CHASE_OUTCOME.ESCAPED, flags: 0 };
        noteKinematicsChase(scene, w, chase);
        expect(chase.flags).toBe(0);
    });

    it('does not mark cover when the victim is outside every refuge ring', () => {
        const { scene, observer, w } = setupChase([900, 900]);
        tickKinematics(scene, observer, w);
        const chase = { slot: 0, outcome: CHASE_OUTCOME.ESCAPED, flags: 0 };
        noteKinematicsChase(scene, w, chase);
        expect(chase.flags & CHASE_FLAG.CROSSED_COVER).toBe(0);
    });

    it('skips range tracking when the victim is gone', () => {
        const { scene, observer, w } = setupChase();
        w.alive[1] = 0;
        tickKinematics(scene, observer, w);
        expect(scene.minDistSq[0]).toBe(Infinity);
    });

    it('records nothing before burn-in and clears a chase that resolves then', () => {
        const { scene, observer, w } = setupChase();
        tickKinematics(scene, observer, w);
        w.tick = BURN_IN_TICKS - 1;
        tickKinematics(scene, observer, w);
        expect(scene.hasTurnSample[0]).toBe(1);
        const chase = { slot: 0, outcome: CHASE_OUTCOME.ESCAPED, flags: 0 };
        noteKinematicsChase(scene, w, chase);
        expect(chase.flags).toBe(0);
        expect(scene.hasTurnSample[0]).toBe(0);
        expect(scene.totalTurnPairs).toBe(0);
    });

    it('clears a slot whose approach ended', () => {
        const { scene, observer, w } = setupChase();
        tickKinematics(scene, observer, w);
        observer.scenes.approach.phase[0] = 0;
        tickKinematics(scene, observer, w);
        expect(scene.hasTurnSample[0]).toBe(0);
        expect(scene.minDistSq[0]).toBe(Infinity);
    });

    it('reports no value for chase metrics before any chase resolves', () => {
        const m = kinematicsMetrics(createKinematicsScene({ maxAgents: 4 }), createChaseTally());
        expect(m['eval.chase_overshoot_share']?.value).toBeNull();
        expect(m['eval.chase_cover_use_share']?.value).toBeNull();
        expect(m['eval.chase_turn_jitter']?.value).toBeNull();
    });
});
