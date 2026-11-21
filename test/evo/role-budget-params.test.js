import { describe, expect, it } from 'vitest';
import { arenaConfig } from '../../js/evo/chase-arena.js';
import { STORE_SHARE, roleParams } from '../../js/evo/role-budget-params.js';
import { createConfig } from '../../js/sim/config.js';
import { SPEC_NAMES } from '../../js/sim/specs.js';

/**
 * Every number of the "Body numbers" table, read from the config keys and the spec's fields directly (not through
 * `laneBases`), so the record cannot agree with itself by construction.
 */
function expected(/** @type {any} */ config, /** @type {any} */ name) {
    const s = config.specialisations[name];
    const maxEnergy = config.maxEnergy * s.maxEnergyMultiplier;
    const energy = STORE_SHARE * maxEnergy;
    const fat = 1 - config.fatSlowShare * STORE_SHARE;
    const base = config.maxThrust;
    const gain = config.sprintMultiplier * s.sprintBoost;
    return {
        size: config.baseSize + energy / config.energyToSize,
        energy,
        cruise: base * fat,
        sprint: base * fat * (1 + gain),
        graze: base * fat * config.grazeThrust,
        handling: base * fat * config.handlingThrust,
        capSprint: config.maxVelocity * (1 + gain),
        turn: config.maxTurn * s.turnMultiplier * fat,
        view: s.visionRange,
        drain: config.sprintDrain * s.sprintDrainMultiplier,
        bite: config.biteEnergy * s.biteMultiplier,
        killLine: config.killShare * maxEnergy,
        passive: config.passiveLoss * s.passiveLossMultiplier,
        move: config.movementCost * s.moveCostMultiplier,
        upkeep: s.canHunt ? config.huntUpkeep : 0,
        splitMin: config.splitMinEnergy * s.splitMinEnergyMultiplier,
    };
}

function check(/** @type {any} */ config, /** @type {any} */ name) {
    const p = roleParams(config, name);
    const e = expected(config, name);
    expect(p.spec).toBe(name);
    expect(p.hunts).toBe(config.specialisations[name].canHunt ? 1 : 0);
    expect(p.size).toBeCloseTo(e.size, 9);
    expect(p.energy).toBeCloseTo(e.energy, 9);
    expect(p.thrust.cruise).toBeCloseTo(e.cruise, 9);
    expect(p.thrust.sprint).toBeCloseTo(e.sprint, 9);
    expect(p.thrust.graze).toBeCloseTo(e.graze, 9);
    expect(p.thrust.handling).toBeCloseTo(e.handling, 9);
    expect(p.damping).toBe(config.damping);
    expect(p.cap).toEqual({ cruise: config.maxVelocity, sprint: expect.closeTo(e.capSprint, 9) });
    expect(p.turnRate.start).toBeCloseTo(e.turn, 9);
    expect(p.view.range).toBe(e.view);
    expect(p.view.rays).toBe(config.rayCount);
    expect(p.store.drain).toBeCloseTo(e.drain, 12);
    expect(p.store.on).toBe(config.sprintStoreEnabled ? 1 : 0);
    expect(p.bite.damage).toBeCloseTo(e.bite, 9);
    expect(p.kill.line).toBeCloseTo(e.killLine, 9);
    expect(p.cost.passive).toBeCloseTo(e.passive, 12);
    expect(p.cost.move).toBeCloseTo(e.move, 12);
    expect(p.cost.upkeep).toBe(e.upkeep);
    expect(p.repro.splitMin).toBeCloseTo(e.splitMin, 9);
    const scout = name === 'scout';
    expect(p.call.radius).toBe(config.callRadius * (scout ? config.scoutCallRadiusMultiplier : 1));
    expect(p.call.cost).toBe(config.alarmCost * (scout ? config.scoutAlarmCostMultiplier : 1));
}

describe('roleParams', () => {
    it('resolves the numbers of the table for the five specs at the defaults', () => {
        const config = createConfig({});
        for (const name of SPEC_NAMES) {
            check(config, name);
        }
    });

    it('follows an overridden config, a spec field and a body override alike', () => {
        const config = arenaConfig({
            maxThrust: 0.9,
            scoutCallRadiusMultiplier: 1.5,
            scoutAlarmCostMultiplier: 2,
            sprintStoreEnabled: true,
            sprintDrain: 0.02,
            specialisations: { predator: { sprintBoost: 2, sprintDrainMultiplier: 0.5 }, scout: { visionRange: 500 } },
        });
        for (const name of SPEC_NAMES) {
            check(config, name);
        }
        expect(roleParams(config, 'predator').store.drain).toBeCloseTo(0.01, 12);
        expect(roleParams(config, 'scout').view.range).toBe(500);
    });

    it('is every field a number or a plain record of numbers, frozen', () => {
        const p = roleParams(createConfig({}), 'forager');
        expect(Object.isFrozen(p)).toBe(true);
        const walk = (/** @type {any} */ node) =>
            Object.values(node).forEach((v) =>
                typeof v === 'object' ? walk(v) : expect(typeof v).not.toBe('function'),
            );
        walk(p);
    });

    it('prices a juvenile hunter at the juvenile burn and a juvenile forager at 1', () => {
        const config = createConfig({});
        expect(roleParams(config, 'predator', {}, { age: 'juvenile' }).cost.juvenile).toBe(config.juvenileBurn);
        expect(roleParams(config, 'forager', {}, { age: 'juvenile' }).cost.juvenile).toBe(1);
        expect(roleParams(config, 'predator').cost.juvenile).toBe(1);
    });

    it('starts the body at the store share it is given', () => {
        const config = createConfig({});
        const full = roleParams(config, 'forager', {}, { storeShare: 1 });
        expect(full.energy).toBe(config.maxEnergy);
        expect(full.thrust.cruise).toBeCloseTo(config.maxThrust * (1 - config.fatSlowShare), 12);
    });

    it('refuses an unknown spec and a trait map it does not read yet', () => {
        const config = createConfig({});
        expect(() => roleParams(config, 'blob')).toThrow(/unknown specialisation "blob"/);
        expect(() => roleParams(config, 'forager', { vision: 1.1 })).toThrow(/body-genes.md T10/);
    });
});
