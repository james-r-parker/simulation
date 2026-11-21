import { TRAITS } from '../../../js/sim/body-traits.js';
import { createConfig } from '../../../js/sim/config.js';
import { SPEC_NAMES } from '../../../js/sim/specs.js';

/**
 * @param {Record<string, Record<string, number>>} [open] spans to open, by spec then trait
 * @returns {{specialisations: Record<string, any>}} config overrides whose every menu is neutral (every span 0) except the
 *   spans opened
 */
export function neutralMenus(open = {}) {
    const zero = Object.fromEntries(TRAITS.map((t) => [t.name, 0]));
    return {
        specialisations: Object.fromEntries(SPEC_NAMES.map((name) => [name, { genes: { ...zero, ...open[name] } }])),
    };
}

/**
 * @param {Record<string, Record<string, number>>} [open] spans to open, by spec then trait
 * @param {Record<string, any>} [overrides] other config overrides
 * @returns {Readonly<Record<string, any>>} a config with neutral menus except the spans opened
 */
export function neutralConfig(open = {}, overrides = {}) {
    return createConfig({ ...neutralMenus(open), ...overrides });
}
