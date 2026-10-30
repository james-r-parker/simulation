// The step phases in their parts, for the `<phase>-parts.bench.js` suites (`npm run bench:parts -- --area <phase>`).
// Each part is one call the phase body in `js/sim/step.js` makes, timed alone on the 500-agent micro world, beside the
// whole phase. The phases change the world, and each bench file runs in its own worker, so a suite steps its own copy
// of the fixture world forward; the cost per call is what is compared, not the state it ends in. The brain phase has
// its own suite (`brain-parts.bench.js`), which times the private parts of `forwardAll` as differences.
import { signalAll } from '../../js/sim/calls.js';
import { cloneWithNoisePolicy } from '../../js/sim/birth-policy.js';
import { applyCosts } from '../../js/sim/energy.js';
import { decayFertileZones, updateSeason } from '../../js/sim/environment.js';
import { advanceEra } from '../../js/sim/eras.js';
import { feed } from '../../js/sim/feeding.js';
import { ageFood, spawnFood } from '../../js/sim/food.js';
import { regrowPatches } from '../../js/sim/food-patches.js';
import { assertInvariants } from '../../js/sim/invariants.js';
import { meritPhase } from '../../js/sim/merit-phase.js';
import { tallyReady } from '../../js/sim/merit-tally.js';
import { updatePheromones } from '../../js/sim/pheromones.js';
import { actAll, integrate, resolveContacts } from '../../js/sim/physics.js';
import { fillFloor, reap } from '../../js/sim/population.js';
import { advancePregnancies, mate, splitAll } from '../../js/sim/reproduction.js';
import { senseAll } from '../../js/sim/sensors.js';
import { ageSmoke } from '../../js/sim/smoke.js';
import { buildHash } from '../../js/sim/spatial-hash.js';
import { STEP_PHASES } from '../../js/sim/step.js';
import { microSuite, microWorld } from './fixture.js';

/** @typedef {(world: Record<string, any>, policy: any) => void} Part */

/** Each phase's parts, in the order its body calls them. The brain phase is timed by `brain-parts.bench.js`. */
export const PHASE_PARTS = Object.freeze({
    environment: { updateSeason, advanceEra },
    hash: { buildHash: (/** @type {any} */ w) => buildHash(w.hash, w) },
    sense: { senseAll: (/** @type {any} */ w) => senseAll(w, w.hash) },
    signal: { signalAll: (/** @type {any} */ w) => signalAll(w, w.hash) },
    physics: {
        actAll,
        integrate,
        buildHash: (/** @type {any} */ w) => buildHash(w.hash, w),
        resolveContacts: (/** @type {any} */ w) => resolveContacts(w, w.hash),
    },
    lifecycle: {
        feed: (/** @type {any} */ w) => feed(w, w.hash),
        mate,
        applyCosts,
        advancePregnancies,
        tallyReady,
        splitAll,
        reap,
        fillFloor,
    },
    field: { regrowPatches, spawnFood, ageFood, decayFertileZones, updatePheromones, ageSmoke },
    merit: { meritPhase },
    invariants: { assertInvariants },
});

/**
 * Registers the suite of one step phase: the whole phase, then each of its parts.
 * @param {string} name a `STEP_PHASES` name with an entry in `PHASE_PARTS`
 * @returns {void}
 */
export function phaseSuite(name) {
    const phase = STEP_PHASES.find((p) => p.name === name);
    const parts = /** @type {Record<string, Part>} */ (/** @type {any} */ (PHASE_PARTS)[name]);
    if (phase === undefined || parts === undefined) {
        throw new Error(`phaseSuite: no step phase "${name}" with parts`);
    }
    const world = microWorld();
    const policy = cloneWithNoisePolicy();
    const run = name === 'invariants' ? () => assertInvariants(/** @type {any} */ (world)) : phase.run;
    microSuite(`${name}-parts`, [
        [`${name} phase, 500 agents`, () => run(/** @type {any} */ (world), policy)],
        ...Object.entries(parts).map(
            ([part, fn]) => /** @type {[string, () => unknown]} */ ([part, () => fn(world, policy)]),
        ),
    ]);
}
