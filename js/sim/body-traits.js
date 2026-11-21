// The trait registry (docs/designs/body-genes.md, "The trait system"): every heritable body trait is one entry of
// `TRAITS`, naming the lanes its gene shifts and the lanes its paired cost moves. The birth, the mutation, the
// detectors and the calculator loop over the registry and name no trait. `applyTraits` writes the lanes of one birth.

import { LANES } from './body-lanes.js';
import { TRAIT_SLOTS } from './brain-layout.js';
import { detExp, detLog, detTanh } from './det-math.js';
import { SPEC_COUNT, SPEC_NAMES } from './specs.js';

/**
 * @typedef {object} TraitEffect
 * @property {string} lane a lane of `LANES`
 * @property {number} power the lane is multiplied by `r^power` (a `ratio` trait) or shifted by `span x tanh(g) x power`
 *   (an `offset` trait)
 */

/**
 * @typedef {object} TraitCost
 * @property {string} lane a lane of `LANES`
 * @property {string} exponentKey the config key holding the exponent `k`; 0 is no cost
 * @property {1 | -1} sign the lane is multiplied by `r^(sign x k)`
 */

/**
 * @typedef {object} Trait
 * @property {string} name the trait's name: the key of a spec's `genes` menu and of every report
 * @property {number} index the gene's offset from `traitStart`, append-only
 * @property {'ratio' | 'offset' | 'raw'} kind `ratio`: `r = 1 + span x tanh(g)`; `offset`: `span x tanh(g)` in the
 *   trait's unit; `raw`: the reader takes the gene itself and the span is not read (`learn`)
 * @property {readonly TraitEffect[]} effects the lanes the gene shifts
 * @property {readonly TraitCost[]} costs the lanes its paired cost moves
 * @property {'either' | 'blend'} inherit `either`: the child takes the gene whole from one parent; `blend`: the mean
 * @property {number} sigmaScale the mutation step as a multiple of `traitMutationSigma`
 * @property {boolean} budget whether role-budget.md reads the trait
 * @property {string} describe one line for the inspector and the generated table
 */

/** The largest span of a `ratio` trait: `r` stays inside 0.5 to 1.5. */
export const MAX_TRAIT_SPAN = 0.5;

/** The largest span of an `offset` trait, in degrees (`heatBand`). */
export const MAX_OFFSET_SPAN = 20;

/** The span of the four traits that are read today, in every spec's default menu. */
export const EXISTING_SPAN = 0.3;

/** The six temperature thresholds a `heatBand` gene shifts together. */
const THRESHOLDS = LANES.filter((lane) => lane.kind === 'offset').map((lane) => lane.name);

/**
 * @param {number} index the gene's offset
 * @param {string} name the trait's name
 * @param {Array<[string, number]>} effects the lanes and their powers
 * @param {string} describe the one-line description
 * @returns {Readonly<Trait>} the frozen entry, with the default inheritance, scale and no cost
 */
function entry(index, name, effects, describe) {
    return Object.freeze({
        name,
        index,
        kind: /** @type {const} */ ('ratio'),
        effects: Object.freeze(effects.map(([lane, power]) => Object.freeze({ lane, power }))),
        costs: Object.freeze([]),
        inherit: /** @type {const} */ ('either'),
        sigmaScale: 1,
        budget: false,
        describe,
    });
}

/**
 * @param {Trait['kind']} kind how the gene is read
 * @param {Readonly<Trait>} trait an entry
 * @returns {Readonly<Trait>} the entry with that kind
 */
const withKind = (kind, trait) => Object.freeze({ ...trait, kind });

/** The traits role-budget.md reads (body-genes.md, "The calculator reads the menu"). */
const BUDGET_TRAITS = new Set(['vision', 'speed', 'sprintStore', 'fat', 'size', 'burn', 'heatBand']);

/**
 * @param {Array<[string, string, 1 | -1]>} costs each cost lane, its exponent key and its sign
 * @param {Readonly<Trait>} trait an entry
 * @returns {Readonly<Trait>} the entry with those paired costs
 */
const withCosts = (costs, trait) =>
    Object.freeze({
        ...trait,
        costs: Object.freeze(costs.map(([lane, exponentKey, sign]) => Object.freeze({ lane, exponentKey, sign }))),
    });

/** @type {readonly Readonly<Trait>[]} the entries, in gene order, before `budget` is marked */
const ENTRIES = Object.freeze([
    withCosts([['maxTurn', 'sizeTurn', -1]], entry(0, 'size', [['baseSize', 1]], 'body size')),
    entry(1, 'vision', [['visionRange', 1]], 'ray length'),
    entry(2, 'childShare', [['childEnergyShare', 1]], 'the share of energy a mother gives a child'),
    withKind('raw', entry(3, 'learn', [], 'the Hebbian rate multiplier')),
    withCosts(
        [['temperatureGainMove', 'speedHeat', 1]],
        entry(
            4,
            'speed',
            [
                ['maxVelocity', 1],
                ['maxThrust', 1],
            ],
            'speed cap and thrust',
        ),
    ),
    withCosts(
        [['sprintHeat', 'sprintStoreHeat', 1]],
        entry(
            5,
            'sprintStore',
            [
                ['sprintDrain', -1],
                ['sprintRefill', -1],
            ],
            'length of a sprint burst and refill',
        ),
    ),
    withCosts([['fatSlowShare', 'fatSlow', 1]], entry(6, 'fat', [['maxEnergy', 1]], 'the energy store')),
    withKind(
        'offset',
        entry(
            7,
            'heatBand',
            THRESHOLDS.map((name) => [name, 1]),
            'the six temperature thresholds, in degrees',
        ),
    ),
    withCosts(
        [['maxThrust', 'burnThrust', 1]],
        entry(
            8,
            'burn',
            [
                ['passiveLoss', 1],
                ['sprintCost', 1],
            ],
            'standing and sprint energy burn',
        ),
    ),
    entry(9, 'hearing', [['hearing', 1]], 'the distance at which a call is heard'),
    entry(
        10,
        'nose',
        [
            ['antennaReach', 1],
            ['refugeSenseRange', 1],
        ],
        'scent and refuge sense reach',
    ),
    withCosts(
        [['visionRange', 'smokeSightRange', -1]],
        entry(11, 'smokeSight', [['smokeSight', 1]], 'the share of a ray that passes through smoke'),
    ),
    entry(
        12,
        'eyesOrEars',
        [
            ['visionRange', 1],
            ['hearing', -1],
        ],
        'sight against hearing',
    ),
    entry(
        13,
        'clearOrSmoke',
        [
            ['visionRange', 1],
            ['smokeSight', -1],
        ],
        'range in the clear against smoke',
    ),
    entry(
        14,
        'agileOrFast',
        [
            ['maxTurn', 1],
            ['maxVelocity', -1],
            ['maxThrust', -1],
        ],
        'turning against speed',
    ),
    entry(
        15,
        'wideOrFar',
        [
            ['rearVisionShare', 1],
            ['visionRange', -1],
        ],
        'all-round against far sight',
    ),
    entry(
        16,
        'gut',
        [
            ['plantFoodValue', 1],
            ['meatFoodValue', -1],
        ],
        'plant against meat',
    ),
    entry(17, 'nerve', [['nerve', 1]], 'the strength of the adrenaline effects'),
]);

/** @type {readonly Readonly<Trait>[]} the named traits, in gene order */
export const TRAITS = Object.freeze(
    ENTRIES.map((trait) => (BUDGET_TRAITS.has(trait.name) ? Object.freeze({ ...trait, budget: true }) : trait)),
);

/**
 * @param {Readonly<Trait>} trait a trait
 * @returns {number} the largest span its menu may hold
 */
export const maxSpanOf = (trait) => (trait.kind === 'offset' ? MAX_OFFSET_SPAN : MAX_TRAIT_SPAN);

/**
 * @param {Readonly<Trait>} trait a trait
 * @param {number} gene its gene
 * @param {number} span its span in the spec's menu
 * @returns {number} `ratio`: `1 + span x tanh(gene)`; `offset`: `span x tanh(gene)`; `raw`: 1 (the reader takes the
 *   gene). A gene of 0 or a span of 0 gives 1 (0 for an offset)
 */
export function traitRatio(trait, gene, span) {
    if (trait.kind === 'raw') {
        return 1;
    }
    const shift = span * detTanh(gene);
    return trait.kind === 'offset' ? shift : 1 + shift;
}

/**
 * Says what is wrong with a spec's `genes` menu.
 * @param {unknown} genes the `genes` value
 * @param {readonly Readonly<Trait>[]} [traits] the registry (a parameter for tests)
 * @returns {string | null} what was expected, or null when the menu is valid
 */
export function geneMenuProblem(genes, traits = TRAITS) {
    if (genes === null || typeof genes !== 'object' || Array.isArray(genes)) {
        return 'an object from a trait name to a span';
    }
    for (const [name, span] of Object.entries(genes)) {
        const trait = traits.find((candidate) => candidate.name === name);
        if (trait === undefined) {
            return `a trait name of the registry (${name} is not one)`;
        }
        if (typeof span !== 'number' || !(span >= 0 && span <= maxSpanOf(trait))) {
            return `a span from 0 to ${maxSpanOf(trait)} at ${name}`;
        }
    }
    return null;
}

/**
 * @param {Readonly<Record<string, any>>} config the validated config
 * @returns {Float64Array} every spec's span for every trait slot, `TRAIT_SLOTS` per spec in index order, 0 in a spare
 *   slot (a validated config holds a span for every named trait: a partial menu is filled from the defaults)
 */
export function spanTable(config) {
    const table = new Float64Array(SPEC_COUNT * TRAIT_SLOTS);
    SPEC_NAMES.forEach((specName, spec) => {
        for (const trait of TRAITS) {
            table[spec * TRAIT_SLOTS + trait.index] = config.specialisations[specName].genes[trait.name];
        }
    });
    return table;
}

/**
 * @param {number} ratio `r`, above 0
 * @param {number} power the exponent
 * @returns {number} `r^power`, exact for 1 and -1
 */
function raise(ratio, power) {
    if (power === 1) {
        return ratio;
    }
    return power === -1 ? 1 / ratio : detExp(power * detLog(ratio));
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot the slot
 * @param {Readonly<Trait>} trait a trait whose span is above 0 for the slot's spec
 * @param {number} r the trait's ratio (its shift for an `offset` trait)
 * @returns {void}
 */
export function applyOne(world, slot, trait, r) {
    const { lanes, config } = world;
    for (let e = 0; e < trait.effects.length; e++) {
        const { lane, power } = trait.effects[e];
        lanes[lane][slot] =
            trait.kind === 'offset' ? lanes[lane][slot] + r * power : lanes[lane][slot] * raise(r, power);
    }
    for (let c = 0; c < trait.costs.length; c++) {
        const { lane, exponentKey, sign } = trait.costs[c];
        const exponent = config[exponentKey];
        lanes[lane][slot] *= exponent === 0 ? 1 : raise(r, sign * exponent);
    }
}

/**
 * Applies the traits of a born slot to its lanes: every lane becomes its base times the product of `r^power` over the
 * traits that name it (the thresholds are shifted by the sum), and each paired cost lane is multiplied by
 * `r^(sign x exponent)`. Run after `writeLaneBases`. A trait whose span is 0 for the slot's spec is skipped, so a world
 * with every span 0 keeps every lane at its base. Allocates nothing.
 * @param {Record<string, any>} world the world
 * @param {number} slot the slot, its `spec` and `weights` row written and its lanes at base
 * @param {readonly Readonly<Trait>[]} [traits] the registry (a parameter for tests)
 * @returns {void}
 */
export function applyTraits(world, slot, traits = TRAITS) {
    const { layout, weights, traitSpans } = world;
    const genes = slot * layout.weightCount + layout.traitStart;
    for (let t = 0; t < traits.length; t++) {
        const trait = traits[t];
        const span = traitSpans[world.spec[slot] * TRAIT_SLOTS + trait.index];
        if (span !== 0) {
            applyOne(world, slot, trait, traitRatio(trait, weights[genes + trait.index], span));
        }
    }
}
