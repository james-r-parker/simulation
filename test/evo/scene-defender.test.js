import { describe, expect, it } from 'vitest';
import { DEATH_CAUSE } from '../../js/sim/events.js';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { ESCAPE_TICKS } from '../../js/sim/merit-state.js';
import { BURN_IN_TICKS } from '../../js/evo/burn-in.js';
import { createDefenderScene, defenderMetrics, noteDefenderDeath, tickDefender } from '../../js/evo/scene-defender.js';
import { directionOf, namesOf } from './helpers/metric-registry.js';

/** The slots of the fixture: a hunter, a victim and a defender, all touching each other and facing along +x. */
const [HUNTER, VICTIM, DEFENDER] = [0, 1, 2];
const BREAK = 'eval.defender_bite_break_share';

/**
 * @param {Record<string, any>} [config] config overrides
 * @returns {Record<string, any>} a world fixture: the defender holds `BITE` with the hunter in its jaws
 */
function makeWorld(config = {}) {
    const n = 4;
    const world = {
        tick: BURN_IN_TICKS,
        config: { defenderRepelEnergy: 40, defenderRepelImpulse: 4, biteArc: Math.PI, ...config },
        alive: Uint8Array.of(1, 1, 1, 0),
        spec: Uint8Array.of(1, 0, 4, 0),
        huntBySpec: Uint8Array.of(0, 1, 0, 0, 0),
        genomeId: Uint32Array.of(10, 11, 12, 0),
        lastBiter: new Uint32Array(n),
        bittenTimer: new Uint8Array(n).fill(255),
        outputs: new Float32Array(n * OUTPUT_COUNT),
        contacts: Uint32Array.of(DEFENDER, HUNTER),
        contactCount: 1,
    };
    world.outputs[DEFENDER * OUTPUT_COUNT + OUTPUT_INDEX.BITE] = 1;
    return world;
}

/**
 * @param {Record<string, any>} world the fixture
 * @param {Record<string, any>} scene the scene
 * @param {{bite?: boolean, tick?: number}} [at] whether the hunter bit the victim this tick, and the tick
 * @returns {void}
 */
function tick(world, scene, { bite = false, tick: at = world.tick + 1 } = {}) {
    world.tick = at;
    world.bittenTimer[VICTIM] = bite ? 1 : 255;
    if (bite) {
        world.lastBiter[VICTIM] = world.genomeId[HUNTER];
    }
    tickDefender(scene, world);
}

describe('scene-defender: the shove count', () => {
    it('counts a contact in which the defender holds BITE with a hunter in its jaws, and nothing before burn-in', () => {
        const world = makeWorld();
        const scene = createDefenderScene({ maxAgents: 4 });
        world.tick = BURN_IN_TICKS - 1;
        tickDefender(scene, world);
        expect(scene.shoves).toBe(0);
        tick(world, scene);
        tick(world, scene);
        expect(scene.shoves).toBe(2);
    });

    it('counts none with the shove off, with BITE not held, or against a body that cannot hunt', () => {
        const off = makeWorld({ defenderRepelEnergy: 0, defenderRepelImpulse: 0 });
        const idle = makeWorld();
        idle.outputs[DEFENDER * OUTPUT_COUNT + OUTPUT_INDEX.BITE] = 0;
        const prey = makeWorld();
        prey.contacts[1] = VICTIM;
        for (const world of [off, idle, prey]) {
            const scene = createDefenderScene({ maxAgents: 4 });
            tick(world, scene);
            expect(scene.shoves).toBe(0);
        }
    });

    it('counts a shove from either side of the contact pair', () => {
        const world = makeWorld();
        world.contacts.set([HUNTER, DEFENDER]);
        const scene = createDefenderScene({ maxAgents: 4 });
        tick(world, scene);
        expect(scene.shoves).toBe(1);
    });
});

describe('scene-defender: the bite-break share', () => {
    it('is null with no resolved episode', () => {
        const scene = createDefenderScene({ maxAgents: 4 });
        expect(defenderMetrics(scene)[BREAK]).toEqual({
            value: null,
            reason: 'no bite episode resolved after burn-in',
        });
    });

    it('counts an episode that escaped after a shove on its biter, and not one that escaped without', () => {
        const world = makeWorld();
        const scene = createDefenderScene({ maxAgents: 4 });
        tick(world, scene, { bite: true });
        tick(world, scene);
        tick(world, scene, { tick: world.tick + ESCAPE_TICKS });
        expect(defenderMetrics(scene)[BREAK]?.value).toBe(1);
        const quiet = makeWorld({ defenderRepelEnergy: 0, defenderRepelImpulse: 0 });
        const calm = createDefenderScene({ maxAgents: 4 });
        tick(quiet, calm, { bite: true });
        tick(quiet, calm, { tick: quiet.tick + ESCAPE_TICKS });
        expect(defenderMetrics(calm)[BREAK]?.value).toBe(0);
    });

    it('does not count a shove that landed before the episode opened', () => {
        const world = makeWorld();
        const scene = createDefenderScene({ maxAgents: 4 });
        tick(world, scene);
        tick(world, scene, { bite: true });
        world.contactCount = 0;
        tick(world, scene, { tick: world.tick + ESCAPE_TICKS });
        expect(defenderMetrics(scene)[BREAK]?.value).toBe(0);
    });

    it('counts a victim that died as a resolved episode that was not broken', () => {
        const world = makeWorld();
        const scene = createDefenderScene({ maxAgents: 4 });
        tick(world, scene, { bite: true });
        noteDefenderDeath(scene, { tick: world.tick, slot: VICTIM, cause: DEATH_CAUSE.EATEN });
        expect(defenderMetrics(scene)[BREAK]?.value).toBe(0);
        const again = makeWorld();
        tick(again, scene, { bite: true });
        tick(again, scene, { tick: again.tick + ESCAPE_TICKS });
        expect(defenderMetrics(scene)[BREAK]?.value).toBe(0.5);
    });
});

describe('scene-defender: the registry', () => {
    it('registers the metric with its direction', () => {
        expect(namesOf('js/evo/scene-defender.js')).toEqual([BREAK]);
        expect(directionOf(BREAK)).toBe('higher');
    });
});
