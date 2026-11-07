// The name a developer sees for each effect record: the worker's effect kinds by name, a death by its cause, a birth
// by its cause, and the renderer's client kinds. Built once per world from `ready.layout`, so naming allocates nothing.

import { CLIENT_KIND } from './client-kinds.js';

const CLIENT_NAMES = Object.freeze({
    [CLIENT_KIND.MEAL]: 'EAT',
    [CLIENT_KIND.SICK]: 'SICK+',
    [CLIENT_KIND.CURED]: 'SICK-',
    [CLIENT_KIND.INFECTED]: 'INF+',
    [CLIENT_KIND.RECOVERED]: 'INF-',
});
const CAUSE_SHIFT = 8;
const CAUSE_MASK = 255;

/**
 * @param {Record<string, number> | undefined} table name by number, as `ready.layout` holds it
 * @returns {string[]} the names by number
 */
function invert(table) {
    /** @type {string[]} */
    const out = [];
    for (const [name, n] of Object.entries(table ?? {})) {
        out[n] = name;
    }
    return out;
}

/**
 * @typedef {object} FxNames
 * @property {Record<number, string>} kinds effect kind names, worker and client
 * @property {string[]} deaths death cause names by number
 * @property {string[]} births birth cause names by number
 * @property {number} died the `DIED` kind
 * @property {number} born the `BORN` kind
 */

/**
 * @param {Record<string, any>} layout `ready.layout`
 * @returns {FxNames} the names
 */
export function createFxNames(layout) {
    /** @type {Record<number, string>} */
    const kinds = { ...CLIENT_NAMES };
    invert(layout.effectKinds).forEach((name, n) => {
        kinds[n] = name;
    });
    return {
        kinds,
        deaths: invert(layout.deathCauses),
        births: invert(layout.bornCauses),
        died: layout.effectKinds?.DIED ?? -1,
        born: layout.effectKinds?.BORN ?? -1,
    };
}

/**
 * @param {FxNames} names the names
 * @param {{kind: number, c: number, d: number}} effect an effect record
 * @returns {string} its name: a death by cause (`EATEN`), a birth by cause (`SPLIT`), else the kind (`BITE`)
 */
export function nameOf(names, effect) {
    if (effect.kind === names.died) {
        return names.deaths[(effect.c >>> CAUSE_SHIFT) & CAUSE_MASK] ?? 'DIED';
    }
    if (effect.kind === names.born) {
        return names.births[effect.d] ?? 'BORN';
    }
    return names.kinds[effect.kind] ?? `KIND ${effect.kind}`;
}
