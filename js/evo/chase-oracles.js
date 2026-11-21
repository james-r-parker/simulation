// The two scripted bodies of the chase envelope, each given the full world state (docs/designs/senses-and-motor.md,
// Phase 2): a pursuer that steers to intercept and an evader that runs from it and breaks across its path when it
// closes. Heuristics, not game-theoretic optima: a catch share is what the body allows against this evader, and a
// better evader would lower it. Steering uses vectors (no `atan2`), so the same inputs give the same outputs everywhere.

import { OUTPUT_COUNT, OUTPUT_INDEX } from '../sim/brain-layout.js';
import { HEARD_STRIDE } from '../sim/agent-arrays.js';
import { detCos, detSin } from '../sim/det-math.js';

const PI = Math.PI;
const TWO_PI = 2 * PI;
/** The distance at which the evader stops running straight and breaks across the pursuer's path. */
export const JINK_RANGE = 120;
/** The longest the pursuer leads its aim, in ticks of the evader's motion. */
const LEAD_MAX = 30;
/** The offset of the alarm loudness in a `heard` row (`ALARM_HEARD` of js/sim/calls.js). */
const HEARD_ALARM = 0;
/** A speed under this is "at rest" for choosing a direction. */
const REST = 0.05;
/** With the sprint store on (docs/designs/fair-chase.md, Step 1), the evader sprints only inside this many `JINK_RANGE`s. */
export const EVADER_SPRINT_JINKS = 3;

/**
 * @param {number} a an angle
 * @returns {number} the angle wrapped into [-PI, PI)
 */
export function wrap(a) {
    const r = (((a + PI) % TWO_PI) + TWO_PI) % TWO_PI;
    return r - PI;
}

/**
 * @param {number} x a vector's x
 * @param {number} y its y
 * @returns {number} its length
 */
const length = (x, y) => Math.sqrt(x * x + y * y);

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot the steering body
 * @param {{x: number, y: number}} aim the direction wanted (not unit)
 * @returns {number} the `TURN` output that closes the gap to the aim in one tick: the sine of the gap over the turn rate
 *   (its angle for a small gap), clamped to [-1, 1]; a full turn to the nearer side when the aim is behind
 */
export function steer(world, slot, aim) {
    const rate = world.config.maxTurn * world.turnBySpec[world.spec[slot]];
    const hx = detCos(world.angle[slot]);
    const hy = detSin(world.angle[slot]);
    const size = length(aim.x, aim.y) || 1;
    const cross = (hx * aim.y - hy * aim.x) / size;
    const dot = (hx * aim.x + hy * aim.y) / size;
    if (dot < 0) {
        return Math.sign(cross) || 1;
    }
    return Math.max(-1, Math.min(1, cross / rate));
}

/**
 * Zeroes a body's output row and sets the given outputs.
 * @param {Record<string, any>} world the world
 * @param {number} slot the body
 * @param {{turn: number, sprint: boolean, bite: boolean}} out the outputs; `THRUST` is always 1
 * @returns {void}
 */
function drive(world, slot, { turn, sprint, bite }) {
    const row = slot * OUTPUT_COUNT;
    world.outputs.fill(0, row, row + OUTPUT_COUNT);
    world.outputs[row + OUTPUT_INDEX.THRUST] = 1;
    world.outputs[row + OUTPUT_INDEX.TURN] = turn;
    world.outputs[row + OUTPUT_INDEX.SPRINT] = sprint ? 1 : 0;
    world.outputs[row + OUTPUT_INDEX.BITE] = bite ? 1 : 0;
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} from the body whose motion is wanted
 * @returns {{x: number, y: number}} its direction of travel: its velocity, or its facing at rest (not unit)
 */
function travelOf(world, from) {
    if (length(world.vx[from], world.vy[from]) > REST) {
        return { x: world.vx[from], y: world.vy[from] };
    }
    return { x: detCos(world.angle[from]), y: detSin(world.angle[from]) };
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot a body
 * @returns {boolean} whether its sprint store is above its `sprintFloor` lane; true with the store off
 */
export function storeAboveFloor(world, slot) {
    const store = world.sprintStore;
    return store === undefined || store.level[slot] > world.lanes.sprintFloor[slot];
}

/**
 * The pursuer's brain: aims at where the evader will be after the time it needs to cover the gap, thrusts, bites, and
 * sprints when asked; with the sprint store on, only while its store is above `sprintFloor` and the evader is in view.
 * @param {{pursuer: number, evader: number, sprint: boolean}} slots the two bodies and whether the pursuer sprints
 * @returns {(world: Record<string, any>) => void} a `brain` phase body
 */
export function pursuerBrain({ pursuer, evader, sprint }) {
    return (world) => {
        const dx = world.x[evader] - world.x[pursuer];
        const dy = world.y[evader] - world.y[pursuer];
        const speed = Math.max(length(world.vx[pursuer], world.vy[pursuer]), 1);
        const lead = Math.min(length(dx, dy) / speed, LEAD_MAX);
        const aim = { x: dx + lead * world.vx[evader], y: dy + lead * world.vy[evader] };
        const inView = world.sprintStore === undefined || length(dx, dy) <= world.visionBySpec[world.spec[pursuer]];
        const burst = sprint && inView && storeAboveFloor(world, pursuer);
        drive(world, pursuer, { turn: steer(world, pursuer, aim), sprint: burst, bite: true });
    };
}

/**
 * Adds a push away from a wall to an aim: inside `margin` of a wall the aim gains a component along the inward normal
 * that grows from 0 at the margin to the aim's own length at the wall (and beyond), so an evader bends along a wall
 * instead of running into it.
 * @param {Record<string, any>} world the world
 * @param {{slot: number, aim: {x: number, y: number}, margin: number}} body the evader, its aim and the margin
 * @returns {{x: number, y: number}} the aim with the push added
 */
function wallPushed(world, { slot, aim, margin }) {
    const size = length(aim.x, aim.y) || 1;
    const { worldWidth, worldHeight } = world.config;
    const x = world.x[slot];
    const y = world.y[slot];
    const along = (/** @type {number} */ d) => (size * Math.max(0, margin - d)) / margin;
    return {
        x: aim.x + along(x) - along(worldWidth - x),
        y: aim.y + along(y) - along(worldHeight - y),
    };
}

/**
 * The evader's brain: runs straight away from the pursuer; inside `jinkRange` it turns square across the pursuer's
 * line of travel, on the side it already stands, so the pursuer must turn through the most. With the sprint store on it
 * sprints only while the pursuer is within `EVADER_SPRINT_JINKS x JINK_RANGE` and its store is above `sprintFloor`.
 * @param {{pursuer: number, evader: number, sprint: boolean, jinkRange?: number, wallMargin?: number}} slots the two
 *   bodies, whether the evader sprints, the distance at which it breaks (`JINK_RANGE`; 0 runs straight) and the
 *   distance from a wall at which it starts to bend away (default 0: it does not)
 * @returns {(world: Record<string, any>) => void} a `brain` phase body
 */
export function evaderBrain({ pursuer, evader, sprint, jinkRange = JINK_RANGE, wallMargin = 0 }) {
    return (world) => {
        const dx = world.x[evader] - world.x[pursuer];
        const dy = world.y[evader] - world.y[pursuer];
        let aim = { x: dx, y: dy };
        if (length(dx, dy) < jinkRange) {
            const t = travelOf(world, pursuer);
            const side = Math.sign(t.x * dy - t.y * dx) || 1;
            aim = { x: -side * t.y, y: side * t.x };
        } else if (wallMargin > 0) {
            aim = wallPushed(world, { slot: evader, aim, margin: wallMargin });
        }
        const near = world.sprintStore === undefined || length(dx, dy) < EVADER_SPRINT_JINKS * JINK_RANGE;
        const burst = sprint && near && storeAboveFloor(world, evader);
        drive(world, evader, { turn: steer(world, evader, aim), sprint: burst, bite: false });
    };
}

/**
 * Zeroes a body's output row: it stands, holding nothing.
 * @param {Record<string, any>} world the world
 * @param {number} slot the body
 * @returns {number} the offset of its output row
 */
function stand(world, slot) {
    const row = slot * OUTPUT_COUNT;
    world.outputs.fill(0, row, row + OUTPUT_COUNT);
    return row;
}

/**
 * The caller's brain (docs/designs/role-budget.md, Phase 2): it stands with nothing held until the hunter is within `seeGap`
 * of it, then holds `ALARM` from `reaction` ticks later, so its alarm fires once and again as the timer runs out.
 * @param {{caller: number, hunter: number, seeGap: number, reaction: number}} slots the caller, the hunter it watches, the
 *   centre gap at which it sees the hunter and the ticks from seeing to calling
 * @returns {(world: Record<string, any>) => void} a `brain` phase body
 */
export function callerBrain({ caller, hunter, seeGap, reaction }) {
    let saw = -1;
    return (world) => {
        const row = stand(world, caller);
        const gap = length(world.x[hunter] - world.x[caller], world.y[hunter] - world.y[caller]);
        saw = saw < 0 && gap <= seeGap ? world.tick : saw;
        if (saw >= 0 && world.tick >= saw + reaction) {
            world.outputs[row + OUTPUT_INDEX.ALARM] = 1;
        }
    };
}

/**
 * A body that stands until its `heard` alarm loudness is above `threshold`, then, `reaction` ticks later, does `act`. It
 * records the tick it heard and the tick it moved.
 * @param {{slot: number, reaction: number, threshold: number, act: (world: Record<string, any>) => void}} body the body,
 *   the ticks from hearing to moving, the loudness it acts on and what it does once it moves
 * @returns {((world: Record<string, any>) => void) & {state: {heardTick: number, startTick: number}}} a `brain` phase body
 *   and its readings
 */
function hearerBrain({ slot, reaction, threshold, act }) {
    const state = { heardTick: -1, startTick: -1 };
    const brain = (/** @type {Record<string, any>} */ world) => {
        if (state.heardTick < 0 && world.heard[slot * HEARD_STRIDE + HEARD_ALARM] > threshold) {
            state.heardTick = world.tick;
            state.startTick = world.tick + reaction;
        }
        if (state.startTick >= 0 && world.tick >= state.startTick) {
            act(world);
        } else {
            stand(world, slot);
        }
    };
    return Object.assign(brain, { state });
}

/**
 * The defender's brain: it stands until it hears the alarm, then runs at the hunter as the pursuer does and holds `BITE` (the
 * shove needs it).
 * @param {{defender: number, hunter: number, reaction: number, threshold: number}} slots the defender, the hunter, the ticks
 *   from hearing to moving and the loudness it acts on
 * @returns {ReturnType<typeof hearerBrain>} a `brain` phase body and its readings
 */
export function defenderBrain({ defender, hunter, reaction, threshold }) {
    const act = pursuerBrain({ pursuer: defender, evader: hunter, sprint: true });
    return hearerBrain({ slot: defender, reaction, threshold, act });
}

/**
 * The warned forager's brain (docs/designs/role-budget.md, Phase 3): it grazes in place until it hears the scout's alarm, then
 * runs from the hunter as the evader does (it turns away, sprints inside the hunter's range and breaks across its path).
 * @param {{forager: number, hunter: number, reaction: number, threshold: number}} slots the forager, the hunter, the ticks
 *   from hearing to moving and the loudness it acts on
 * @returns {ReturnType<typeof hearerBrain>} a `brain` phase body and its readings
 */
export function fleerBrain({ forager, hunter, reaction, threshold }) {
    const act = evaderBrain({ pursuer: hunter, evader: forager, sprint: true });
    return hearerBrain({ slot: forager, reaction, threshold, act });
}

/**
 * The hunter that creeps up on the herd: it steers at the prey at its cruise speed, holding its sprint, until tick `goAt`, and
 * from then on pursues as the pursuer does.
 * @param {{hunter: number, prey: number, goAt: number}} slots the hunter, its prey and the tick it starts to sprint
 * @returns {(world: Record<string, any>) => void} a `brain` phase body
 */
export function stalkerBrain({ hunter, prey, goAt }) {
    const creep = pursuerBrain({ pursuer: hunter, evader: prey, sprint: false });
    const chase = pursuerBrain({ pursuer: hunter, evader: prey, sprint: true });
    return (world) => (world.tick >= goAt ? chase(world) : creep(world));
}

/**
 * The prey's smoke brain: at tick `release` it holds `SMOKE` (the cloud lands behind it along its heading), and from then on
 * runs at full sprint at the aim `(0, 1)`, sideways to a hunter that comes along +x.
 * @param {{prey: number, release: number}} slots the prey and the tick it releases
 * @returns {(world: Record<string, any>) => void} a `brain` phase body
 */
export function smokerBrain({ prey, release }) {
    return (world) => {
        const row = stand(world, prey);
        world.outputs[row + OUTPUT_INDEX.THRUST] = 1;
        world.outputs[row + OUTPUT_INDEX.SMOKE] = world.tick === release ? 1 : 0;
        if (world.tick >= release) {
            world.outputs[row + OUTPUT_INDEX.TURN] = steer(world, prey, { x: 0, y: 1 });
            world.outputs[row + OUTPUT_INDEX.SPRINT] = 1;
        }
    };
}
