// The `specialisations` config: the key order that fixes the indices, the fields, each field's rule and the defaults.

import { EXISTING_SPAN, TRAITS } from './body-traits.js';
import { BOOL, num, positive } from './config-rules.js';
import { SPEC_NAMES } from './specs.js';

/** @typedef {import('./config-rules.js').Rule} Rule */

/** The specialisation keys, in index order: a copy of `SPEC_NAMES`. */
export const SPECIALISATION_KEYS = [...SPEC_NAMES];

/** The fields of an entry, `index` first (it is fixed by key order and has no rule). */
export const SPECIALISATION_FIELDS = [
    'index',
    'visionRange',
    'canHunt',
    'moveCostMultiplier',
    'biteTakenMultiplier',
    'cooldownMultiplier',
    'biteMultiplier',
    'turnMultiplier',
    'plantFoodValue',
    'meatFoodValue',
    'sprintBoost',
    'passiveLossMultiplier',
    'splitMinEnergyMultiplier',
    'kickMultiplier',
    'maxEnergyMultiplier',
    'rearVisionShare',
    'sprintDrainMultiplier',
    'body',
    'genes',
];

/** @type {Record<string, Rule>} the rule of every field after `index` */
export const SPEC_FIELD_RULES = Object.fromEntries(SPECIALISATION_FIELDS.slice(1).map((field) => [field, positive()]));
Object.assign(SPEC_FIELD_RULES, {
    canHunt: BOOL,
    plantFoodValue: num(0, 1),
    meatFoodValue: num(0, 1),
    passiveLossMultiplier: { type: 'num', gt: 0, max: 2 },
    splitMinEnergyMultiplier: num(0.25, 2),
    maxEnergyMultiplier: num(0.25, 10),
    rearVisionShare: num(0, 1),
    body: { type: 'bodyMap' },
    genes: { type: 'geneMenu' },
});

/** The per-field defaults of every specialisation, in `SPECIALISATION_KEYS` order, before `body` is added. */
const FIELD_DEFAULTS = {
    // AGENT_CONFIGS maxRayDist; modifiers: SCOUT_ENERGY_COST_MULTIPLIER, DEFENDER_DAMAGE_REDUCTION, new
    forager: {
        index: 0,
        visionRange: 300,
        canHunt: false,
        moveCostMultiplier: 1,
        biteTakenMultiplier: 1,
        cooldownMultiplier: 1,
        biteMultiplier: 1,
        turnMultiplier: 1,
        plantFoodValue: 1, // new: share of a food item's energy this specialisation gains (world-balance.md T45)
        meatFoodValue: 0.3, // new: share of a carcass's energy this specialisation gains (world-balance.md T54)
        sprintBoost: 1,
        passiveLossMultiplier: 1, // new: scales the standing (passive, size and vision) energy loss (fitness-and-selection T15f)
        splitMinEnergyMultiplier: 1, // new: scales splitMinEnergy for this specialisation (fitness-and-selection T15f)
        kickMultiplier: 1, // natural-selection T5a: scales the kick a biter takes when it bites this specialisation
        maxEnergyMultiplier: 1, // new: scales maxEnergy, this specialisation's energy store (gorge-and-fast predator)
        rearVisionShare: 1, // senses-and-motor Phase 5: the share of visionRange the ray behind keeps (1 = all-round eye)
        sprintDrainMultiplier: 1, // fair-chase Phase 1: scales sprintDrain for this specialisation (read only with sprintStoreEnabled)
    },
    predator: {
        index: 1,
        visionRange: 400, // senses-and-motor E186: the hunter sees furthest, the scout alone equal (was 350)
        canHunt: true,
        moveCostMultiplier: 1,
        biteTakenMultiplier: 1,
        cooldownMultiplier: 1,
        biteMultiplier: 20, // survival screen (instinct, inst1-gorge-bite20): decisive bites, a predator lands a kill in few bites like a big cat's neck bite (was 8, tuned T15o E47)
        turnMultiplier: 0.7,
        plantFoodValue: 0, // new: share of a food item's energy this specialisation gains; 0 for predators (world-balance.md T45, from T41)
        meatFoodValue: 1, // new: share of a carcass's energy this specialisation gains (world-balance.md T54)
        sprintBoost: 1.6,
        passiveLossMultiplier: 0.2, // honest-budgets E175 (was 0.3): gorge and fast, a predator rests cheaply between meals like a python, now that a kill no longer mints 600 (was 0.6, T15d; scales the standing energy loss, T15f)
        splitMinEnergyMultiplier: 0.6, // tuned, fitness-and-selection T15d (scales splitMinEnergy for this specialisation, T15f)
        kickMultiplier: 1, // natural-selection T5a: scales the kick a biter takes when it bites this specialisation
        maxEnergyMultiplier: 5, // survival screen (instinct, inst1-gorge-bite20): a 3x fat store (5x from E103), so a big meal carries a predator across the fast between kills like a lion's // new: scales maxEnergy, this specialisation's energy store (gorge-and-fast predator)
        rearVisionShare: 0.4, // senses-and-motor E186: forward, long-range eyes; the ray behind keeps 0.4 of the range
        sprintDrainMultiplier: 1, // fair-chase Phase 1: scales sprintDrain for this specialisation (read only with sprintStoreEnabled)
    },
    reproducer: {
        index: 2,
        visionRange: 250,
        canHunt: false,
        moveCostMultiplier: 1,
        biteTakenMultiplier: 1,
        cooldownMultiplier: 0.5,
        biteMultiplier: 1,
        turnMultiplier: 1,
        plantFoodValue: 1, // new: share of a food item's energy this specialisation gains (world-balance.md T45)
        meatFoodValue: 0.3, // new: share of a carcass's energy this specialisation gains (world-balance.md T54)
        sprintBoost: 1,
        passiveLossMultiplier: 1, // new: scales the standing (passive, size and vision) energy loss (fitness-and-selection T15f)
        splitMinEnergyMultiplier: 1, // new: scales splitMinEnergy for this specialisation (fitness-and-selection T15f)
        kickMultiplier: 1, // natural-selection T5a: scales the kick a biter takes when it bites this specialisation
        maxEnergyMultiplier: 1, // new: scales maxEnergy, this specialisation's energy store (gorge-and-fast predator)
        rearVisionShare: 1,
        sprintDrainMultiplier: 1, // fair-chase Phase 1: scales sprintDrain for this specialisation (read only with sprintStoreEnabled)
    },
    scout: {
        index: 3,
        visionRange: 400,
        canHunt: false,
        moveCostMultiplier: 1, // natural-selection: no longer cheaper to move (was 0.7)
        biteTakenMultiplier: 1.5, // natural-selection: the scout pays for far sight, every bite on it lands 1.5 times harder (was 1)
        cooldownMultiplier: 1,
        biteMultiplier: 1,
        turnMultiplier: 1,
        plantFoodValue: 1, // new: share of a food item's energy this specialisation gains (world-balance.md T45)
        meatFoodValue: 0.3, // new: share of a carcass's energy this specialisation gains (world-balance.md T54)
        sprintBoost: 1,
        passiveLossMultiplier: 1.3, // natural-selection: the scout pays 30% more to stand (was 1); new: scales the standing (passive, size and vision) energy loss (fitness-and-selection T15f)
        splitMinEnergyMultiplier: 1, // new: scales splitMinEnergy for this specialisation (fitness-and-selection T15f)
        kickMultiplier: 1, // natural-selection T5a: scales the kick a biter takes when it bites this specialisation
        maxEnergyMultiplier: 1, // new: scales maxEnergy, this specialisation's energy store (gorge-and-fast predator)
        rearVisionShare: 1,
        sprintDrainMultiplier: 1, // fair-chase Phase 1: scales sprintDrain for this specialisation (read only with sprintStoreEnabled)
    },
    defender: {
        index: 4,
        visionRange: 300, // senses-and-motor E186: below the hunter (was 350)
        canHunt: false,
        moveCostMultiplier: 1.2, // natural-selection: the defender is costly to be, a fifth more to move (was 1)
        biteTakenMultiplier: 0.5,
        cooldownMultiplier: 1,
        biteMultiplier: 1,
        turnMultiplier: 1,
        plantFoodValue: 1, // new: share of a food item's energy this specialisation gains (world-balance.md T45)
        meatFoodValue: 0.3, // new: share of a carcass's energy this specialisation gains (world-balance.md T54)
        sprintBoost: 1,
        passiveLossMultiplier: 1, // new: scales the standing (passive, size and vision) energy loss (fitness-and-selection T15f)
        splitMinEnergyMultiplier: 1, // new: scales splitMinEnergy for this specialisation (fitness-and-selection T15f)
        kickMultiplier: 2, // natural-selection T5a: a bite on a defender costs the biter twice the kick
        maxEnergyMultiplier: 1, // new: scales maxEnergy, this specialisation's energy store (gorge-and-fast predator)
        rearVisionShare: 0.8, // senses-and-motor E186
        sprintDrainMultiplier: 1, // fair-chase Phase 1: scales sprintDrain for this specialisation (read only with sprintStoreEnabled)
    },
};

/** The traits read today, which have a span in every default menu; every other trait is fixed (span 0). */
const READ_TODAY = ['size', 'vision', 'childShare', 'learn'];

/** @returns {Record<string, number>} a default `genes` menu: every trait of the registry, the four read today at 0.3 */
const defaultMenu = () =>
    Object.fromEntries(TRAITS.map((trait) => [trait.name, READ_TODAY.includes(trait.name) ? EXISTING_SPAN : 0]));

/**
 * The default entry of every specialisation, in `SPECIALISATION_KEYS` order (frozen with `DEFAULTS`). `body` is a lane
 * name to a multiplier of that lane for the specialisation (`bodyProblem`, body-lanes.js): empty for the hunter, and
 * for a body that cannot hunt the three hunter-only costs at 0 (the `canHunt` tests they replace: a lane at 0 is free,
 * and no such body reaches them). `genes` is the gene menu: a trait name to its span (`geneMenuProblem`, body-traits.js).
 */
export const SPECIALISATION_DEFAULTS = Object.fromEntries(
    Object.entries(FIELD_DEFAULTS).map(([name, fields]) => [
        name,
        {
            ...fields,
            body: fields.canHunt ? {} : { huntUpkeep: 0, predatorRestTicks: 0, strikeMissCost: 0 },
            genes: defaultMenu(),
        },
    ]),
);
