// The input-only reference (senses-and-motor.md, Lesson probes): a scripted subject that reads only what a brain reads
// (the ray block and the body inputs, `world.inputs`, and the hue of the food on a ray), plus the length of its own eye to
// turn a ray's nearness into a distance, and plays every drill with one rule set: flee a threat (to the refuge when the
// body inputs name one, else off every threat ray and square across their line once close), eat the nearest food whose
// hue is not the toxic one, chase prey the rays call bitable, and scan in place when it senses nothing. What it wins is
// what the senses allow a competent controller; the gap to the oracle (`js/evo/lesson-oracles.js`) is what the senses
// lose. A detector, never fitness; `referenceSubject('input-reader')` returns it.

import { BODY_INPUT, RAY_CHANNELS, OUTPUT_INDEX } from '../sim/brain-layout.js';
import { FLORA_DEFAULTS } from '../sim/config-flora.js';
import { detCos, detSin } from '../sim/det-math.js';
import { visionOf } from '../sim/traits.js';
import { JINK_RANGE } from './chase-oracles.js';
import { bodyInput } from './scripted-combat.js';
import { nearestClassRay } from './observer-tick.js';
import {
    CH_FOOD,
    CH_KIN,
    CH_PREY,
    CH_THREAT,
    SEEK_THRUST,
    eachAlive,
    setOutput,
    turnTowards,
    write,
    writeForage,
} from './scripted-parts.js';

/** The reference's name in `referenceSubject`. */
export const INPUT_READER = 'input-reader';
/** Two food hues closer than this are the same food. */
const SAME_HUE = 0.05;
/** The spin of a reference that senses nothing: a full turn at no thrust, so it scans the whole circle. */
const SCAN_TURN = 1;
/** A refuge counts as sensed above this nearness. */
const REFUGE_SENSED = 0;
/** Within this distance the reference sprints from a threat: the oracle's `SPRINT_RANGE` (`js/evo/lesson-oracles.js`). */
const SPRINT_RANGE = 260;

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @param {number} distance a distance
 * @returns {number} the nearness a ray reads for a hit at that distance on the agent's eye (1 at contact, 0 at its range)
 */
function nearnessAt(world, slot, distance) {
    return 1 - distance / visionOf(world, slot);
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @returns {number} the ray of the nearest food that is not the toxic one, or -1
 */
function nearestSafeFood(world, slot) {
    const { rayCount } = world.config;
    const base = (/** @type {number} */ k) => slot * world.layout.rawInputCount + k * RAY_CHANNELS;
    const isSafe = (/** @type {number} */ k) =>
        world.inputs[base(k) + CH_FOOD] > 0 &&
        Math.abs(world.rayHue[slot * rayCount + k] - FLORA_DEFAULTS.toxiccap.hue) >= SAME_HUE;
    const safe = Array.from({ length: rayCount }, (_, k) => k).filter(isSafe);
    if (safe.length === 0) {
        return -1;
    }
    return safe.reduce((best, k) => (world.inputs[base(k)] > world.inputs[base(best)] ? k : best));
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @returns {{x: number, y: number, near: number}} the sum of the threat rays' directions in the agent's frame (heading
 *   along x, the positive turn side along y), each weighted by its nearness, and the nearest threat's nearness
 */
function threatSum(world, slot) {
    const rays = world.config.rayCount;
    const row = slot * world.layout.rawInputCount;
    let x = 0;
    let y = 0;
    let near = 0;
    for (let k = 0; k < rays; k++) {
        const hit = world.inputs[row + k * RAY_CHANNELS];
        if (world.inputs[row + k * RAY_CHANNELS + CH_THREAT] > 0) {
            const theta = (2 * Math.PI * k) / rays;
            x += hit * detCos(theta);
            y += hit * detSin(theta);
            near = Math.max(near, hit);
        }
    }
    return { x, y, near };
}

/**
 * @param {Record<string, any>} world the world
 * @param {{x: number, y: number}} aim the direction wanted, in the agent's frame (not unit)
 * @returns {number} the `TURN` that closes the gap in one tick, the gap's sine over the turn rate clamped to [-1, 1]; a
 *   full turn to the nearer side when the aim is behind (the shape of `steer` in `js/evo/chase-oracles.js`)
 */
function turnTo(world, aim) {
    const size = Math.max(Math.sqrt(aim.x * aim.x + aim.y * aim.y), Number.EPSILON);
    if (aim.x < 0) {
        return Math.sign(aim.y) || 1;
    }
    return Math.max(-1, Math.min(1, aim.y / size / world.config.maxTurn));
}

/**
 * @param {{x: number, y: number, near: number}} threat the threat rays' sum
 * @param {number} jink the nearness within which the reference breaks: `JINK_RANGE`, where the oracle's evader breaks
 * @returns {{x: number, y: number}} where to run: straight away from the threat, or, once it is within `jink`, square
 *   across its line on the side nearer the heading, so a pursuer of equal speed must turn through the most
 */
function escapeAim(threat, jink) {
    if (threat.near <= jink) {
        return { x: -threat.x, y: -threat.y };
    }
    const side = threat.y >= 0 ? 1 : -1;
    return { x: side * threat.y, y: -side * threat.x };
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @returns {void} flees: towards the refuge when the body inputs name one, else away from the threats on the rays (across
 *   their line once within `JINK_RANGE`), sprinting once the nearest is within `SPRINT_RANGE`
 */
function flee(world, slot) {
    const near = bodyInput(world, slot, BODY_INPUT.REFUGE_NEAR);
    const threat = threatSum(world, slot);
    let turn = turnTo(world, escapeAim(threat, nearnessAt(world, slot, JINK_RANGE)));
    if (near > REFUGE_SENSED) {
        const cos = bodyInput(world, slot, BODY_INPUT.REFUGE_BEARING_COS);
        const sin = bodyInput(world, slot, BODY_INPUT.REFUGE_BEARING_SIN);
        turn = cos < 0 ? Math.sign(sin) || 1 : Math.max(-1, Math.min(1, 4 * sin));
    }
    write(world, slot, 1, turn);
    setOutput(
        world,
        slot,
        OUTPUT_INDEX.SPRINT,
        threat.near > nearnessAt(world, slot, SPRINT_RANGE) || near > REFUGE_SENSED ? 1 : 0,
    );
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @returns {void} writes one agent's outputs from its inputs alone
 */
function read(world, slot) {
    const rays = world.config.rayCount;
    const threat = nearestClassRay(world, slot, CH_THREAT, CH_THREAT);
    const food = nearestSafeFood(world, slot);
    const prey = nearestClassRay(world, slot, CH_PREY, CH_PREY);
    if (threat >= 0) {
        flee(world, slot);
    } else if (food >= 0) {
        writeForage(world, slot, SEEK_THRUST * 2, turnTowards(food, rays));
    } else if (prey >= 0) {
        write(world, slot, 1, turnTowards(prey, rays));
        setOutput(world, slot, OUTPUT_INDEX.SPRINT, 1);
        setOutput(world, slot, OUTPUT_INDEX.BITE, 1);
    } else {
        write(world, slot, 0, SCAN_TURN);
    }
}

/**
 * @returns {import('./memory-probe-run.js').Subject} the reference as a probe subject; its `spec` is null, so it takes
 *   the scenario's
 */
export function readerSubject() {
    return {
        name: INPUT_READER,
        id: 0,
        spec: null,
        weights: null,
        act: eachAlive((world, slot) => read(world, slot)),
    };
}

/** The name of the reference that spares kin (`kin-spared`). */
export const KIN_SPARING = 'kin-sparing';

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @param {number} ray a ray index
 * @returns {number} how near the ray's hit is (1 at contact)
 */
function nearness(world, slot, ray) {
    return world.inputs[slot * world.layout.rawInputCount + ray * RAY_CHANNELS];
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @returns {void} withdraws the bite while a clone is nearer than the prey on the rays: the sim refuses a bite on kin, but
 *   the lesson is not to want one (`kin-spared`)
 */
function spareKin(world, slot) {
    const kin = nearestClassRay(world, slot, CH_KIN, CH_KIN);
    const prey = nearestClassRay(world, slot, CH_PREY, CH_PREY);
    if (kin >= 0 && (prey < 0 || nearness(world, slot, kin) > nearness(world, slot, prey))) {
        setOutput(world, slot, OUTPUT_INDEX.BITE, 0);
    }
}

/**
 * @returns {import('./memory-probe-run.js').Subject} the input reader that holds its bite while a clone is nearer than the
 *   prey: the senses-only reference of `kin-spared`, where `memoryless` and `input-reader` bite whenever prey is in view
 */
export function kinSparingSubject() {
    const reader = readerSubject();
    const act = /** @type {(world: Record<string, any>) => void} */ (reader.act);
    return {
        ...reader,
        name: KIN_SPARING,
        act: (world) => {
            act(world);
            for (let slot = 0; slot < world.alive.length; slot++) {
                if (world.alive[slot] === 1) {
                    spareKin(world, slot);
                }
            }
        },
    };
}
