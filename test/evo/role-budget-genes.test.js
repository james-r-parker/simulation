import { describe, expect, it } from 'vitest';
import { HEAT_BAND, LANES, laneBases } from '../../js/sim/body-lanes.js';
import { TRAITS } from '../../js/sim/body-traits.js';
import { bakeTraits, lanesAt, menuTraits, traitCorners } from '../../js/evo/role-budget-genes.js';
import { roleParams } from '../../js/evo/role-budget-params.js';
import { createConfig } from '../../js/sim/config.js';
import { SPEC_NAMES } from '../../js/sim/specs.js';
import { neutralConfig } from './helpers/neutral-menus.js';

const ONES = Object.fromEntries(TRAITS.filter((t) => t.kind === 'ratio').map((t) => [t.name, 1]));

/** Asserts two records of numbers are equal to 9 digits, key by key. */
function expectClose(/** @type {any} */ got, /** @type {any} */ want, path = 'roleParams') {
    if (typeof want !== 'object') {
        typeof want === 'number' ? expect(got, path).toBeCloseTo(want, 9) : expect(got, path).toBe(want);
        return;
    }
    expect(Object.keys(got), path).toEqual(Object.keys(want));
    for (const key of Object.keys(want)) {
        expectClose(got[key], want[key], `${path}.${key}`);
    }
}

describe('roleParams with trait ratios', () => {
    it('with every ratio 1 resolves exactly the lane bases, for every spec', () => {
        const config = createConfig({});
        for (const name of SPEC_NAMES) {
            expect(roleParams(config, name, ONES)).toEqual(roleParams(config, name));
            expect(lanesAt(config, laneBases(config, name), { ...ONES, [HEAT_BAND]: 0 })).toEqual(
                laneBases(config, name),
            );
        }
    });

    it('moves the lanes a ratio names by r^power, and the lanes its cost names by r^(sign x k)', () => {
        const config = createConfig({ speedHeat: 1, fatSlow: 2 });
        const base = roleParams(config, 'forager');
        const fast = roleParams(config, 'forager', { speed: 1.2 });
        expect(fast.cap.cruise).toBeCloseTo(base.cap.cruise * 1.2, 9);
        expect(fast.thrust.base).toBeCloseTo(base.thrust.base * 1.2, 9);
        expect(fast.heat.gainMove).toBeCloseTo(base.heat.gainMove * 1.2, 9);
        const fat = roleParams(config, 'forager', { fat: 1.5 });
        expect(fat.sizing.max).toBeCloseTo(base.sizing.max * 1.5, 9);
        expect(fat.thrust.fatShare).toBeCloseTo(base.thrust.fatShare * 1.5 ** 2, 9);
    });

    it('shifts the six thresholds by a heatBand shift, in degrees', () => {
        const config = createConfig({});
        const base = laneBases(config, 'forager');
        const warm = lanesAt(config, base, { heatBand: 4 });
        const thresholds = LANES.filter((lane) => lane.kind === 'offset').map((lane) => lane.name);
        expect(thresholds).toHaveLength(6);
        for (const name of Object.keys(base)) {
            expect(warm[name], name).toBe(thresholds.includes(name) ? base[name] + 4 : base[name]);
        }
        expect(roleParams(config, 'forager', { heatBand: 4 }).heat.optimalMax).toBe(base.temperatureOptimalMax + 4);
    });

    it('refuses an unknown spec, a name that is not a trait, the raw trait and a ratio of 0 or less', () => {
        const config = createConfig({});
        expect(() => roleParams(config, 'blob')).toThrow(/unknown specialisation "blob"/);
        expect(() => roleParams(config, 'forager', { wings: 1.1 })).toThrow(/"wings" is not a trait/);
        expect(() => roleParams(config, 'forager', { learn: 1.1 })).toThrow(/"learn" is not a trait/);
        expect(() => roleParams(config, 'forager', { vision: 0 })).toThrow(/finite number/);
        expect(() => roleParams(config, 'forager', { heatBand: Number.NaN })).toThrow(/finite number/);
        expect(roleParams(config, 'forager', { heatBand: 0 }).heat.optimalMax).toBe(config.temperatureOptimalMax);
    });
});

describe('bakeTraits', () => {
    it('gives a config whose roleParams equal the direct ratios, for a body of every spec', () => {
        const config = createConfig({ sizeTurn: 1, burnThrust: 0.5 });
        const traits = { size: 1.3, vision: 0.7, speed: 1.2, fat: 0.8, burn: 0.9, sprintStore: 1.1, heatBand: -3 };
        for (const name of SPEC_NAMES) {
            const baked = bakeTraits(config, { [name]: traits });
            const direct = roleParams(config, name, traits);
            expectClose(roleParams(baked, name), direct);
        }
    });

    it('does not change the config it is given, nor the specs it is not given', () => {
        const config = createConfig({});
        const before = JSON.stringify(config.specialisations);
        const baked = bakeTraits(config, { forager: { size: 1.3 } });
        expect(JSON.stringify(config.specialisations)).toBe(before);
        expect(baked.specialisations.predator).toBe(config.specialisations.predator);
        expect(baked.specialisations.forager.body.baseSize).toBeCloseTo(1.3, 12);
    });
});

describe('traitCorners', () => {
    it('is one empty corner at neutral spans, and every menu trait is a budget trait', () => {
        const config = neutralConfig();
        for (const name of SPEC_NAMES) {
            expect(menuTraits(config, name)).toEqual([]);
            expect(traitCorners(config, name)).toEqual([{}]);
        }
    });

    it('enumerates 2^n corners of the n budget traits the menu opens, at 1 +/- span (a shift for heatBand)', () => {
        const spans = { size: 0.2, speed: 0.3, heatBand: 5, hearing: 0.4, learn: 0.5 };
        const config = neutralConfig({ forager: spans });
        expect(menuTraits(config, 'forager')).toEqual(['size', 'speed', 'heatBand']);
        const corners = traitCorners(config, 'forager');
        expect(corners).toHaveLength(8);
        expect(new Set(corners.map((c) => JSON.stringify(c))).size).toBe(8);
        for (const corner of corners) {
            expect([0.8, 1.2]).toContain(corner.size);
            expect([0.7, 1.3]).toContain(corner.speed);
            expect([-5, 5]).toContain(corner.heatBand);
            expect(Object.keys(corner)).not.toContain('hearing');
        }
    });

    it('reads the default menus: size and vision open at 0.3, the new traits shut', () => {
        const config = createConfig({});
        expect(menuTraits(config, 'predator')).toEqual(['size', 'vision']);
        expect(traitCorners(config, 'predator')).toHaveLength(4);
    });
});
