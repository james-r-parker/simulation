// Validates the six flora archetypes used by the species system.

/** Stable species indices, shared by patch and food records. */
export const FLORA_NAMES = ['grass', 'berry', 'nut', 'flower', 'fungus', 'toxiccap'];

/** Starting archetypes; energySpread is a share of the reference food energy. */
export const FLORA_DEFAULTS = {
    grass: {
        share: 5,
        energy: 0.6,
        energySpread: 0.2,
        radius: 0.8,
        yield: 1.4,
        regrow: 1.5,
        life: 6000,
        start: 0,
        span: 1,
        hue: -0.85,
        toxicity: 0,
        pollenChance: 0,
        range: 0.2,
    },
    berry: {
        share: 3,
        energy: 1.5,
        energySpread: 0.2,
        radius: 1.1,
        yield: 0.8,
        regrow: 1,
        life: 12000,
        start: 0.25,
        span: 0.3,
        hue: 0.65,
        toxicity: 0,
        pollenChance: 0.5,
        range: 0.3,
    },
    nut: {
        share: 2,
        energy: 1.8,
        energySpread: 0.2,
        radius: 1.3,
        yield: 0.5,
        regrow: 0.7,
        life: 60000,
        start: 0.5,
        span: 0.3,
        hue: -0.45,
        toxicity: 0,
        pollenChance: 0,
        range: 0.2,
    },
    flower: {
        share: 3,
        energy: 0.5,
        energySpread: 0.2,
        radius: 0.7,
        yield: 1.2,
        regrow: 1.2,
        life: 4000,
        start: 0.1,
        span: 0.4,
        hue: 0.9,
        toxicity: 0,
        pollenChance: 1,
        range: 0.4,
    },
    fungus: {
        share: 0,
        energy: 1,
        energySpread: 0.2,
        radius: 0.9,
        yield: 0,
        regrow: 0,
        life: 24000,
        start: 0.62,
        span: 0.35,
        hue: -0.2,
        toxicity: 0,
        pollenChance: 0,
        range: 0,
    },
    toxiccap: {
        share: 0,
        energy: 1.2,
        energySpread: 0.2,
        radius: 1,
        yield: 0.7,
        regrow: 0.8,
        life: 24000,
        start: 0.5,
        span: 0.35,
        hue: 0.3,
        toxicity: 0.8,
        pollenChance: 0,
        range: 0.15,
    },
};

const FIELDS = Object.keys(FLORA_DEFAULTS.grass);
const POSITIVE = ['energy', 'radius', 'life', 'span'];
const UNIT = ['toxicity', 'pollenChance', 'span'];

/**
 * @param {unknown} value the supplied object
 * @param {string[]} keys the required keys
 * @param {string} path config path
 * @returns {Record<string, any>} the checked object
 */
function exact(value, keys, path) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`config.${path}: expected an object`);
    }
    const row = /** @type {Record<string, any>} */ (value);
    if (Object.keys(row).length !== keys.length || keys.some((key) => !Object.hasOwn(row, key))) {
        throw new Error(`config.${path}: expected exactly ${keys.join(', ')}`);
    }
    return row;
}

/**
 * @param {string} field trait name
 * @param {number} value trait value
 * @returns {boolean} whether the trait is within its bounds
 */
function validTrait(field, value) {
    if (!Number.isFinite(value)) {
        return false;
    }
    if (field === 'hue') {
        return value >= -1 && value <= 1;
    }
    if (field === 'start') {
        return value >= 0 && value < 1;
    }
    if (POSITIVE.includes(field) ? value <= 0 : value < 0) {
        return false;
    }
    return !UNIT.includes(field) || value <= 1;
}

/**
 * Checks every archetype, including rows that have no patches.
 * @param {unknown} value the flora table
 * @returns {void}
 */
export function checkFlora(value) {
    const table = exact(value, FLORA_NAMES, 'flora');
    for (const name of FLORA_NAMES) {
        const row = exact(table[name], FIELDS, `flora.${name}`);
        for (const field of FIELDS) {
            if (!validTrait(field, row[field])) {
                throw new Error(`config.flora.${name}.${field}: invalid trait`);
            }
        }
        if (row.share > 0 && (row.yield === 0 || row.regrow === 0)) {
            throw new Error(`config.flora.${name}: positive share needs positive yield and regrow`);
        }
        if (row.energySpread > row.energy) {
            throw new Error(`config.flora.${name}.energySpread: exceeds energy`);
        }
    }
    for (const field of ['share', 'yield', 'regrow', 'range']) {
        if (table.fungus[field] !== 0) {
            throw new Error(`config.flora.fungus.${field}: expected 0`);
        }
    }
}
