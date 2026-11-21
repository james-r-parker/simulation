// A planted role scene (docs/designs/metric-noise.md, Phase 6): a staged arena of scripted bodies (`stageArena`, the one
// stager of the role scenes) played through the sim's own step with the eval observer watching, started after burn-in so
// every settled metric counts. A scene says what happens (the catch tick, the hunter-ticks); the test reads the metrics.

import { arenaConfig, stageArena, ARENA_CENTRE } from '../../../js/evo/chase-arena.js';
import { evaderBrain, pursuerBrain } from '../../../js/evo/chase-oracles.js';
import { computeMetrics } from '../../../js/evo/metrics.js';
import { createObserver, observe, observerPhases } from '../../../js/evo/observer.js';
import { BURN_IN_TICKS } from '../../../js/sim/burn-in.js';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../../js/sim/brain-layout.js';
import { createRng, fork } from '../../../js/sim/rng.js';
import { step } from '../../../js/sim/step.js';

/** The slot of the hunter and of its prey in a chase scene. */
export const HUNTER = 0;
export const PREY = 1;

/**
 * @typedef {object} ChaseScene one staged chase
 * @property {number} gap the start distance from the hunter to the prey, on the hunter's heading
 * @property {number} ticks the ticks played after burn-in
 * @property {boolean} [bite] whether the hunter asks to bite every tick (true)
 * @property {number} [ageTicks] the hunter's age at the start (0: a juvenile)
 * @property {(world: Record<string, any>, tick: number) => void} [before] a hook run before each step
 */

/**
 * @typedef {object} SceneRun what a played scene says
 * @property {Record<string, any>} metrics `computeMetrics` of the observer
 * @property {number | null} killTick the tick (counted from 1 after burn-in) the hunter's kill landed, or `null`
 * @property {number} hunterTicks the observed ticks a hunter was alive in, the initial observation included
 * @property {number | null} hunterDeathTick the tick the hunter died, or `null`
 * @property {Record<string, any>} world the finished world
 */

/**
 * Plays a hunter chasing a standing-start forager that runs straight (the oracles of `audit:chase`).
 * @param {ChaseScene} scene the scene
 * @returns {SceneRun} the readings
 */
export function playChase({ gap, ticks, bite = true, ageTicks = 0, before }) {
    const config = arenaConfig({ seed: 1 });
    const { predator, forager } = config.specialisations;
    const { world, policy } = stageArena(config, [
        { spec: predator.index, ...ARENA_CENTRE, angle: 0 },
        { spec: forager.index, x: ARENA_CENTRE.x + gap, y: ARENA_CENTRE.y, angle: 0 },
    ]);
    world.ageTicks[HUNTER] = ageTicks;
    const observer = createObserver(config, fork(createRng(1), 'eval'), { runTicks: ticks + BURN_IN_TICKS });
    world.tick = BURN_IN_TICKS;
    observe(observer, world);
    const hunt = pursuerBrain({ pursuer: HUNTER, evader: PREY, sprint: true });
    const flee = evaderBrain({ pursuer: HUNTER, evader: PREY, sprint: true, jinkRange: 0 });
    const phases = {
        ...observerPhases(observer),
        brain(/** @type {Record<string, any>} */ w) {
            hunt(w);
            flee(w);
            if (!bite) {
                w.outputs[HUNTER * OUTPUT_COUNT + OUTPUT_INDEX.BITE] = 0;
            }
        },
    };
    /** @type {{killTick: number | null, hunterDeathTick: number | null}} */
    const seen = { killTick: null, hunterDeathTick: null };
    let hunterTicks = world.alive[HUNTER] === 1 ? 1 : 0;
    for (let t = 1; t <= ticks; t++) {
        before?.(world, t);
        step(world, policy, phases);
        observe(observer, world);
        hunterTicks += world.alive[HUNTER] === 1 ? 1 : 0;
        seen.killTick ??= world.ledgerKillEnergy[HUNTER] > 0 ? t : null;
        seen.hunterDeathTick ??= world.alive[HUNTER] === 0 ? t : null;
    }
    return { metrics: computeMetrics(observer, world, {}), hunterTicks, world, ...seen };
}
