// The shape of one `specialisations` entry: the key order that fixes the indices, the fields and each field's rule.

import { BOOL, num, positive } from './config-rules.js';

/** @typedef {import('./config-rules.js').Rule} Rule */

export const SPECIALISATION_KEYS = ['forager', 'predator', 'reproducer', 'scout', 'defender'];

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
});
