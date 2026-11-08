// The bite detectors (hunter-practice.md Phase 1c, T20 and T21): where a hunter's wish to bite goes. Each tick, over the
// alive `canHunt` agents, the body in the jaws is classified as `agentChannel` in js/sim/ray-march.js classifies it (kin
// first, then prey when `couldBite`, else other) and the brain's `BITE` output (the wish `recoil` in js/sim/feeding.js
// reads) is tallied against it.
//
// - `eval.bite_on_prey`: recall, the share of hunter-ticks with prey in the jaws with a wish above 0.
// - `eval.bite_off_kin`, `eval.bite_off_other`: the share with a wish when kin, or a body too big to take, is in the jaws.
// - `eval.bite_idle`: the share with a wish when nothing is in the jaws (biting air).
//
// The first three are `null` under 30 opportunities. Detectors only, never fitness. The tally reads the contact list the
// feed phase used, after the step: a body that died in that step (a kill, a hunter that dies) is already zeroed and is
// not counted, so the shares read the bites that did not finish the victim. A hunter with several bodies in the jaws is
// counted once, as the highest of prey, kin, other. The scratch is preallocated; nothing is allocated per tick.

import { couldBite, inJaws } from '../sim/bite-rule.js';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../sim/brain-layout.js';
import { isKin } from '../sim/kin.js';
import { none, ok } from './metrics-stats.js';

/** The fewest opportunities a bite share is reported over. */
export const BITE_MIN_OPPORTUNITIES = 30;

/** What is in a hunter's jaws, ordered by priority when several bodies are. */
export const JAWS = Object.freeze({ IDLE: 0, OTHER: 1, KIN: 2, PREY: 3 });

/**
 * @param {Readonly<Record<string, any>>} config the world's config (`maxAgents`)
 * @returns {Record<string, any>} an empty bite scene: the per-slot jaws scratch and, per `JAWS` kind, the hunter-ticks and
 *   the hunter-ticks with a wish to bite
 */
export function createBiteScene(config) {
    return {
        jaws: new Uint8Array(config.maxAgents),
        opportunities: new Float64Array(4),
        wishes: new Float64Array(4),
    };
}

/**
 * @param {Record<string, any>} scene the bite scene
 * @param {Record<string, any>} world the world
 * @param {{hunter: number, body: number}} pair the hunter and a body it touches
 * @returns {void}
 */
function mark(scene, world, { hunter, body }) {
    if (
        world.alive[hunter] !== 1 ||
        world.alive[body] !== 1 ||
        world.huntBySpec[world.spec[hunter]] !== 1 ||
        !inJaws(world, hunter, body)
    ) {
        return;
    }
    let kind = /** @type {number} */ (JAWS.OTHER);
    if (isKin(world, hunter, body)) {
        kind = JAWS.KIN;
    } else if (couldBite(world, hunter, body)) {
        kind = JAWS.PREY;
    }
    if (kind > scene.jaws[hunter]) {
        scene.jaws[hunter] = kind;
    }
}

/**
 * Tallies the tick: the body in each hunter's jaws against its wish to bite. Call it once a tick after `step`, with the
 * tick's contact list still in the world.
 * @param {Record<string, any>} scene the bite scene
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function tickBite(scene, world) {
    const { contacts, contactCount } = world;
    const { jaws } = scene;
    for (let c = 0; c < contactCount; c++) {
        mark(scene, world, { hunter: contacts[2 * c], body: contacts[2 * c + 1] });
        mark(scene, world, { hunter: contacts[2 * c + 1], body: contacts[2 * c] });
    }
    for (let slot = 0; slot < jaws.length; slot++) {
        if (world.alive[slot] === 1 && world.huntBySpec[world.spec[slot]] === 1) {
            const kind = jaws[slot];
            scene.opportunities[kind] += 1;
            scene.wishes[kind] += world.outputs[slot * OUTPUT_COUNT + OUTPUT_INDEX.BITE] > 0 ? 1 : 0;
        }
        jaws[slot] = 0;
    }
}

/**
 * @param {Record<string, any>} scene the bite scene
 * @param {number} kind a `JAWS` kind
 * @param {number} least the fewest hunter-ticks of that kind the share needs
 * @returns {import('./metrics-stats.js').MetricResult} the share of that kind's hunter-ticks with a wish
 */
function wishShare(scene, kind, least) {
    const n = scene.opportunities[kind];
    if (n < least) {
        return none(`${n} hunter-ticks with that body in the jaws (a share needs ${least})`);
    }
    return ok(scene.wishes[kind] / n);
}

/**
 * @param {Record<string, any>} scene the bite scene
 * @returns {Record<string, import('./metrics-stats.js').MetricResult>} the four bite shares
 */
export function biteMetrics(scene) {
    return {
        'eval.bite_on_prey': wishShare(scene, JAWS.PREY, BITE_MIN_OPPORTUNITIES),
        'eval.bite_off_kin': wishShare(scene, JAWS.KIN, BITE_MIN_OPPORTUNITIES),
        'eval.bite_off_other': wishShare(scene, JAWS.OTHER, BITE_MIN_OPPORTUNITIES),
        'eval.bite_idle': wishShare(scene, JAWS.IDLE, 1),
    };
}
