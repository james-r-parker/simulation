// What does a hunter choose to bite (body-genes.md, Detectors, T22)? The hunter's pick of the small, the slow and the spent
// is the scene: a body gene (size, speed, vision) only pays for a prey if hunters pick on it. Each tick after the step the
// scene finds the bites that began this tick and reads the hunter's view when they did. Detectors only, never fitness.
//
// - A bite lands when the victim's `lastBiter` is the hunter's genome id and its `lastBiteTick` is the step's tick
//   (`applyBite` in `js/sim/feeding.js` sets it before `step` raises `world.tick`). It is a start unless the hunter's
//   last victim was the same body within `CONTINUE_GAP` ticks.
// - A prey is a body the hunter `couldBite` (role, kin and size) with its centre inside the hunter's `visionOf` range.
// - `eval.hunter_size_choice` and `eval.hunter_slow_choice`: over the starts with at least one other prey in view, the
//   size (the speed) of the bitten prey minus the mean of the others in view, averaged. Below 0 means the small (the slow)
//   are picked. Null under `MIN_STARTS` starts.
// - `eval.hunter_defender_bite_ratio`: the starts on defenders per defender-in-view tick, over the same for other prey. A
//   tick of exposure is one prey in one hunter's view, counted every `EXPOSURE_EVERY` ticks. Null with no defender or no
//   other prey in view, or no start on another prey.
//
// The bitten prey is read as it stood before the bite (`prevSize`, `prevVx` and `prevVy`, copied at the end of every tick),
// since a bite takes energy and shrinks it and a kick moves it. A bite that kills in its first tick frees the victim before
// the observer reads, and is not counted. The scene reads the world and writes only itself; nothing is allocated per tick.

import { OUTPUT_COUNT, OUTPUT_INDEX } from '../sim/brain-layout.js';
import { couldBite } from '../sim/bite-rule.js';
import { SPEC } from '../sim/specs.js';
import { visionOf } from '../sim/traits.js';
import { BURN_IN_TICKS } from './burn-in.js';
import { none, ok } from './metrics-stats.js';

/** The ticks between exposure scans. */
export const EXPOSURE_EVERY = 5;
/** The longest gap, in ticks, between two bites on one body that still counts as one start. */
export const CONTINUE_GAP = 3;
/** The fewest starts a choice is reported over. */
export const MIN_STARTS = 30;

// Scratch of one view scan: defenders, other prey, then (excluding the victim) count, size sum and speed sum.
const DEFENDERS = 0;
const OTHERS = 1;
const COUNT = 2;
const SIZE = 3;
const SPEED = 4;
const view = new Float64Array(5);

/**
 * @param {Readonly<Record<string, any>>} config the world's config (`maxAgents`)
 * @returns {Record<string, any>} an empty scene: each hunter's last victim and bite tick, and the tallies
 */
export function createHunterChoiceScene(config) {
    return {
        victim: new Uint32Array(config.maxAgents),
        lastTick: new Int32Array(config.maxAgents).fill(-1),
        prevSize: new Float64Array(config.maxAgents),
        prevVx: new Float64Array(config.maxAgents),
        prevVy: new Float64Array(config.maxAgents),
        defenderStarts: 0,
        otherStarts: 0,
        defenderExposure: 0,
        otherExposure: 0,
        choiceStarts: 0,
        sizeGap: 0,
        speedGap: 0,
    };
}

/**
 * @param {Record<string, any>} scene the scene
 * @param {number} slot a freed slot
 * @returns {void}
 */
export function freeHunterChoiceSlot(scene, slot) {
    scene.victim[slot] = 0;
    scene.lastTick[slot] = -1;
}

/**
 * Fills `view` from the prey in the hunter's view: the defenders and other prey, and the size and speed of every prey
 * but `skip`.
 * @param {Record<string, any>} world the world
 * @param {number} hunter an alive hunter
 * @param {number} skip a slot to leave out of the count, size and speed (-1 for none)
 * @returns {void}
 */
function scanView(world, hunter, skip) {
    view.fill(0);
    const range = visionOf(world, hunter);
    const { alive, x, y, vx, vy, size, spec } = world;
    for (let other = 0; other < alive.length; other++) {
        if (alive[other] !== 1 || other === hunter) {
            continue;
        }
        const dx = x[other] - x[hunter];
        const dy = y[other] - y[hunter];
        if (dx * dx + dy * dy > range * range || !couldBite(world, hunter, other)) {
            continue;
        }
        view[spec[other] === SPEC.DEFENDER ? DEFENDERS : OTHERS] += 1;
        if (other !== skip) {
            view[COUNT] += 1;
            view[SIZE] += size[other];
            view[SPEED] += Math.sqrt(vx[other] * vx[other] + vy[other] * vy[other]);
        }
    }
}

/**
 * @param {Record<string, any>} scene the scene
 * @param {Record<string, any>} world the world after the step
 * @param {{hunter: number, body: number}} pair a hunter and the body it bit
 * @returns {void}
 */
function noteStart(scene, world, { hunter, body }) {
    const id = world.genomeId[body];
    const continuing = scene.victim[hunter] === id && world.tick - scene.lastTick[hunter] <= CONTINUE_GAP;
    scene.victim[hunter] = id;
    scene.lastTick[hunter] = world.tick;
    if (continuing) {
        return;
    }
    scene[world.spec[body] === SPEC.DEFENDER ? 'defenderStarts' : 'otherStarts'] += 1;
    scanView(world, hunter, body);
    if (view[COUNT] === 0) {
        return;
    }
    scene.choiceStarts += 1;
    scene.sizeGap += scene.prevSize[body] - view[SIZE] / view[COUNT];
    scene.speedGap +=
        Math.sqrt(scene.prevVx[body] * scene.prevVx[body] + scene.prevVy[body] * scene.prevVy[body]) -
        view[SPEED] / view[COUNT];
}

/**
 * @param {Record<string, any>} world the world after the step
 * @param {number} hunter a slot
 * @param {number} body a slot it touches
 * @returns {boolean} whether the hunter's bite on the body landed in the step that just ran
 */
function landed(world, hunter, body) {
    return (
        world.alive[hunter] === 1 &&
        world.alive[body] === 1 &&
        world.huntBySpec[world.spec[hunter]] === 1 &&
        world.outputs[hunter * OUTPUT_COUNT + OUTPUT_INDEX.BITE] > 0 &&
        world.lastBiter[body] === world.genomeId[hunter] &&
        world.lastBiteTick[body] === world.tick - 1
    );
}

/**
 * @param {Record<string, any>} scene the scene
 * @param {Record<string, any>} world the world after the step
 * @returns {void}
 */
function scanExposure(scene, world) {
    for (let slot = 0; slot < world.alive.length; slot++) {
        if (world.alive[slot] !== 1 || world.huntBySpec[world.spec[slot]] !== 1) {
            continue;
        }
        scanView(world, slot, -1);
        scene.defenderExposure += EXPOSURE_EVERY * view[DEFENDERS];
        scene.otherExposure += EXPOSURE_EVERY * view[OTHERS];
    }
}

/**
 * Reads the bites that began in the step that just ran, and every `EXPOSURE_EVERY` ticks the prey in each hunter's view.
 * Call it once a tick after `step`, with the tick's contact list still in the world.
 * @param {Record<string, any>} scene the scene
 * @param {Record<string, any>} world the world after the step
 * @returns {void}
 */
export function tickHunterChoice(scene, world) {
    if (world.tick >= BURN_IN_TICKS) {
        readTick(scene, world);
    }
    scene.prevSize.set(world.size);
    scene.prevVx.set(world.vx);
    scene.prevVy.set(world.vy);
}

/**
 * @param {Record<string, any>} scene the scene
 * @param {Record<string, any>} world the world after the step
 * @returns {void}
 */
function readTick(scene, world) {
    const { contacts, contactCount } = world;
    for (let c = 0; c < contactCount; c++) {
        const a = contacts[2 * c];
        const b = contacts[2 * c + 1];
        if (landed(world, a, b)) {
            noteStart(scene, world, { hunter: a, body: b });
        }
        if (landed(world, b, a)) {
            noteStart(scene, world, { hunter: b, body: a });
        }
    }
    if (world.tick % EXPOSURE_EVERY === 0) {
        scanExposure(scene, world);
    }
}

/**
 * @param {Record<string, any>} scene the scene
 * @param {number} sum a gap summed over `choiceStarts`
 * @returns {import('./metrics-stats.js').MetricResult} the mean gap
 */
function choice(scene, sum) {
    const n = scene.choiceStarts;
    return n < MIN_STARTS ? none(`${n} bite starts with two prey in view (a choice needs ${MIN_STARTS})`) : ok(sum / n);
}

/**
 * @param {Record<string, any>} scene the scene
 * @returns {import('./metrics-stats.js').MetricResult} the defender bite ratio
 */
function defenderRatio(scene) {
    if (scene.defenderExposure === 0 || scene.otherExposure === 0) {
        return none('no defender or no other prey in a hunter view after burn-in');
    }
    if (scene.otherStarts === 0) {
        return none('no bite started on a prey other than a defender after burn-in');
    }
    return ok(scene.defenderStarts / scene.defenderExposure / (scene.otherStarts / scene.otherExposure));
}

/**
 * @param {Record<string, any>} scene the scene
 * @returns {import('./metrics-stats.js').MetricRecord} the three choice metrics
 */
export function hunterChoiceMetrics(scene) {
    return {
        'eval.hunter_defender_bite_ratio': defenderRatio(scene),
        'eval.hunter_size_choice': choice(scene, scene.sizeGap),
        'eval.hunter_slow_choice': choice(scene, scene.speedGap),
    };
}

/** @type {import('./observer-detectors.js').Detector} */
export const hunterChoiceDetector = {
    name: 'hunterChoice',
    modules: ['js/evo/scene-hunter-choice.js'],
    create: (config) => createHunterChoiceScene(config),
    onTick: (scene, world) => tickHunterChoice(scene, world),
    onSlotFree: (scene, slot) => freeHunterChoiceSlot(scene, slot),
    metrics: (scene) => hunterChoiceMetrics(scene),
};
