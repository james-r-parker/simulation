import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { rayReachTable, reachFactor } from '../../js/sim/ray-reach.js';

const SPECS = ['forager', 'predator', 'reproducer', 'scout', 'defender'];

/**
 * @param {Record<string, number>} shares `rearVisionShare` by specialisation name
 * @param {number} rayCount the ray count
 * @returns {Readonly<Record<string, any>>} a config with those shares
 */
function configWith(shares, rayCount = 16) {
    const specialisations = Object.fromEntries(
        Object.entries(shares).map(([name, share]) => [name, { rearVisionShare: share }]),
    );
    return createConfig({ rayCount, specialisations });
}

describe('reachFactor', () => {
    it('keeps the full range dead ahead and the share behind', () => {
        expect(reachFactor(0.4, 0)).toBe(1);
        expect(reachFactor(0.4, Math.PI)).toBeCloseTo(0.4, 12);
        expect(reachFactor(0.4, Math.PI / 2)).toBeCloseTo(0.7, 12);
    });

    it('is exactly 1 on every ray at a share of 1', () => {
        for (let k = 0; k < 64; k++) {
            expect(reachFactor(1, (2 * Math.PI * k) / 64)).toBe(1);
        }
    });

    it('never exceeds 1 and never falls under the share', () => {
        for (const share of [0, 0.1, 0.3, 0.45, 0.6, 0.99]) {
            for (let k = 0; k < 32; k++) {
                const f = reachFactor(share, (2 * Math.PI * k) / 32);
                expect(f).toBeLessThanOrEqual(1);
                expect(f).toBeGreaterThanOrEqual(share - 1e-12);
            }
        }
    });
});

describe('rayReachTable', () => {
    it('is all ones for the default config', () => {
        const { rayReachBySpec } = rayReachTable(createConfig());
        expect(rayReachBySpec.length).toBe(SPECS.length * createConfig().rayCount);
        expect(Array.from(rayReachBySpec).every((f) => f === 1)).toBe(true);
    });

    it("holds each specialisation's row at its index, symmetric left and right", () => {
        const rays = 16;
        const { rayReachBySpec } = rayReachTable(configWith({ predator: 0.4, defender: 0.8 }, rays));
        const row = (index) => Array.from(rayReachBySpec.subarray(index * rays, (index + 1) * rays));
        expect(row(0).every((f) => f === 1)).toBe(true);
        const predator = row(1);
        expect(predator[0]).toBe(1);
        expect(predator[rays / 2]).toBeCloseTo(0.4, 12);
        for (let k = 1; k < rays / 2; k++) {
            expect(predator[k]).toBeCloseTo(predator[rays - k], 12);
            expect(predator[k]).toBeLessThan(predator[k - 1]);
        }
        expect(row(4)[rays / 2]).toBeCloseTo(0.8, 12);
    });

    it('refuses a share outside 0 to 1', () => {
        expect(() => configWith({ predator: 1.2 })).toThrow(/rearVisionShare/);
        expect(() => configWith({ predator: -0.1 })).toThrow(/rearVisionShare/);
    });
});
