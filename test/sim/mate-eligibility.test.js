import { describe, expect, it } from 'vitest';
import { canMatePair, isReadyToMate, readyToMate } from '../../js/sim/mate-eligibility.js';
import { addBlob, lifeWorld } from './helpers/life-world.js';

const MATE = { mateOut: 1, energy: 700, spec: 2 };

/**
 * @param {Record<string, any>} [over] config overrides
 * @returns {any} a world with two ready agents of equal size
 */
function pair(over = {}) {
    const w = lifeWorld(over);
    addBlob(w, MATE);
    addBlob(w, MATE);
    w.size[0] = 25;
    w.size[1] = 25;
    return w;
}

describe('isReadyToMate', () => {
    it.each([
        ['ready', () => {}, true],
        ['immature', (/** @type {any} */ w) => (w.ageTicks[0] = 0), false],
        ['pregnant', (/** @type {any} */ w) => (w.pregnancy[0] = 3), false],
        ['on cooldown', (/** @type {any} */ w) => (w.cooldown[0] = 1), false],
        ['at mateMinEnergy', (/** @type {any} */ w) => (w.energy[0] = 200), false],
    ])('is %s', (_name, tweak, expected) => {
        const w = pair({ maturityTicks: 5 });
        w.ageTicks[0] = 5;
        tweak(w);
        expect(isReadyToMate(w, 0)).toBe(expected);
    });
});

describe('readyToMate', () => {
    it('needs the mate output above 0', () => {
        const w = pair();
        expect(readyToMate(w, 0)).toBe(true);
        w.outputs.fill(0);
        expect(readyToMate(w, 0)).toBe(false);
        expect(isReadyToMate(w, 0)).toBe(true);
    });
});

describe('canMatePair', () => {
    it('holds for two ready agents of one specialisation and size', () => {
        expect(canMatePair(pair(), 0, 1)).toBe(true);
    });

    it('refuses a lower-slot mother at or below childEnergyMin / childEnergyShare', () => {
        const w = pair();
        w.energy[0] = 400;
        expect(canMatePair(w, 0, 1)).toBe(false);
        expect(canMatePair(w, 1, 0)).toBe(false);
        w.energy[0] = 401;
        expect(canMatePair(w, 0, 1)).toBe(true);
    });

    it('does not ask the father to hold that much', () => {
        const w = pair();
        w.energy[1] = 300;
        expect(canMatePair(w, 0, 1)).toBe(true);
    });

    it.each([
        ['a different specialisation', (/** @type {any} */ w) => (w.spec[1] = 3)],
        ['one not ready', (/** @type {any} */ w) => (w.cooldown[1] = 1)],
        ['one that does not want to', (/** @type {any} */ w) => w.outputs.fill(0)],
        ['a much bigger partner', (/** @type {any} */ w) => (w.size[1] = 2 * w.size[0] + 1)],
        ['a much smaller partner', (/** @type {any} */ w) => (w.size[0] = 2 * w.size[1] + 1)],
    ])('fails for %s', (_name, tweak) => {
        const w = pair();
        tweak(w);
        expect(canMatePair(w, 0, 1)).toBe(false);
    });
});

describe('isReadyToMate temperature', () => {
    it.each([
        [29.99, false],
        [30, true],
        [57, true],
        [85, true],
        [85.01, false],
        [0, false],
        [100, false],
    ])('at temperature %f is ready: %s', (t, expected) => {
        const w = pair();
        w.temperature[0] = t;
        expect(isReadyToMate(w, 0)).toBe(expected);
        expect(readyToMate(w, 0)).toBe(expected);
    });

    it('stops canMatePair for either partner', () => {
        const w = pair();
        w.temperature[1] = 10;
        expect(canMatePair(w, 0, 1)).toBe(false);
        expect(canMatePair(w, 1, 0)).toBe(false);
    });
});
