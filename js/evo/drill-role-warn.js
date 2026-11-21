// The `warn-herd` drill (docs/designs/training-loop.md, T34; docs/designs/role-budget.md, Phase 3): the scene of `playWarning`
// with a genome in the scout's seat, after a quiet start. For `QUIET_TICKS` the hunter is parked far away and the scout watches
// an empty field; then the hunter appears at the scene's start and creeps up on a grazing forager (the herd the scout watches
// over). The scout must see it and call alarm, and the forager, once it hears, turns and runs. The hunter creeps until the
// forager first moves and then sprints, as the row's timeline has it, so a late or missing warning leaves it closer. The rule:
// the trial is won when the scout raised no alarm while the field was empty (a scout that holds `ALARM` loses here, and one
// that never calls loses below) and the warned forager is alive at the end of the follow-up and heard the alarm. The bar is the budget row `scout:predator`: at the defaults it
// is `tight` (3 ticks of slack in `turn` and `run`), so a perfect scout wins every trial and a scout later than the slack loses.
// "Herd" is the one forager of the row: the scout of the row warns a forager, not a group.

import { OUTPUT_COUNT } from '../sim/brain-layout.js';
import { detCos, detSin } from '../sim/det-math.js';
import { nextFloat } from '../sim/rng.js';
import { SPEC } from '../sim/specs.js';
import { callerBrain, fleerBrain, pursuerBrain } from './chase-oracles.js';
import { ROLE, ROLE_ARENA, ROLE_CONFIG, SLOT, paramsOf, perWorld, turned } from './drill-role-staging.js';
import { heading } from './memory-probe-scenarios.js';
import { MODEL_DEFAULTS } from './role-budget-model.js';
import { viewReach } from './role-budget-senses.js';

/** The row the drill's bar is read from. */
export const WARN_ROW = 'scout:predator';
/** The ticks the forager is followed after it starts to run: the largest gap a hunter closes is read over 250. */
export const CHASE_TICKS = 250;
/** How far behind the forager the hunter is parked while the field is empty: well past any view or hearing range. */
export const PARKED_GAP = 3000;
/** The ticks the field is empty: a scout that holds `ALARM` raises it on the first tick, so any alarm in them is a false one. */
export const QUIET_TICKS = 40;

/**
 * The hunter of the scene: parked and still until `QUIET_TICKS`, when it appears at the scene's start already creeping at its
 * cruise speed; from then on it creeps at the forager, holding its sprint, until the forager first moves, and then pursues as the
 * pursuer does.
 * @param {ReturnType<typeof fleerBrain>} herd the forager's brain, whose `state` says when it moves
 * @param {{cruise: number, angle: number}} start the hunter's cruise speed and heading
 * @returns {(world: Record<string, any>) => void} the hunter's brain
 */
function stalking(herd, start) {
    const creep = pursuerBrain({ pursuer: SLOT.HUNTER, evader: SLOT.OTHER, sprint: false });
    const chase = pursuerBrain({ pursuer: SLOT.HUNTER, evader: SLOT.OTHER, sprint: true });
    const from = turned(start.angle, { x: 0, y: 0 });
    return (world) => {
        if (world.tick < QUIET_TICKS) {
            world.outputs.fill(0, SLOT.HUNTER * OUTPUT_COUNT, (SLOT.HUNTER + 1) * OUTPUT_COUNT);
            return;
        }
        if (world.tick === QUIET_TICKS) {
            world.x[SLOT.HUNTER] = from.x;
            world.y[SLOT.HUNTER] = from.y;
            world.vx[SLOT.HUNTER] = start.cruise * detCos(start.angle);
            world.vy[SLOT.HUNTER] = start.cruise * detSin(start.angle);
        }
        const go = herd.state.startTick >= 0 && world.tick >= herd.state.startTick;
        (go ? chase : creep)(world);
    };
}

/**
 * One trial of the drill: the scene of `playWarning` turned to `angle`, the scout on the side `side` (1 or -1) of the forager,
 * after `QUIET_TICKS` of an empty field. Won when the scout raised no alarm in those, and the warned forager is alive at the end
 * of the follow-up and heard the alarm: so a scout that holds `ALARM` loses (a false alarm) and one that never calls loses.
 * @param {Readonly<Record<string, any>>} config the validated config the trial runs under
 * @param {{angle: number, side: 1 | -1}} at the heading of the scene and the side the scout stands on
 * @returns {import('./memory-probe-run.js').Plan} the trial
 */
export function warnPlan(config, { angle, side }) {
    const [hunter, scout] = paramsOf(config, 'predator', 'scout');
    const { reactionTicks: reaction, hearThreshold: threshold, defenderGap } = MODEL_DEFAULTS;
    const gapSee = viewReach(scout, 0) + hunter.size;
    const along = Math.sqrt(gapSee * gapSee - defenderGap * defenderGap);
    const herd = fleerBrain({ forager: SLOT.OTHER, hunter: SLOT.HUNTER, reaction, threshold });
    const seen = { alarm: false, falseAlarm: false };
    const agents = [
        { role: ROLE.HUNTER, ...turned(angle, { x: -PARKED_GAP, y: 0 }), angle, spec: SPEC.PREDATOR },
        { role: ROLE.OTHER, ...turned(angle, { x: gapSee, y: 0 }), angle: angle + Math.PI / 2, spec: SPEC.FORAGER },
        {
            role: 'subject',
            ...turned(angle, { x: along, y: side * defenderGap }),
            angle: angle + Math.PI,
            spec: SPEC.SCOUT,
        },
    ];
    return {
        stage: { foods: [], rocks: [], agents: /** @type {any} */ (agents) },
        timing: null,
        scent: false,
        maxTicks: QUIET_TICKS + CHASE_TICKS * 2,
        controllers: {
            [ROLE.HUNTER]: stalking(herd, { cruise: hunter.cap.cruise, angle }),
            [ROLE.OTHER]: herd,
        },
        trace: (won) => ({
            heardTick: herd.state.heardTick,
            startTick: herd.state.startTick,
            reason: won ? null : lostReason(seen),
        }),
        done: (world) => {
            seen.alarm ||= herd.state.heardTick >= 0;
            seen.falseAlarm ||= world.tick <= QUIET_TICKS && world.alarmTimer[SLOT.SUBJECT] > 0;
            const ran = herd.state.startTick >= 0 && world.tick > herd.state.startTick + CHASE_TICKS;
            return seen.falseAlarm || world.alive[SLOT.OTHER] === 0 || world.alive[SLOT.HUNTER] === 0 || ran;
        },
        won: (world) => !seen.falseAlarm && world.alive[SLOT.OTHER] === 1 && herd.state.heardTick >= 0,
    };
}

/**
 * @param {{alarm: boolean, falseAlarm: boolean}} seen whether the forager heard an alarm and whether the scout raised one while
 *   the field was empty
 * @returns {string} why the scout lost: it called with no hunter there, the hunter caught the forager it warned, or it never called
 */
export function lostReason({ alarm, falseAlarm }) {
    if (falseAlarm) {
        return 'false-alarm';
    }
    return alarm ? 'caught' : 'no-warning';
}

/**
 * @returns {import('./memory-probe-run.js').Subject} the scripted scout: it stands until the hunter is within the reach of its
 *   own view, then calls alarm the model's reaction ticks later (`callerBrain`), as the row's timeline has it
 */
export function scoutReference() {
    const act = perWorld((world) => {
        const [hunter, scout] = paramsOf(world.config, 'predator', 'scout');
        return callerBrain({
            caller: SLOT.SUBJECT,
            hunter: SLOT.HUNTER,
            // one px over, since the scout's distance is a square root and sees the hunter on the first tick
            seeGap: viewReach(scout, 0) + hunter.size + 1,
            reaction: MODEL_DEFAULTS.reactionTicks,
        });
    });
    return { name: 'scout-oracle', id: 0, spec: SPEC.SCOUT, weights: null, act };
}

/** @type {import('./drill-staging.js').RoleDrill} */
export const WARN_HERD = {
    name: 'warn-herd',
    scene: "Call, or don't",
    spec: SPEC.SCOUT,
    needsHunter: false,
    arena: ROLE_ARENA,
    row: WARN_ROW,
    reference: scoutReference,
    plan: (rng, _view, config = ROLE_CONFIG) =>
        warnPlan(config, { angle: heading(rng), side: nextFloat(rng) < 0.5 ? -1 : 1 }),
};
