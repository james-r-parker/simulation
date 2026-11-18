// Per-life blind-bite accounting for the hunters of a running world (honest-budgets Phase 6, E192). Each tick after the step it
// reads every alive hunter: a tick with `BITE` above 0 is a bite-hold tick, and one with no body in the jaws (`jawsStamp` is not
// `world.tick`, as `scene-strike-miss.js` reads it) is a blind tick. A life is keyed by genome id and keeps its parents, birth
// source, the `BITE` output bias it was born with and its blind share over its first `EARLY_TICKS` ticks. Diagnostic only: it
// reads the world and writes only itself, and allocates per life, so it belongs in a replay script and never in a hot path.

import {
    GENE_OUTPUTS,
    OUTPUT_COUNT,
    OUTPUT_INDEX,
    POOLED_CHANNELS,
    POOLED_STRIDE,
    RAY_CHANNELS,
} from '../sim/brain-layout.js';

/** The ticks of a life that count as its start. */
export const EARLY_TICKS = 300;

/** `BIRTH_SOURCE` code to name, in the order of `js/sim/hunter-ledger.js`. */
export const SOURCE_NAMES = Object.freeze([
    'initial',
    'mate',
    'split',
    'floor',
    'immigrant',
    'spec-flip',
    'mate-hunter-parent',
    'split-hunter-parent',
]);

/**
 * @typedef {object} BiteLife one hunter life as the tracker saw it
 * @property {number} id the genome id
 * @property {number} parentA the first parent's genome id, 0 for none
 * @property {number} parentB the second parent's genome id, 0 for none
 * @property {string} source the birth source name
 * @property {number} born the first tick the tracker saw it
 * @property {number} last the last tick the tracker saw it alive
 * @property {number} ticks ticks seen alive
 * @property {number} hold ticks holding `BITE` above 0
 * @property {number} blind ticks holding `BITE` above 0 with no body in the jaws
 * @property {number} blindUnseen blind ticks with no ray showing prey (nothing it could bite in view): a strike at air, not a
 *   hold while closing on a target
 * @property {number} earlyTicks ticks seen in its first `EARLY_TICKS`
 * @property {number} earlyBlind blind ticks among them
 * @property {number} bias the weight of the `BITE` output bias at birth
 * @property {number} preyBite the skip weight from the strength of the strongest prey hit to `BITE` at birth (the weight
 *   `applyHunterReflex` raises for a spec-flip child)
 */

const BITE_GENE = GENE_OUTPUTS.indexOf(OUTPUT_INDEX.BITE);
/** The raw ray channel "I can bite it" (proximity, food, can bite me, I can bite it). */
const CAN_BITE_IT = 3;
const PREY_STRENGTH = POOLED_CHANNELS.indexOf('prey') * POOLED_STRIDE;

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot a hunter that was just born
 * @returns {BiteLife} its empty life
 */
function openLife(world, slot) {
    const { layout } = world;
    const row = slot * layout.weightCount;
    return {
        id: world.genomeId[slot],
        parentA: world.parentA[slot],
        parentB: world.parentB[slot],
        source: SOURCE_NAMES[world.birthSource[slot]],
        born: world.tick,
        last: world.tick,
        ticks: 0,
        hold: 0,
        blind: 0,
        blindUnseen: 0,
        earlyTicks: 0,
        earlyBlind: 0,
        bias: world.weights[row + layout.bOut + BITE_GENE],
        preyBite: world.weights[row + layout.wSkip + PREY_STRENGTH * layout.geneOutputs + BITE_GENE],
    };
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot an alive agent
 * @returns {boolean} whether any of its rays shows something it can bite
 */
function preyInView(world, slot) {
    const { rawInputCount } = world.layout;
    const rays = world.config.rayCount;
    for (let ray = 0; ray < rays; ray++) {
        if (world.inputs[slot * rawInputCount + ray * RAY_CHANNELS + CAN_BITE_IT] > 0) {
            return true;
        }
    }
    return false;
}

/**
 * Adds this tick of a hunter to its life.
 * @param {BiteLife} life the hunter's life
 * @param {Record<string, any>} world the world after the step
 * @param {number} slot the hunter's slot
 * @returns {void}
 */
function tally(life, world, slot) {
    const holding = world.outputs[slot * OUTPUT_COUNT + OUTPUT_INDEX.BITE] > 0;
    const blind = holding && world.jawsStamp[slot] !== world.tick;
    life.last = world.tick;
    life.ticks += 1;
    life.hold += holding ? 1 : 0;
    life.blind += blind ? 1 : 0;
    life.blindUnseen += blind && !preyInView(world, slot) ? 1 : 0;
    if (life.ticks <= EARLY_TICKS) {
        life.earlyTicks += 1;
        life.earlyBlind += blind ? 1 : 0;
    }
}

/**
 * @returns {{observe: (world: Record<string, any>) => void, lives: () => BiteLife[], endTick: () => number}} a tracker:
 *   `observe` after each step, `lives` every life seen (alive ones have `last` equal to `endTick()`)
 */
export function createBlindBiteTracker() {
    /** @type {Map<number, BiteLife>} */
    const byId = new Map();
    let end = 0;

    /**
     * @param {Record<string, any>} world the world
     * @param {number} slot an alive hunter
     * @returns {BiteLife} its life, created on first sight
     */
    function lifeOf(world, slot) {
        const id = world.genomeId[slot];
        let life = byId.get(id);
        if (life === undefined) {
            life = openLife(world, slot);
            byId.set(id, life);
        }
        return life;
    }

    return {
        observe(world) {
            end = world.tick;
            for (let slot = 0; slot < world.alive.length; slot++) {
                if (world.alive[slot] !== 1 || world.huntBySpec[world.spec[slot]] !== 1) {
                    continue;
                }
                tally(lifeOf(world, slot), world, slot);
            }
        },
        lives: () => [...byId.values()],
        endTick: () => end,
    };
}
