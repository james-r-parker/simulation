// The planted alarm scene (docs/designs/metric-noise.md, Phase 6, T21): a hunter that stands, a scout that calls, a forager
// beside the scout that may run once it hears, and a forager out of earshot, played under the eval observer by `playObserved`.
// The scout's own view is the oracle: `callerBrain` calls `reaction` ticks after the hunter is within its reach, the rule of
// the warning scene of `role-scenes-warn.js`.

import { arenaConfig, stageArena, ARENA_CENTRE } from '../../../js/evo/chase-arena.js';
import { callerBrain, fleerBrain } from '../../../js/evo/chase-oracles.js';
import { ALARM_RESPONSE_TICKS } from '../../../js/evo/observer-combat.js';
import { roleParams } from '../../../js/evo/role-budget-params.js';
import { viewReach } from '../../../js/evo/role-budget-senses.js';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../../js/sim/brain-layout.js';
import { playObserved } from './role-scene.js';

/** The slots of an alarm scene: the hunter, the scout, the forager that hears it and the forager out of earshot. */
const [HUNTER, SCOUT, HEARER, CONTROL] = [0, 1, 2, 3];
/** The hearer stands this far from the scout, across the line to the hunter. */
const BESIDE = 100;
/** A hunter this far from the scout is out of its view. */
const FAR = 3000;

/**
 * @typedef {object} AlarmScene one staged alarm
 * @property {number} gap the hunter's distance from the scout at the start (far past its view: 3000)
 * @property {number} [appearAt] the tick the hunter is moved to 80% of the scout's reach, where its rays see it (it stands
 *   `FAR` off until then)
 * @property {'sees' | 'always' | 'never'} call the scout calls once it sees the hunter (`callerBrain`), calls at every chance
 *   whatever it sees, or never calls
 * @property {boolean} [flees] whether the forager beside the scout runs from the hunter once it hears (true), else it grazes
 * @property {number} ticks the ticks played after burn-in
 * @property {boolean} [untilScored] stop `ALARM_RESPONSE_TICKS` after the first call, so exactly one call is scored
 */

/**
 * @typedef {object} AlarmRun what a played alarm scene says
 * @property {Record<string, any>} metrics `computeMetrics` of the observer
 * @property {number} firstCall the tick (counted from 1 after burn-in) of the first alarm, or -1
 * @property {number[]} hearer the speed of the forager beside the scout after every tick
 * @property {number[]} control the speed of the forager out of earshot after every tick
 * @property {number} sightTicks the ticks the hunter was within 80% of the scout's reach (`appearAt`: where it appears)
 * @property {number} ticks the ticks played
 */

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot a slot
 * @returns {void}
 */
const stand = (world, slot) => world.outputs.fill(0, slot * OUTPUT_COUNT, (slot + 1) * OUTPUT_COUNT);

/**
 * @param {Readonly<Record<string, any>>} config an `arenaConfig`
 * @param {number} gap the hunter's start distance from the scout
 * @param {number} near the distance from the hunter at which the hearer's line to the scout starts: the control stands as far
 *   from the hunter as the hearer, so they share a distance band
 * @returns {ReturnType<typeof stageArena>} the arena: the control stands as far from the hunter as the hearer
 */
function stageAlarm(config, gap, near) {
    const specs = /** @type {Record<string, any>} */ (config.specialisations);
    const { x, y } = ARENA_CENTRE;
    const away = Math.sqrt(near ** 2 + BESIDE ** 2);
    return stageArena(config, [
        { spec: specs.predator.index, x, y, angle: 0 },
        { spec: specs.scout.index, x: x + gap, y, angle: Math.PI },
        { spec: specs.forager.index, x: x + gap, y: y + BESIDE, angle: 0 },
        { spec: specs.forager.index, x: x - away, y, angle: 0 },
    ]);
}

/**
 * Plays an alarm scene.
 * @param {AlarmScene} scene the scene
 * @returns {AlarmRun} the readings and the planted truth
 */
export function playAlarmScene({ gap, appearAt = -1, call, flees = true, ticks, untilScored = false }) {
    const config = arenaConfig({ seed: 1 });
    const [hunterP, scoutP] = ['predator', 'scout'].map((s) => roleParams(config, s));
    const reach = viewReach(scoutP, 0) + hunterP.size;
    const close = 0.8 * reach;
    const staged = stageAlarm(config, appearAt >= 0 ? FAR : gap, appearAt >= 0 ? close : gap);
    const see = callerBrain({ caller: SCOUT, hunter: HUNTER, seeGap: reach + 1, reaction: 2 });
    const flee = fleerBrain({ forager: HEARER, hunter: HUNTER, reaction: 0, threshold: 0.1 });
    const truth = {
        firstCall: -1,
        sightTicks: 0,
        hearer: /** @type {number[]} */ ([]),
        control: /** @type {number[]} */ ([]),
    };
    const speed = (/** @type {Record<string, any>} */ w, /** @type {number} */ s) => Math.hypot(w.vx[s], w.vy[s]);
    const brain = (/** @type {Record<string, any>} */ w) => {
        stand(w, HUNTER);
        stand(w, CONTROL);
        stand(w, SCOUT);
        if (call === 'always') {
            w.outputs[SCOUT * OUTPUT_COUNT + OUTPUT_INDEX.ALARM] = 1;
        } else if (call === 'sees') {
            see(w);
        }
        if (flees) {
            flee(w);
        } else {
            stand(w, HEARER);
        }
    };
    const played = playObserved(staged, {
        config,
        ticks,
        brains: [brain],
        before(w, t) {
            if (t === appearAt) {
                w.x[HUNTER] = w.x[SCOUT] - close;
            }
        },
        after(w, t) {
            truth.firstCall = truth.firstCall < 0 && w.alarmTimer[SCOUT] > 0 ? t : truth.firstCall;
            truth.sightTicks += Math.hypot(w.x[SCOUT] - w.x[HUNTER], w.y[SCOUT] - w.y[HUNTER]) <= close ? 1 : 0;
            truth.hearer.push(speed(w, HEARER));
            truth.control.push(speed(w, CONTROL));
            return untilScored && truth.firstCall > 0 && t >= truth.firstCall + ALARM_RESPONSE_TICKS;
        },
    });
    return { metrics: played.metrics, ticks: played.ticks, ...truth };
}
