// The Phase 2 cross-check of docs/designs/role-budget.md ("Cross-check against the sim"): the defender budget and both smoke
// formulas against the scripted scenes of the real sim, at the defaults and in worlds where the defender arrives and the
// hidden body escapes.
import { describe, expect, it, vi } from 'vitest';
import { arenaConfig } from '../../js/evo/chase-arena.js';
import { defenceCheck } from '../../js/evo/role-budget-defence-check.js';
import { MODEL_DEFAULTS } from '../../js/evo/role-budget-model.js';

vi.setConfig({ testTimeout: 300_000 });

/** A slow world with the shove on: the defender can arrive before the kill. */
const SLOW = {
    maxVelocity: 4.5,
    defenderRepelEnergy: 40,
    defenderRepelImpulse: 4,
    defenderRepelCost: 2,
    specialisations: { predator: { sprintBoost: 0.5 } },
};
/** A hunter with a short view: smoke can hide the body for good. Plain smoke: the decoy has its own arm below. */
const BLIND = { smokeDecoyTicks: 0, maxVelocity: 5, specialisations: { predator: { visionRange: 100 } } };

/** @typedef {{name: string, config: Record<string, any>, model: Record<string, number>}} Arm */
/** @type {Arm[]} */
const ARMS = [
    { name: 'defaults', config: {}, model: {} },
    { name: 'defaults, the shove on', config: { defenderRepelEnergy: 40, defenderRepelImpulse: 4 }, model: {} },
    { name: 'slow, the shove on, defender beside the caller', config: SLOW, model: { escortGap: 60 } },
    { name: 'slow, the shove on, defender 150 px off', config: SLOW, model: { escortGap: 150 } },
    {
        name: 'slow, the shove off',
        config: { ...SLOW, defenderRepelEnergy: 0, defenderRepelImpulse: 0 },
        model: { escortGap: 60 },
    },
    { name: 'a hunter with a short view', config: BLIND, model: {} },
    { name: 'a hunter with a short view, brains with no reaction', config: BLIND, model: { reactionTicks: 0 } },
    { name: 'defaults, plain smoke (no decoy)', config: { smokeDecoyTicks: 0 }, model: {} },
];
const [DEFAULTS, , NEAR, FAR, , , QUICK] = ARMS;

/**
 * The known gap of the formula (docs/designs/role-budget.md, "As built"), found by the kill-tick reading added with the shove
 * on: the sim's hunter bites the defender dead and rests after that kill, which the formula does not play. Every reading of the
 * arm that existed before is still inside its tolerance, and the gap is pinned to its numbers below.
 */
const KNOWN_GAP = new Map([['slow, the shove on, defender 150 px off', ['kill tick']]]);
const memo = /** @type {Map<string, any>} */ (new Map());
const checked = (/** @type {Arm} */ arm) => {
    if (!memo.has(arm.name)) {
        memo.set(arm.name, defenceCheck(arenaConfig(arm.config), { ...MODEL_DEFAULTS, ...arm.model }));
    }
    return memo.get(arm.name);
};
const reading = (/** @type {Arm} */ arm, /** @type {(what: string) => boolean} */ pick) =>
    checked(arm).readings.find((/** @type {any} */ r) => pick(r.what));

describe('the defender budget against the scenes', () => {
    it.each(ARMS)('$name: no reading outside its tolerance but the known gap', (arm) => {
        const drifted = checked(arm).readings.filter((/** @type {any} */ r) => r.drift);
        expect(drifted.map((/** @type {any} */ r) => r.what)).toEqual(KNOWN_GAP.get(arm.name) ?? []);
    });

    it('the known gap is the kill tick with the shove on: 116 in the formula, 201 in the sim', () => {
        const kill = reading(FAR, (w) => w === 'kill tick');
        expect([kill.formula, kill.scene]).toEqual([116, 201]);
    });

    it('the call, the hearing and the first move agree exactly in every arm', () => {
        for (const arm of ARMS) {
            for (const what of ['alarm tick', 'heard tick', 'defender moves']) {
                const r = reading(arm, (w) => w === what);
                expect(r.formula, `${arm.name}: ${what}`).toBe(r.scene);
            }
        }
    });

    it('where the defender arrives, the touch is within 10% and both agree it lands its power before the kill', () => {
        const touch = reading(NEAR, (w) => w === 'defender touches the hunter');
        expect(touch.formula).not.toBeNull();
        expect(Math.abs(touch.formula - touch.scene)).toBeLessThanOrEqual(Math.max(2, 0.1 * touch.scene));
        const lands = reading(NEAR, (w) => w.startsWith('defender lands its power'));
        expect([lands.formula, lands.scene]).toEqual([true, true]);
    });

    it('at the defaults neither arrives: the caller is dead at tick 27', () => {
        const lands = reading(DEFAULTS, (w) => w.startsWith('defender lands its power'));
        expect([lands.formula, lands.scene]).toEqual([false, false]);
        expect(reading(DEFAULTS, (w) => w === 'kill tick').scene).toBe(27);
    });
});

describe('the smoke slack against the scenes', () => {
    it('agrees in sign: the prey escapes from a hunter with a short view, and from the decoy at the defaults, not from plain smoke', () => {
        const pick = (/** @type {string} */ w) => w === 'out of view when the cover ends';
        const plain = ARMS[7];
        expect([reading(ARMS[5], pick).formula, reading(ARMS[5], pick).scene]).toEqual([true, true]);
        expect([reading(DEFAULTS, pick).formula, reading(DEFAULTS, pick).scene]).toEqual([true, true]);
        expect([reading(plain, pick).formula, reading(plain, pick).scene]).toEqual([false, false]);
    });

    it('agrees in sign for the caller when the defender releases before the hunter reaches the cloud', () => {
        const pick = (/** @type {string} */ w) => w === 'caller out of view when the cover ends';
        const quick = reading(QUICK, pick);
        expect([quick.formula, quick.scene]).toEqual([true, true]);
        expect(reading(QUICK, (w) => w === 'hidden ticks').drift).toBe(false);
    });

    it('reads no caller escape for a release that comes after the hunter is in the cloud', () => {
        expect(reading(DEFAULTS, (w) => w === 'caller out of view when the cover ends')).toBeUndefined();
    });

    it('a defender that faces the hunter drops its cloud toward it, in the geometry and in the scene', () => {
        for (const arm of ARMS) {
            const r = reading(arm, (w) => w.includes('drops the cloud toward it'));
            expect([r.formula, r.scene], arm.name).toEqual([true, true]);
        }
    });
});
