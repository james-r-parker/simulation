// Innate instincts for a random genome: a reflex prior written into the skip block and the output biases. Nature never
// starts from a random brain; an animal is born pouncing, fleeing, approaching food and keeping quiet, and evolution
// refines that. Children inherit and mutate the prior like any other weights. No draws: the terms are added after the
// random fill, so the stream is the same at any `instinctWeight`, and at 0 the genome is bit-identical.

import { GENE_OUTPUTS, HIT_STRIDE, OUTPUT_INDEX, POOLED_CHANNELS, POOLED_STRIDE } from '../sim/brain-layout.js';
import { specParams } from '../sim/spec-params.js';
import { WEIGHT_CLAMP, randomWeights } from './mutation.js';

/** Bias of a call output at weight 1, per unit of weight: the newborn is silent (tanh(-2) is -0.96). */
const SILENT_BIAS = -2;
/** The bite reflex is twice the approach reflex: a closing predator bites what is in front of it. */
const BITE_SHARE = 2;

/**
 * Adds `amount` to one skip weight (strength, cosine or sine of a channel's strongest hit, into an output), clamped.
 * @param {Float32Array} row the weight row
 * @param {Readonly<Record<string, any>>} layout a `brainLayout(config)` result
 * @param {{channel: string, part: number, output: number, amount: number}} term which weight and how much;
 *   `part` is 0 strength, 1 cosine, 2 sine
 * @returns {void}
 */
function addSkip(row, layout, { channel, part, output, amount }) {
    const input = POOLED_CHANNELS.indexOf(channel) * POOLED_STRIDE + part;
    const i = layout.wSkip + input * layout.geneOutputs + GENE_OUTPUTS.indexOf(output);
    row[i] = Math.max(-WEIGHT_CLAMP, Math.min(WEIGHT_CLAMP, row[i] + amount));
}

/** Sine (part 2) of the strongest hit: positive is the positive turn side, checked in `test/evo/instinct.test.js`. */
const STRENGTH = 0;
const SINE = HIT_STRIDE - 1;

/**
 * Raises one skip weight to at least `floor`, clamped. A floor, not an addition, so a repeated call changes nothing.
 * @param {Float32Array} row the weight row
 * @param {Readonly<Record<string, any>>} layout a `brainLayout(config)` result
 * @param {{channel: string, part: number, output: number, floor: number}} term which weight and its floor
 * @returns {void}
 */
function floorSkip(row, layout, { channel, part, output, floor }) {
    const input = POOLED_CHANNELS.indexOf(channel) * POOLED_STRIDE + part;
    const i = layout.wSkip + input * layout.geneOutputs + GENE_OUTPUTS.indexOf(output);
    row[i] = Math.max(row[i], Math.min(WEIGHT_CLAMP, floor));
}

/**
 * The hunter's reflexes on a row, in place (hunter-learning.md T6). The prey terms (thrust and turn towards prey, and bite it,
 * each added and clamped) are the hunter branch of `applyInstinct`; the kin pull raises the `kin` strength-to-thrust and
 * sine-to-turn cells to at least `kinPull` x `weight` (a floor, so repeated calls do not accumulate). Draws nothing.
 * @param {Float32Array} row the weight row
 * @param {Readonly<Record<string, any>>} layout a `brainLayout(config)` result
 * @param {{weight: number, prey: boolean, kinPull: number}} options `weight` is `config.instinctWeight`; `prey` adds the prey
 *   terms; `kinPull` is `kinPullWeight` for the floor, 0 for none
 * @returns {void}
 */
export function applyHunterReflex(row, layout, { weight, prey, kinPull }) {
    const { THRUST, TURN, BITE } = OUTPUT_INDEX;
    if (prey) {
        addSkip(row, layout, { channel: 'prey', part: STRENGTH, output: THRUST, amount: weight });
        addSkip(row, layout, { channel: 'prey', part: SINE, output: TURN, amount: weight });
        addSkip(row, layout, { channel: 'prey', part: STRENGTH, output: BITE, amount: BITE_SHARE * weight });
    }
    if (kinPull > 0 && weight > 0) {
        floorSkip(row, layout, { channel: 'kin', part: STRENGTH, output: THRUST, floor: kinPull * weight });
        floorSkip(row, layout, { channel: 'kin', part: SINE, output: TURN, floor: kinPull * weight });
    }
}

/**
 * Adds the reflexes to a random row in place, scaled by `weight`. Every body: thrust and turn towards food, and (a
 * non-hunter) thrust and turn away from a threat; every body thrusts and turns away from megafauna at `herdWary` x
 * weight. A hunter: thrust, turn towards and bite prey (`applyHunterReflex`), and under `kinPull` a floor on the kin cells. Every body: the alarm, hunt-call and smoke biases start at -2 x weight.
 * @param {Float32Array} row the weight row (a random genome)
 * @param {Readonly<Record<string, any>>} layout a `brainLayout(config)` result
 * @param {{weight: number, canHunt: boolean, herdWary: number, kinPull?: number}} options `weight` is
 *   `config.instinctWeight`; 0 or `herdWary` 0 leaves its corresponding terms unchanged; `kinPull` (default 0) is the kin pull
 *   floor of a hunter, `kinPullWeight`
 * @returns {void}
 */
export function applyInstinct(row, layout, { weight, canHunt, herdWary, kinPull = 0 }) {
    if (weight === 0) {
        return;
    }
    const w = weight;
    const { THRUST, TURN, ALARM, HUNT, SMOKE } = OUTPUT_INDEX;
    addSkip(row, layout, { channel: 'food', part: STRENGTH, output: THRUST, amount: w });
    addSkip(row, layout, { channel: 'food', part: SINE, output: TURN, amount: w });
    if (canHunt) {
        applyHunterReflex(row, layout, { weight: w, prey: true, kinPull });
    } else {
        addSkip(row, layout, { channel: 'threat', part: STRENGTH, output: THRUST, amount: w });
        addSkip(row, layout, { channel: 'threat', part: SINE, output: TURN, amount: -w });
    }
    addSkip(row, layout, { channel: 'megafauna', part: STRENGTH, output: THRUST, amount: herdWary * w });
    addSkip(row, layout, { channel: 'megafauna', part: SINE, output: TURN, amount: -herdWary * w });
    for (const output of [ALARM, HUNT, SMOKE]) {
        const i = layout.bOut + GENE_OUTPUTS.indexOf(output);
        row[i] = Math.max(-WEIGHT_CLAMP, SILENT_BIAS * w);
    }
}

/**
 * A random genome for a new agent: `randomWeights`, then the instinct for the agent's specialisation.
 * @param {Record<string, any>} world the world (`config`, `layout`, `spec`)
 * @param {number} slot the agent, whose `spec` is already set
 * @param {{row: Float32Array, rng: import('../sim/rng.js').Rng}} target the row to fill and the `brain-init` stream
 * @returns {void}
 */
export function randomGenome(world, slot, { row, rng }) {
    const { config, layout } = world;
    randomWeights(row, layout, rng, config.leakGeneStart);
    applyInstinct(row, layout, {
        weight: config.instinctWeight,
        herdWary: config.herdWary,
        canHunt: specParams(config, world.spec[slot]).canHunt,
        kinPull: config.kinPullWeight,
    });
}
