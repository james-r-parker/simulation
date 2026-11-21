// The calculator reads the body (docs/designs/body-genes.md, "The calculator reads the menu"): the lanes of a body whose
// traits sit at given ratios, and the corners of the menu traits a row reads. Pure. A ratio composes as `applyTraits`
// composes it: the lane times `r^power` for each trait that names it, the paired cost lane times `r^(sign x k)`, the six
// thresholds shifted by a `heatBand` shift. Every effect is off: the corners are the defaults plus the ratios.

import { HEAT_BAND, LANES } from '../sim/body-lanes.js';
import { TRAITS, applyOne } from '../sim/body-traits.js';

/** A threshold lane: a `heatBand` shift moves the six together, so any one of them reads it. */
const THRESHOLD_LANE = /** @type {string} */ (LANES.find((lane) => lane.kind === 'offset')?.name);

/**
 * @param {Readonly<Record<string, any>>} config the validated config
 * @param {string} specName a specialisation name
 * @param {Record<string, number>} traits a ratio per trait (a shift in degrees for `heatBand`); a trait left out is at 1
 *   (0 for `heatBand`)
 * @returns {void}
 * @throws {Error} on a name that is not a trait, a `raw` trait, or a ratio that is not above 0
 */
export function checkTraits(config, specName, traits) {
    if (!Object.hasOwn(config.specialisations, specName)) {
        throw new Error(`roleParams: unknown specialisation "${specName}"`);
    }
    for (const [name, value] of Object.entries(traits)) {
        const trait = TRAITS.find((candidate) => candidate.name === name);
        if (trait === undefined || trait.kind === 'raw') {
            throw new Error(`roleParams: "${name}" is not a trait with a ratio`);
        }
        if (!Number.isFinite(value) || (trait.kind === 'ratio' && value <= 0)) {
            throw new Error(`roleParams: the ratio of ${name} must be a finite number (above 0 unless it is a shift)`);
        }
    }
}

/**
 * @param {Readonly<Record<string, any>>} config the validated config
 * @param {Record<string, number>} bases a spec's lane bases (`laneBases`)
 * @param {Record<string, number>} traits a ratio per trait
 * @returns {Record<string, number>} the lanes with each trait applied by `applyTraits`' own step (`applyOne`); a trait at
 *   ratio 1 changes nothing
 */
export function lanesAt(config, bases, traits) {
    const lanes = Object.fromEntries(Object.entries(bases).map(([name, value]) => [name, [value]]));
    const world = { lanes, config };
    for (const trait of TRAITS) {
        if (Object.hasOwn(traits, trait.name)) {
            applyOne(world, 0, trait, traits[trait.name]);
        }
    }
    return Object.fromEntries(Object.entries(lanes).map(([name, column]) => [name, column[0]]));
}

/**
 * @param {Readonly<Record<string, any>>} config the validated config
 * @param {Record<string, Record<string, number>>} bySpec a ratio map per specialisation
 * @returns {Readonly<Record<string, any>>} a shallow copy of the config whose specs carry the ratios as `body` overrides
 *   (lane multipliers, and `heatBand` for the thresholds), so every reader of `laneBases` sees the corner; the config
 *   itself is not changed. Not validated: it is for the calculator, never the sim
 */
export function bakeTraits(config, bySpec) {
    const ones = Object.fromEntries(LANES.map((lane) => [lane.name, lane.kind === 'offset' ? 0 : 1]));
    const specialisations = { ...config.specialisations };
    for (const [specName, traits] of Object.entries(bySpec)) {
        const lanes = lanesAt(config, ones, traits);
        const body = { ...config.specialisations[specName].body };
        const shift = lanes[THRESHOLD_LANE];
        if (shift !== 0) {
            body[HEAT_BAND] = (body[HEAT_BAND] ?? 0) + shift;
        }
        for (const lane of LANES) {
            if (lane.kind !== 'offset' && lanes[lane.name] !== 1) {
                body[lane.name] = (body[lane.name] ?? 1) * lanes[lane.name];
            }
        }
        specialisations[specName] = { ...config.specialisations[specName], body };
    }
    return { ...config, specialisations };
}

/**
 * @param {Readonly<Record<string, any>>} config the validated config
 * @param {string} specName a specialisation name
 * @returns {string[]} the traits a row reads that the spec's menu opens (span above 0), in registry order
 */
export function menuTraits(config, specName) {
    return openTraits(config, specName).map((trait) => trait.name);
}

/**
 * @param {Readonly<Record<string, any>>} config the validated config
 * @param {string} specName a specialisation name
 * @returns {Readonly<import('../sim/body-traits.js').Trait>[]} the budget traits the spec's menu opens
 */
function openTraits(config, specName) {
    const menu = config.specialisations[specName].genes;
    return TRAITS.filter((trait) => trait.budget && menu[trait.name] > 0);
}

/**
 * Enumerates the corners of the menu: for each trait the menu opens, the ratio `1 - span` and `1 + span` (a shift of
 * minus and plus the span for `heatBand`). With no span above 0 there is one corner, the empty map: the defaults.
 * @param {Readonly<Record<string, any>>} config the validated config
 * @param {string} specName a specialisation name
 * @returns {Record<string, number>[]} the corners, the first with every trait at its low end; at most 2^7
 */
export function traitCorners(config, specName) {
    const open = openTraits(config, specName);
    const menu = config.specialisations[specName].genes;
    return Array.from({ length: 1 << open.length }, (_, corner) =>
        Object.fromEntries(
            open.map((trait, i) => {
                const span = menu[trait.name];
                const shift = (corner >> i) & 1 ? span : -span;
                return [trait.name, trait.kind === 'offset' ? shift : 1 + shift];
            }),
        ),
    );
}
