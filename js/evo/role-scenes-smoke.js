// The scripted smoke scenes in the real sim (docs/designs/role-budget.md, "Cross-check against the sim"): a prey that drops a
// cloud and runs sideways, and a defender that turns its back to the hunter and drops one between it and the caller. The
// hunter oracle holds its heading and speed while a cloud lies on its line to the target (the segment-disc test of the
// budget), as the budget assumes. Each reading carries the field name of the formula it checks.

import { OUTPUT_COUNT, OUTPUT_INDEX } from '../sim/brain-layout.js';
import { detCos, detSin } from '../sim/det-math.js';
import { ARENA_CENTRE, stageArena } from './chase-arena.js';
import { callerBrain, pursuerBrain, smokerBrain, steer, wrap } from './chase-oracles.js';
import { GRIP, readPreyRays } from './role-scenes-decoy.js';

import { norm } from './role-budget-kinematics.js';
import { roleParams } from './role-budget-params.js';
import { viewReachCos } from './role-budget-senses.js';
import { segmentHitsCloud } from './role-budget-smoke.js';
import { runScene, stageTrio } from './role-scenes-defence.js';
import { actingRow, walkerBrain } from './role-scenes-walk.js';

/**
 * @param {Record<string, any>} world the world
 * @param {number} from the watching slot
 * @param {number} target the slot it watches
 * @returns {boolean} whether a live cloud lies on the line between them
 */
function covered(world, from, target) {
    const a = { x: world.x[from], y: world.y[from] };
    const b = { x: world.x[target], y: world.y[target] };
    for (let i = 0; i < world.cloudCount; i++) {
        const cloud = { x: world.cloudX[i], y: world.cloudY[i], r: world.config.smokeRadius };
        if (segmentHitsCloud(a, b, cloud)) {
            return true;
        }
    }
    return false;
}

/**
 * The hunter oracle: the pursuer, except that while a cloud lies on its line to the target it is blind and holds its heading
 * at full sprint with its mouth open.
 * @param {{hunter: number, target: number}} slots the hunter and the body it chases
 * @returns {(world: Record<string, any>) => void} a `brain` phase body
 */
function blindHunter({ hunter, target }) {
    const chase = pursuerBrain({ pursuer: hunter, evader: target, sprint: true });
    return (world) => {
        const rays = readPreyRays(world, hunter);
        if (rays.decoy && rays.aim) {
            // smoke-decoy: a fresh cloud reads as a body, so the hunter turns to the nearest prey ray, with no memory of the target
            const at = hunter * OUTPUT_COUNT;
            world.outputs.fill(0, at, at + OUTPUT_COUNT);
            world.outputs[at + OUTPUT_INDEX.TURN] = steer(world, hunter, rays.aim);
            const gripped = rays.reach >= GRIP;
            world.outputs[at + OUTPUT_INDEX.THRUST] = gripped ? 0 : 1;
            world.outputs[at + OUTPUT_INDEX.SPRINT] = gripped ? 0 : 1;
            world.outputs[at + OUTPUT_INDEX.BITE] = 1;
            return;
        }
        if (!covered(world, hunter, target)) {
            chase(world);
            return;
        }
        const row = hunter * OUTPUT_COUNT;
        world.outputs.fill(0, row, row + OUTPUT_COUNT);
        world.outputs[row + OUTPUT_INDEX.THRUST] = 1;
        world.outputs[row + OUTPUT_INDEX.SPRINT] = 1;
        world.outputs[row + OUTPUT_INDEX.BITE] = 1;
    };
}

/**
 * @param {Record<string, any>} world the world
 * @param {{hunter: number, target: number, view: import('./role-budget-params.js').RoleParams}} watch the hunter's slot, the
 *   other body's slot and the hunter's numbers
 * @returns {boolean} whether the target is outside the hunter's view: beyond its reach at the bearing from its heading, plus
 *   the target's size
 */
function outOfView(world, { hunter, target, view }) {
    const dx = world.x[target] - world.x[hunter];
    const dy = world.y[target] - world.y[hunter];
    const dist = norm(dx, dy);
    const angle = world.angle[hunter];
    const cos = (dx * detCos(angle) + dy * detSin(angle)) / Math.max(dist, 1e-9);
    return dist >= viewReachCos(view, cos) + world.size[target];
}

/**
 * @typedef {object} SmokeScene
 * @property {{releaseTick: number, hiddenTicks: number, cloudLife: number}} ticks the tick the cloud was released, the ticks
 *   the hunter's line to the body met it from then, and the ticks the cloud lived
 * @property {{escaped: boolean, cloud: {x: number, y: number}, between: boolean}} outcome whether the body was out of the
 *   hunter's view when the cloud stopped covering it, where the cloud lay relative to the hunter's start, and whether it lay
 *   between the hunter and the defender
 */

/**
 * Follows the cloud and the hunter's line to the body from the release: counts the ticks it is covered (the release tick
 * included, since the cloud is there from it) and the ticks the cloud lives, and reads whether the body is out of view the
 * tick the cover first ends.
 * @param {{hunter: number, body: number, origin: {x: number, y: number}, view: import('./role-budget-params.js').RoleParams}} slots
 *   the hunter, the hidden body, the hunter's start and its numbers
 * @returns {{observe: (world: Record<string, any>) => boolean, read: () => SmokeScene['outcome'] & {hiddenTicks: number,
 *   cloudLife: number}}} the observer for `runScene` (true once the cloud is gone) and its readings
 */
function followCloud({ hunter, body, origin, view }) {
    const seen = { started: false, hidden: 1, life: 1, escaped: false, covering: true, cloud: { x: 0, y: 0 } };
    return {
        observe(world) {
            if (world.cloudCount === 0) {
                return seen.started;
            }
            if (!seen.started) {
                seen.started = true;
                seen.cloud = { x: world.cloudX[0] - origin.x, y: world.cloudY[0] - origin.y };
            } else {
                seen.life += 1;
            }
            const was = seen.covering;
            seen.covering = was && covered(world, hunter, body);
            seen.hidden += seen.covering ? 1 : 0;
            seen.escaped = was && !seen.covering ? outOfView(world, { hunter, target: body, view }) : seen.escaped;
            return false;
        },
        read: () => ({
            escaped: seen.escaped,
            cloud: seen.cloud,
            between: false,
            hiddenTicks: seen.hidden,
            cloudLife: seen.life,
        }),
    };
}

/**
 * Plays the prey's smoke: the hunter, at its sprint cap, is `gap` behind the prey, which faces away and drops a cloud at tick
 * 0, then runs sideways at full sprint; the hunter keeps its heading while the cloud lies on its line to the prey.
 * @param {Readonly<Record<string, any>>} config an `arenaConfig`
 * @param {{gap: number, trace?: (world: Record<string, any>, n: number) => void}} options the centre gap at the release and a
 *   hook called after every tick
 * @returns {SmokeScene} the readings from the real sim
 */
export function playSmoke(config, { gap, trace }) {
    const specs = /** @type {Record<string, any>} */ (config.specialisations);
    const hunter = roleParams(config, 'predator');
    const { x, y } = ARENA_CENTRE;
    const staged = stageArena(config, [
        { spec: specs.predator.index, x, y, angle: 0 },
        { spec: specs.forager.index, x: x + gap, y, angle: 0 },
    ]);
    staged.world.vx[0] = hunter.cap.sprint;
    const follow = followCloud({ hunter: 0, body: 1, origin: { x, y }, view: hunter });
    runScene(staged, {
        brains: [blindHunter({ hunter: 0, target: 1 }), smokerBrain({ prey: 1, release: 0 })],
        observe: (world, n) => {
            trace?.(world, n);
            return follow.observe(world);
        },
    });
    const { hiddenTicks, cloudLife, ...outcome } = follow.read();
    return { ticks: { releaseTick: 0, hiddenTicks, cloudLife }, outcome };
}

/**
 * @param {number} slot the body
 * @returns {(world: Record<string, any>) => void} a `brain` phase body that holds every output at 0
 */
function standBrain(slot) {
    return (world) => world.outputs.fill(0, slot * OUTPUT_COUNT, (slot + 1) * OUTPUT_COUNT);
}

/** The heading error under which the defender counts as facing its aim (the angle is stored as a float32). */
const FACING = 1e-4;

/**
 * The defender's release brain: it hears the alarm as the defender oracle does, turns to face `aim` (+x faces the caller,
 * -x the hunter) and, once it faces it, holds `SMOKE` for one tick. It stands: it holds no thrust.
 * @param {{defender: number, aim: number, reaction: number, threshold: number}} slots the defender, the direction it faces
 *   (+1 or -1 along x), the reaction ticks and the loudness it acts on
 * @returns {((world: Record<string, any>) => void) & {state: {heardTick: number, startTick: number, releaseTick: number}}}
 *   a `brain` phase body and its readings
 */
function releaserBrain({ defender, aim, reaction, threshold }) {
    const state = { heardTick: -1, startTick: -1, releaseTick: -1 };
    const brain = (/** @type {Record<string, any>} */ world) => {
        const row = actingRow(world, state, { defender, reaction, threshold });
        if (row < 0) {
            return;
        }
        const gap = wrap((aim > 0 ? 0 : Math.PI) - world.angle[defender]);
        if (Math.abs(gap) < FACING) {
            state.releaseTick = world.tick;
            world.outputs[row + OUTPUT_INDEX.SMOKE] = 1;
        } else {
            const { config } = world;
            const fat = 1 - (config.fatSlowShare * world.energy[defender]) / world.lanes.maxEnergy[defender];
            const rate = world.lanes.maxTurn[defender] * fat;
            world.outputs[row + OUTPUT_INDEX.TURN] = Math.max(-1, Math.min(1, gap / rate));
        }
    };
    return Object.assign(brain, { state });
}

/**
 * The caller: it calls alarm as the caller oracle does and, once a cloud lies between it and the hunter, runs sideways at
 * full sprint.
 * @param {{caller: number, hunter: number, seeGap: number, reaction: number}} slots the caller, the hunter, the gap at which
 *   it sees the hunter and the reaction ticks
 * @returns {(world: Record<string, any>) => void} a `brain` phase body
 */
function fleeingCaller(slots) {
    const call = callerBrain(slots);
    return (world) => {
        call(world);
        if (world.cloudCount > 0) {
            const row = slots.caller * OUTPUT_COUNT;
            world.outputs[row + OUTPUT_INDEX.THRUST] = 1;
            world.outputs[row + OUTPUT_INDEX.SPRINT] = 1;
            world.outputs[row + OUTPUT_INDEX.TURN] = steer(world, slots.caller, { x: 0, y: 1 });
        }
    };
}

/**
 * Plays the defender's smoke: the hunter creeps up on the caller from its awareness gap, the caller calls alarm, and the
 * defender, already standing on the line `releasePoint` short of the caller at rest and facing `standing`, hears it, turns to
 * face the caller (or the hunter) and drops a cloud; the caller runs sideways once it lies there.
 * @param {Readonly<Record<string, any>>} config an `arenaConfig`
 * @param {{reaction: number, threshold: number, standing: number, facing?: 'caller' | 'hunter',
 *   trace?: (world: Record<string, any>, n: number) => void, walk?: {side: number}}} options the reaction ticks, the loudness
 *   the defender acts on, the heading the defender stands with, which way it faces to release and a hook called after every
 *   tick; with `walk` the defender starts `side` px to the side of the caller facing `standing`, walks onto the spot and stops
 *   there (`walkerBrain`), and the hunter stands still, so the walk is read without a hunter's bumps
 * @returns {SmokeScene & {ticks: {heardTick: number, startTick: number}}} the readings from the real sim
 */
export function playDefenderSmoke(config, options) {
    const { reaction, threshold, standing, facing = 'caller', trace, walk } = options;
    let spot = 0;
    const { staged, hunter, gap, origin } = stageTrio(config, (at) => {
        spot = at.gap - (at.caller.size + at.defender.size);
        return walk ? { x: at.gap, y: walk.side, angle: standing } : { x: spot, y: 0, angle: standing };
    });
    const release = walk
        ? walkerBrain({
              defender: 2,
              to: { x: origin.x + spot, y: origin.y },
              p: roleParams(config, 'defender'),
              reaction,
              threshold,
          })
        : releaserBrain({ defender: 2, aim: facing === 'caller' ? 1 : -1, reaction, threshold });
    const follow = followCloud({ hunter: 0, body: 1, origin, view: hunter });
    const brains = [
        walk ? standBrain(0) : blindHunter({ hunter: 0, target: 1 }),
        fleeingCaller({ caller: 1, hunter: 0, seeGap: gap, reaction }),
        release,
    ];
    if (walk) {
        staged.world.vx[0] = 0;
    }
    const observe = (/** @type {Record<string, any>} */ world, /** @type {number} */ n) => {
        trace?.(world, n);
        return follow.observe(world);
    };
    runScene(staged, { brains, observe });
    const { hiddenTicks, cloudLife, ...outcome } = follow.read();
    return {
        ticks: {
            heardTick: release.state.heardTick,
            startTick: release.state.startTick,
            releaseTick: release.state.releaseTick,
            hiddenTicks,
            cloudLife,
        },
        outcome: { ...outcome, between: outcome.cloud.x < spot },
    };
}
