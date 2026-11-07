import { describe, expect, it } from 'vitest';
import { createRng, fork } from '../../js/sim/rng.js';
import { BIG_GENE, PREDATOR_CASES } from '../../js/evo/reflex-cases-predator.js';
import { DEG } from '../../js/evo/reflex-stage.js';

const VIEW = 350;
const byName = (/** @type {string} */ name) => {
    const found = PREDATOR_CASES.find((c) => c.name === name);
    if (found === undefined) {
        throw new Error(`no case ${name}`);
    }
    return found;
};
const plan = (/** @type {string} */ name, seed = 1) => byName(name).plan(fork(createRng(seed), `reflex:${name}`), VIEW);
const out = (/** @type {number} */ turn, /** @type {number} */ thrust, /** @type {number} */ bite = 0) => ({
    turn,
    thrust,
    sprint: 0,
    bite,
});

/**
 * @param {any} stage a staged tick
 * @returns {{bearing: number, distance: number}} the second agent's bearing in the first's frame and its distance
 */
function victimFrame(stage) {
    const [subject, victim] = stage.agents;
    const raw = Math.atan2(victim.y - subject.y, victim.x - subject.x) - subject.angle;
    return {
        bearing: Math.atan2(Math.sin(raw), Math.cos(raw)),
        distance: Math.hypot(victim.x - subject.x, victim.y - subject.y),
    };
}

describe('PREDATOR_CASES', () => {
    it('are the two predator cases, each for predators', () => {
        expect(PREDATOR_CASES.map((c) => c.name)).toEqual(['approach-prey', 'bite-discrimination']);
        expect(PREDATOR_CASES.every((c) => c.spec === 1)).toBe(true);
    });
});

describe('approach-prey', () => {
    it('stages a bitable forager inside the fan, 15 to 60 degrees off the heading, mirrored', () => {
        const stagings = plan('approach-prey');
        expect(stagings.map((s) => s.mirror)).toEqual([1, -1]);
        for (const s of stagings) {
            const [subject, prey] = s.ticks[0].agents;
            expect(subject.spec).toBe(1);
            expect(prey.spec).toBe(0);
            const f = victimFrame(s.ticks[0]);
            expect(f.bearing).toBeCloseTo(s.bearing, 6);
            expect(Math.abs(f.bearing)).toBeGreaterThanOrEqual(15 * DEG - 1e-9);
            expect(Math.abs(f.bearing)).toBeLessThanOrEqual(60 * DEG + 1e-9);
            expect(f.distance).toBeLessThan(VIEW);
        }
        expect(stagings[1].bearing).toBeCloseTo(-stagings[0].bearing, 12);
    });

    it('passes a turn towards the prey with thrust', () => {
        const check = byName('approach-prey').check;
        const s = /** @type {any} */ ({ kind: 'prey', bearing: 30 * DEG });
        expect(check(out(1, 1), s)).toBe(true);
        expect(check(out(-1, 1), s)).toBe(false);
        expect(check(out(1, 0.1), s)).toBe(false);
        expect(check(out(0, 1), s)).toBe(false);
    });
});

describe('bite-discrimination', () => {
    it('stages the prey, a too-big forager and a kin forager just ahead, in both orientations', () => {
        const stagings = plan('bite-discrimination');
        expect(stagings.map((s) => s.kind)).toEqual(['prey', 'too-big', 'kin', 'prey', 'too-big', 'kin']);
        for (const s of stagings) {
            const f = victimFrame(s.ticks[0]);
            expect(f.distance).toBeLessThan(100);
            expect(Math.abs(f.bearing)).toBeLessThanOrEqual(5 * DEG + 1e-9);
        }
    });

    it('makes the too-big one big by its size gene and the kin share a parent with the subject', () => {
        const [prey, big, kin] = plan('bite-discrimination');
        expect(big.ticks[0].agents[1].sizeGene).toBe(BIG_GENE);
        expect(prey.ticks[0].agents[1].sizeGene).toBeUndefined();
        const [subject, relative] = kin.ticks[0].agents;
        expect(subject.parents?.[0]).not.toBe(0);
        expect(relative.parents).toEqual(subject.parents);
        expect(prey.ticks[0].agents[0].parents).toBeUndefined();
    });

    it('passes a bite on the prey and none on the others, so neither always nor never biting passes', () => {
        const check = byName('bite-discrimination').check;
        const kind = (/** @type {string} */ k) => /** @type {any} */ ({ kind: k, bearing: 0 });
        expect(check(out(0, 0, 1), kind('prey'))).toBe(true);
        expect(check(out(0, 0, 0), kind('prey'))).toBe(false);
        expect(check(out(0, 0, -1), kind('too-big'))).toBe(true);
        expect(check(out(0, 0, 1), kind('too-big'))).toBe(false);
        expect(check(out(0, 0, 0), kind('kin'))).toBe(true);
        expect(check(out(0, 0, 1), kind('kin'))).toBe(false);
    });
});
