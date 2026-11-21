// The planted defence scenes (docs/designs/metric-noise.md, Phase 6, T21): the trio of `role-scenes-defence.js` and a hunter
// that bites in view of a defender, played under the eval observer by `playObserved`.

import { arenaConfig, stageArena, ARENA_CENTRE } from '../../../js/evo/chase-arena.js';
import { callerBrain, defenderBrain, pursuerBrain } from '../../../js/evo/chase-oracles.js';
import { stageTrio } from '../../../js/evo/role-scenes-defence.js';
import { EXPOSURE_EVERY } from '../../../js/evo/scene-hunter-choice.js';
import { inJaws } from '../../../js/sim/bite-rule.js';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../../js/sim/brain-layout.js';
import { playObserved } from './role-scene.js';

/** Where the defender stands when the scene leaves it out: too far to hear the alarm. */
const ABSENT = 5000;

/**
 * @param {Record<string, any>} world the world after a step
 * @param {number} a a slot
 * @param {number} b another slot
 * @returns {boolean} whether the step's contact list holds the pair: the sim's own contact, which `feed` resolved (the
 *   scenes' `touching` allows a pixel of slack, and a pair that merely nearly touches gets no bite and no shove)
 */
function inContacts(world, a, b) {
    for (let c = 0; c < world.contactCount; c++) {
        const [p, q] = [world.contacts[2 * c], world.contacts[2 * c + 1]];
        if ((p === a && q === b) || (p === b && q === a)) {
            return true;
        }
    }
    return false;
}

/**
 * @typedef {object} DefenceScene one staged defence (the trio of `role-scenes-defence.js`: hunter, caller, defender)
 * @property {number | null} side the defender's distance from the caller; `null` leaves it out (it stands 5000 px off)
 * @property {number} [callerReaction] ticks from the caller seeing the hunter to its alarm (2)
 * @property {number} [defenderReaction] ticks from the defender hearing to its move (2)
 * @property {boolean | number} [letGo] the hunter stands still from the tick after the first shove lands on it (`true`), or after
 *   that world tick (a number, which lets a scene without a shove let go at the tick another scene's shove did); `false`: never
 * @property {number} [ticks] the ticks played after burn-in (400, past `ESCAPE_TICKS` of the last bite)
 */

/**
 * Plays the defence under the eval observer: the hunter creeps up on the standing caller from its awareness gap, the caller
 * calls alarm, the defender runs at the hunter and, with the shove on, shoves it. The shoves and bites are counted from the
 * world by the scene's own rule (the step's contact list holds the defender and the hunter, the defender holds `BITE` and has it
 * in its jaws: the condition of `tryDefenderRepel`), never by the metrics.
 * @param {Readonly<Record<string, any>>} config an `arenaConfig`
 * @param {DefenceScene} scene the scene
 * @returns {{metrics: Record<string, any>, shoveTicks: number[], kickTicks: Array<{tick: number, speed: number}>,
 *   firstShoveAt: number, defenderTicks: number, killTick: number | null}} the readings and the planted truth: the ticks (counted
 *   from 1 after burn-in) of the shoves by the contact list, the same by the sim's effect (`kickTicks`: per tick the hunter's
 *   velocity change along the defender-to-hunter line, which `defenderRepelImpulse` alone moves by that much; independent of
 *   `world.contacts`), the world tick of the first shove (-1: none), the observed ticks a defender was alive in and the tick the
 *   caller died
 */
export function playDefenceObserved(config, scene) {
    const { callerReaction = 2, defenderReaction = 2, letGo = false, ticks = 400, side } = scene;
    const { staged, gap } = stageTrio(config, ({ gap: g }) => ({ x: g, y: side ?? ABSENT, angle: -Math.PI / 2 }));
    const { world } = staged;
    const shove = config.defenderRepelEnergy > 0 || config.defenderRepelImpulse > 0;
    const chase = pursuerBrain({ pursuer: 0, evader: 1, sprint: true });
    const shoved = { at: -1 };
    const hunter = (/** @type {Record<string, any>} */ w) => {
        chase(w);
        const from = typeof letGo === 'number' ? letGo : shoved.at;
        if (letGo !== false && from >= 0 && w.tick > from) {
            w.outputs.fill(0, 0, OUTPUT_COUNT);
        }
    };
    const brains = [
        hunter,
        callerBrain({ caller: 1, hunter: 0, seeGap: gap, reaction: callerReaction }),
        defenderBrain({ defender: 2, hunter: 0, reaction: defenderReaction, threshold: 0.1 }),
    ];
    const shoveTicks = /** @type {number[]} */ ([]);
    const killed = { tick: /** @type {number | null} */ (null) };
    let defenderTicks = world.alive[2] === 1 ? 1 : 0;
    const prior = { vx: 0, vy: 0 };
    const kickTicks = /** @type {Array<{tick: number, speed: number}>} */ ([]);
    const { metrics } = playObserved(staged, {
        config,
        ticks,
        brains,
        before(w) {
            [prior.vx, prior.vy] = [w.vx[0], w.vy[0]];
        },
        after(w, t) {
            if (w.alive[0] === 1 && w.alive[2] === 1) {
                const dx = w.x[0] - w.x[2];
                const dy = w.y[0] - w.y[2];
                const d = Math.hypot(dx, dy) || 1;
                kickTicks.push({ tick: t, speed: ((w.vx[0] - prior.vx) * dx + (w.vy[0] - prior.vy) * dy) / d });
            }
            defenderTicks += w.alive[2] === 1 ? 1 : 0;
            killed.tick ??= w.alive[1] === 0 ? t : null;
            const holds = w.outputs[2 * OUTPUT_COUNT + OUTPUT_INDEX.BITE] > 0;
            if (shove && w.alive[2] === 1 && w.alive[0] === 1 && inContacts(w, 2, 0) && holds && inJaws(w, 2, 0)) {
                shoveTicks.push(t);
                shoved.at = shoved.at < 0 ? w.tick - 1 : shoved.at;
            }
        },
    });
    return { kickTicks, metrics, shoveTicks, firstShoveAt: shoved.at, defenderTicks, killTick: killed.tick };
}

/**
 * Plays a hunter that stands holding `BITE` with a forager and a defender in view: a body `ahead` is in its jaws and bitten, one
 * behind it is in view and cannot be bitten (`biteArc` is a quarter turn each side). The exposure the metric divides by is
 * counted here from the bodies' own liveness at the ticks it samples, not by the metric.
 * @param {{ahead: Array<'forager' | 'defender'>, ticks: number}} scene the bodies in the jaws (the others stand behind) and the
 *   ticks played after burn-in
 * @returns {{metrics: Record<string, any>, samples: {forager: number, defender: number}}} the readings and the sampled ticks each
 *   body was alive for
 */
export function playBiteChoice({ ahead, ticks }) {
    const config = arenaConfig({ seed: 1 });
    const specs = /** @type {Record<string, any>} */ (config.specialisations);
    const names = /** @type {const} */ (['forager', 'defender']);
    const bodies = [
        { spec: specs.predator.index, ...ARENA_CENTRE, angle: 0 },
        ...names.map((name) => ({ spec: specs[name].index, ...ARENA_CENTRE, angle: 0 })),
    ];
    const staged = stageArena(config, bodies);
    const { world } = staged;
    names.forEach((name, i) => {
        const reach = 0.8 * (world.size[0] + world.size[i + 1]);
        world.x[i + 1] = world.x[0] + (ahead.includes(name) ? reach : -reach);
        world.y[i + 1] = world.y[0] + (i === 0 ? 4 : -4);
    });
    const hunt = (/** @type {Record<string, any>} */ w) => {
        w.outputs.fill(0, 0, OUTPUT_COUNT);
        w.outputs[OUTPUT_INDEX.BITE] = 1;
    };
    const samples = { forager: 0, defender: 0 };
    const { metrics } = playObserved(staged, {
        config,
        ticks,
        brains: [hunt],
        after(w) {
            if (w.tick % EXPOSURE_EVERY === 0) {
                samples.forager += w.alive[1];
                samples.defender += w.alive[2];
            }
        },
    });
    return { metrics, samples };
}
