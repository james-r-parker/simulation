// Refuge use by prey as episodes and visits (refuge.md, Detectors). Every 10 ticks after burn-in, each alive non-hunting
// agent is threatened (a "can bite me" ray hit at `THREAT_PROXIMITY` or more) or calm, and inside a refuge ring or not.
//
// - `eval.refuge_prey_use_under_threat`: the threatened share inside a ring minus the calm share, over non-hunters only.
// - `eval.refuge_episode_entry`: an episode opens at the first threatened sample after a calm one. The share of those
//   episodes with the agent inside a ring at a sample within `REFUGE_WINDOW` ticks (the opening sample counts), minus
//   the same share for control episodes opened at the first calm sample after a threatened one.
// - `eval.refuge_dwell_ticks`: the median ticks from a ring entry to the exit that followed, over visits whose entry was
//   sampled.
// - `eval.refuge_exit_fed`: the share of ring exits followed by a meal within `REFUGE_WINDOW` ticks.
//
// A window or a meal watch that is still open when its agent dies counts as a miss, so a prey eaten outside the ring
// does not drop out of the episode share. State is per slot, guarded by the genome id, so a slot reused by a newborn
// starts clean without a hook; nothing is allocated per sample.

import { BURN_IN_TICKS } from './burn-in.js';
import { none, ok } from './metrics-stats.js';
import { THREAT_PROXIMITY } from './observer-intent-state.js';
import { inRefuge } from './scene-terrain.js';

/** Ticks after an episode opens, or a ring exit, in which the entry or the meal still counts. */
export const REFUGE_WINDOW = 200;

/** Fewest episodes each of the threatened and the control kind need for `eval.refuge_episode_entry`. */
export const MIN_REFUGE_EPISODES = 20;

/** Fewest ring exits `eval.refuge_dwell_ticks` and `eval.refuge_exit_fed` need. */
export const MIN_REFUGE_EXITS = 20;

/** Ticks between samples; a dwell is a whole number of them. */
const SAMPLE_TICKS = 10;

/** Dwell histogram buckets, one per sample interval; the last holds every longer dwell. */
const DWELL_BUCKETS = 256;

const CALM = 0;
const THREAT = 1;

/**
 * @param {Readonly<Record<string, any>>} config the world's config (`maxAgents`)
 * @returns {Record<string, any>} an empty refuge scene
 */
export function createRefugeScene(config) {
    const n = config.maxAgents;
    return {
        genome: new Uint32Array(n),
        known: new Uint8Array(n),
        threat: new Uint8Array(n),
        inside: new Uint8Array(n),
        entryTick: new Float64Array(n),
        windowOpen: new Float64Array(2 * n).fill(-1),
        windowHit: new Uint8Array(2 * n),
        exitTick: new Float64Array(n).fill(-1),
        exitMark: new Float64Array(n),
        threatened: 0,
        threatenedIn: 0,
        calm: 0,
        calmIn: 0,
        episodes: new Uint32Array(2),
        entered: new Uint32Array(2),
        dwell: new Uint32Array(DWELL_BUCKETS),
        dwells: 0,
        exits: 0,
        exitsFed: 0,
    };
}

/**
 * Counts an episode window of one kind as finished.
 * @param {Record<string, any>} scene the refuge scene
 * @param {number} slot the slot
 * @param {number} kind CALM or THREAT
 * @returns {void}
 */
function closeWindow(scene, slot, kind) {
    scene.episodes[kind] += 1;
    scene.entered[kind] += scene.windowHit[2 * slot + kind];
    scene.windowOpen[2 * slot + kind] = -1;
}

/**
 * Advances an open episode window of each kind by one sample: it closes on a hit or once the window has passed.
 * @param {Record<string, any>} scene the refuge scene
 * @param {number} slot the slot
 * @param {{tick: number, inside: number}} at the sample's tick and whether the agent is inside a ring
 * @returns {void}
 */
function stepWindows(scene, slot, { tick, inside }) {
    for (let kind = CALM; kind <= THREAT; kind++) {
        const open = scene.windowOpen[2 * slot + kind];
        if (open < 0) {
            continue;
        }
        if (tick - open > REFUGE_WINDOW) {
            closeWindow(scene, slot, kind);
        } else if (inside === 1) {
            scene.windowHit[2 * slot + kind] = 1;
            closeWindow(scene, slot, kind);
        }
    }
}

/**
 * Opens a window of one kind when the agent's threat state flipped since the last sample.
 * @param {Record<string, any>} scene the refuge scene
 * @param {number} slot the slot
 * @param {{tick: number, inside: number, kind: number}} at the sample's tick, ring state and the new state
 * @returns {void}
 */
function openWindow(scene, slot, { tick, inside, kind }) {
    if (scene.windowOpen[2 * slot + kind] >= 0) {
        closeWindow(scene, slot, kind);
    }
    scene.windowOpen[2 * slot + kind] = tick;
    scene.windowHit[2 * slot + kind] = inside;
    if (inside === 1) {
        closeWindow(scene, slot, kind);
    }
}

/**
 * Counts a pending ring exit as unfed or fed.
 * @param {Record<string, any>} scene the refuge scene
 * @param {number} slot the slot
 * @param {boolean} fed whether a meal followed
 * @returns {void}
 */
function closeExit(scene, slot, fed) {
    scene.exits += 1;
    scene.exitsFed += fed ? 1 : 0;
    scene.exitTick[slot] = -1;
}

/**
 * Resolves a pending exit against the agent's food intake at a sample.
 * @param {Record<string, any>} scene the refuge scene
 * @param {number} slot the slot
 * @param {{tick: number, food: number}} at the sample's tick and the agent's cumulative food energy
 * @returns {void}
 */
function stepExit(scene, slot, { tick, food }) {
    const exit = scene.exitTick[slot];
    if (exit < 0) {
        return;
    }
    if (tick - exit <= REFUGE_WINDOW && food > scene.exitMark[slot]) {
        closeExit(scene, slot, true);
    } else if (tick - exit >= REFUGE_WINDOW) {
        closeExit(scene, slot, false);
    }
}

/**
 * Tracks the ring visit: notes an entry, and on an exit records the dwell and starts watching for a meal.
 * @param {Record<string, any>} scene the refuge scene
 * @param {number} slot the slot
 * @param {{tick: number, inside: number, food: number}} at the sample's tick, ring state and cumulative food energy
 * @returns {void}
 */
function trackVisit(scene, slot, { tick, inside, food }) {
    const was = scene.inside[slot];
    if (was === 0 && inside === 1) {
        scene.entryTick[slot] = scene.known[slot] === 1 ? tick : -1;
    } else if (was === 1 && inside === 0) {
        if (scene.exitTick[slot] >= 0) {
            closeExit(scene, slot, false);
        }
        if (scene.entryTick[slot] >= 0) {
            const bucket = Math.min(DWELL_BUCKETS - 1, Math.floor((tick - scene.entryTick[slot]) / SAMPLE_TICKS));
            scene.dwell[bucket] += 1;
            scene.dwells += 1;
        }
        scene.exitTick[slot] = tick;
        scene.exitMark[slot] = food;
    }
    scene.inside[slot] = inside;
}

/**
 * Closes everything a slot's last agent still had open as a miss, and forgets the agent.
 * @param {Record<string, any>} scene the refuge scene
 * @param {number} slot the slot
 * @returns {void}
 */
function flush(scene, slot) {
    for (let kind = CALM; kind <= THREAT; kind++) {
        if (scene.windowOpen[2 * slot + kind] >= 0) {
            closeWindow(scene, slot, kind);
        }
    }
    if (scene.exitTick[slot] >= 0) {
        closeExit(scene, slot, false);
    }
    scene.known[slot] = 0;
    scene.inside[slot] = 0;
}

/**
 * Takes one prey agent's sample.
 * @param {Record<string, any>} scene the refuge scene
 * @param {{observer: Record<string, any>, world: Record<string, any>}} source the observer and the world
 * @param {number} slot an alive non-hunting slot
 * @returns {void}
 */
function sampleSlot(scene, { observer, world }, slot) {
    const { tick } = world;
    const inside = inRefuge(observer.scenes.terrain, world, slot) ? 1 : 0;
    const threat = observer.intent.threatProx[slot] >= THREAT_PROXIMITY ? THREAT : CALM;
    if (scene.known[slot] === 1 && scene.genome[slot] !== world.genomeId[slot]) {
        flush(scene, slot);
    }
    stepWindows(scene, slot, { tick, inside });
    stepExit(scene, slot, { tick, food: world.foodEnergy[slot] });
    if (scene.known[slot] === 1 && scene.threat[slot] !== threat) {
        openWindow(scene, slot, { tick, inside, kind: threat });
    }
    trackVisit(scene, slot, { tick, inside, food: world.foodEnergy[slot] });
    scene.genome[slot] = world.genomeId[slot];
    scene.known[slot] = 1;
    scene.threat[slot] = threat;
    scene[threat === THREAT ? 'threatened' : 'calm'] += 1;
    scene[threat === THREAT ? 'threatenedIn' : 'calmIn'] += inside;
}

/**
 * Runs one 10-tick sample at or after burn-in.
 * @param {Record<string, any>} scene the refuge scene
 * @param {Record<string, any>} observer the observer, with its intent state current for this tick
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function sampleRefuge(scene, observer, world) {
    if (world.tick < BURN_IN_TICKS) {
        return;
    }
    const { hunterSpec } = observer.intent;
    for (let slot = 0; slot < world.alive.length; slot++) {
        const prey = world.alive[slot] === 1 && hunterSpec[world.spec[slot]] !== 1;
        if (prey) {
            sampleSlot(scene, { observer, world }, slot);
        } else if (scene.known[slot] === 1) {
            flush(scene, slot);
        }
    }
}

/**
 * @param {Uint32Array} dwell the dwell histogram
 * @param {number} total the dwells counted
 * @returns {number} the median dwell in ticks, to the sample interval
 */
function medianDwell(dwell, total) {
    let seen = 0;
    for (let bucket = 0; bucket < dwell.length; bucket++) {
        seen += dwell[bucket];
        if (2 * seen >= total) {
            return bucket * SAMPLE_TICKS;
        }
    }
    return (dwell.length - 1) * SAMPLE_TICKS;
}

/**
 * @param {Record<string, any>} scene the refuge scene
 * @returns {import('./metrics-stats.js').MetricRecord} the four refuge metrics
 */
export function refugeMetrics(scene) {
    const [calmN, threatN] = scene.episodes;
    const enough = calmN >= MIN_REFUGE_EPISODES && threatN >= MIN_REFUGE_EPISODES;
    const few = `fewer than ${MIN_REFUGE_EXITS} ring exits after burn-in`;
    return {
        'eval.refuge_prey_use_under_threat':
            scene.threatened > 0 && scene.calm > 0
                ? ok(scene.threatenedIn / scene.threatened - scene.calmIn / scene.calm)
                : none('no threatened and calm prey sample after burn-in'),
        'eval.refuge_episode_entry': enough
            ? ok(scene.entered[THREAT] / threatN - scene.entered[CALM] / calmN)
            : none(`fewer than ${MIN_REFUGE_EPISODES} threatened and calm episodes after burn-in`),
        'eval.refuge_dwell_ticks':
            scene.dwells >= MIN_REFUGE_EXITS ? ok(medianDwell(scene.dwell, scene.dwells)) : none(few),
        'eval.refuge_exit_fed': scene.exits >= MIN_REFUGE_EXITS ? ok(scene.exitsFed / scene.exits) : none(few),
    };
}
