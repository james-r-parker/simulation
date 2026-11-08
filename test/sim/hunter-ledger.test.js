import { describe, expect, it } from 'vitest';
import { FOOD_KIND } from '../../js/sim/carcass.js';
import { BORN_CAUSE } from '../../js/sim/events.js';
import { BIRTH_SOURCE, noteChildSource, noteLedgerKill, sourceOfSpawn } from '../../js/sim/hunter-ledger.js';
import { createSimLog, drainEvents } from '../../js/sim/log.js';
import { removeEnergy, LOSS_CAUSE } from '../../js/sim/energy.js';
import { reap } from '../../js/sim/population.js';
import { hashWorld } from '../../js/sim/world-hash.js';
import { HUNTER, PREY, createArena, runArena, stillBrain } from './helpers/predator-arena.js';

/**
 * @param {Record<string, any>} world the arena
 * @param {string} event the record name wanted
 * @returns {Record<string, any>[]} the debug records of that event the world's events drain to
 */
function drained(world, event) {
    /** @type {Record<string, any>[]} */
    const records = [];
    drainEvents(
        world,
        createSimLog((r) => records.push(r), { level: 'debug' }),
    );
    return records.filter((r) => r.event === event);
}

/**
 * Plays the arena until the hunter has killed a prey that carried food energy, then lets it eat the carcass.
 * @returns {Record<string, any>} the world
 */
function huntAndEat() {
    const world = createArena({ gap: 300, hunterEnergy: 2500 });
    world.foodEnergy[PREY] = 500;
    runArena(world, { ticks: 400, prey: stillBrain, after: (w) => w.alive[PREY] === 0 });
    const meat = world.foodKind.findIndex(
        (/** @type {number} */ k, /** @type {number} */ f) => world.foodAlive[f] === 1 && k === FOOD_KIND.MEAT,
    );
    world.x[HUNTER] = world.foodX[meat];
    world.y[HUNTER] = world.foodY[meat];
    runArena(world, { ticks: 1, prey: stillBrain });
    return world;
}

/**
 * Drains the hunter of its energy and steps, so it starves.
 * @param {Record<string, any>} world the arena
 * @returns {void}
 */
function starveHunter(world) {
    removeEnergy(world, HUNTER, world.energy[HUNTER], LOSS_CAUSE.COST);
    runArena(world, { ticks: 1, prey: stillBrain });
}

describe('the hunter ledger', () => {
    it('counts the kill, the carcass, the standing, moving and sprinting costs and the bites', () => {
        const world = huntAndEat();
        expect(world.alive[PREY]).toBe(0);
        expect(world.ledgerKills[HUNTER]).toBe(1);
        expect(world.ledgerCarcass[HUNTER]).toBeGreaterThan(0);
        expect(world.ledgerStanding[HUNTER]).toBeGreaterThan(0);
        expect(world.ledgerMove[HUNTER]).toBeGreaterThan(0);
        const ticksSprinted = world.ledgerSprint[HUNTER] / world.config.sprintCost;
        expect(ticksSprinted).toBeGreaterThan(0);
        expect(ticksSprinted).toBeCloseTo(Math.round(ticksSprinted), 6);
        expect(world.ledgerKillEnergy[HUNTER]).toBeGreaterThan(0);
        expect(world.ledgerBiteGain[HUNTER]).toBeGreaterThan(0);
        expect(world.ledgerBiteCost[HUNTER]).toBeGreaterThan(0);
        expect(world.ledgerKills[PREY]).toBe(0);
    });

    it('keeps the kill energy apart from the energy of the bites that did not kill', () => {
        const world = huntAndEat();
        expect(world.biteEnergy[HUNTER]).toBeGreaterThanOrEqual(
            world.ledgerBiteGain[HUNTER] + world.ledgerKillEnergy[HUNTER] - 1e-6,
        );
        expect(world.ledgerKillEnergy[HUNTER]).toBeLessThan(world.ledgerBiteGain[HUNTER]);
    });

    it('logs one debug HunterLedger record when the hunter dies, with the counts', () => {
        const world = huntAndEat();
        const before = {
            kills: world.ledgerKills[HUNTER],
            carcass: world.ledgerCarcass[HUNTER],
            killEnergy: world.ledgerKillEnergy[HUNTER],
            biteGain: world.ledgerBiteGain[HUNTER],
            genomeId: world.genomeId[HUNTER],
        };
        starveHunter(world);
        const records = drained(world, 'HunterLedger');
        expect(records).toHaveLength(1);
        expect(records[0]).toMatchObject({
            genomeId: before.genomeId,
            cause: 'starved',
            birth: 'initial',
            kills: before.kills,
            carcassEnergy: before.carcass,
            killEnergy: before.killEnergy,
            biteGainEnergy: before.biteGain,
        });
        expect(records[0].ageTicks).toBe(world.tick);
        expect(records[0].standingEnergy).toBeGreaterThan(0);
        expect(records[0].biteCostEnergy).toBeGreaterThan(0);
    });

    it('logs one debug HunterKill at the deliberate kill, with the killer, its age and its kills so far', () => {
        const world = createArena({ gap: 300, hunterEnergy: 2500 });
        world.foodEnergy[PREY] = 500;
        const genomeId = world.genomeId[HUNTER];
        /** @type {Record<string, any>[]} */
        const kills = [];
        runArena(world, {
            ticks: 400,
            prey: stillBrain,
            after: (w) => {
                kills.push(...drained(w, 'HunterKill'));
                return w.alive[PREY] === 0;
            },
        });
        expect(kills).toHaveLength(1);
        expect(kills[0]).toEqual({
            event: 'HunterKill',
            level: 'debug',
            tick: world.tick - 1,
            genomeId,
            ageTicks: world.ageTicks[HUNTER],
            kills: 1,
            dependent: false,
        });
        expect(world.ledgerKills[HUNTER]).toBe(1);
    });

    it('marks the HunterKill of a hunter with a living parent in range as dependent', () => {
        const world = createArena({ gap: 300, hunterEnergy: 2500 });
        world.foodEnergy[PREY] = 500;
        // The hunter's own genome id as its parent id stands for a living parent on the spot (distance 0).
        world.parentA[HUNTER] = world.genomeId[HUNTER];
        /** @type {Record<string, any>[]} */
        const kills = [];
        runArena(world, {
            ticks: 400,
            prey: stillBrain,
            after: (w) => {
                kills.push(...drained(w, 'HunterKill'));
                return w.alive[PREY] === 0;
            },
        });
        expect(kills).toHaveLength(1);
        expect(kills[0].dependent).toBe(true);
    });

    it('logs no HunterKill for a victim nobody deliberately bit', () => {
        const world = createArena({ gap: 300, hunterEnergy: 2500 });
        removeEnergy(world, PREY, world.energy[PREY], LOSS_CAUSE.COST);
        runArena(world, { ticks: 1, prey: stillBrain });
        expect(drained(world, 'HunterKill')).toHaveLength(0);
    });

    it('logs a LastHunterDied with the basin and the non-hunters in each basin when the only hunter dies', () => {
        const world = createArena({ gap: 300, hunterEnergy: 2500 });
        world.x[HUNTER] = world.config.worldWidth * 0.75;
        world.x[PREY] = world.config.worldWidth * 0.25;
        const genomeId = world.genomeId[HUNTER];
        starveHunter(world);
        const [record] = drained(world, 'LastHunterDied');
        expect(record).toMatchObject({ genomeId, basin: 'east', nonPredatorsWest: 1, nonPredatorsEast: 0 });
    });

    it('counts a non-hunter in the east basin when the only hunter dies in the west', () => {
        const world = createArena({ gap: 300, hunterEnergy: 2500 });
        world.x[HUNTER] = world.config.worldWidth * 0.25;
        world.x[PREY] = world.config.worldWidth * 0.75;
        starveHunter(world);
        const [record] = drained(world, 'LastHunterDied');
        expect(record).toMatchObject({ basin: 'west', nonPredatorsWest: 0, nonPredatorsEast: 1 });
    });

    it('writes no LastHunterDied while another hunter is alive', () => {
        const world = createArena({ gap: 300, hunterEnergy: 2500 });
        world.spec[PREY] = 1;
        starveHunter(world);
        expect(drained(world, 'HunterLedger')).toHaveLength(1);
        expect(drained(world, 'LastHunterDied')).toHaveLength(0);
    });

    it('clears the ledger when the slot is freed', () => {
        const world = huntAndEat();
        starveHunter(world);
        expect(world.ledgerKills[HUNTER]).toBe(0);
        expect(world.ledgerCarcass[HUNTER]).toBe(0);
        expect(world.ledgerSprint[HUNTER]).toBe(0);
        expect(world.ledgerBiteCost[HUNTER]).toBe(0);
        expect(world.birthSource[HUNTER]).toBe(BIRTH_SOURCE.INITIAL);
    });

    it('leaves worldHash as it was when the counters change', () => {
        const world = createArena({ gap: 300, hunterEnergy: 2500 });
        const before = hashWorld(world);
        world.ledgerKills[HUNTER] = 9;
        world.ledgerMove[HUNTER] = 3.5;
        world.birthSource[HUNTER] = BIRTH_SOURCE.FLOOR;
        world.hunterTally[0] = 4;
        expect(hashWorld(world)).toEqual(before);
    });
});

/** The hunter's prey tracker reads deliberate at the tick, so its bite on PREY is a deliberate one. */
function deliberateBite(/** @type {any} */ world) {
    world.meritPrey.seen[HUNTER] = world.tick;
    world.meritPrey.bits[HUNTER] = 0xff;
    world.meritPrey.turn[HUNTER] = world.tick;
}

describe('the hunter ledger on a starving tick', () => {
    it('splits only the energy actually removed across standing, moving and sprinting', () => {
        const world = createArena({ gap: 300, hunterEnergy: 2500 });
        removeEnergy(world, HUNTER, world.energy[HUNTER] - 1e-4, LOSS_CAUSE.COST);
        const had = world.energy[HUNTER];
        runArena(world, { ticks: 1, prey: stillBrain });
        const [record] = drained(world, 'HunterLedger');
        const spent = record.standingEnergy + record.moveEnergy + record.sprintEnergy;
        expect(world.alive[HUNTER]).toBe(0);
        expect(spent).toBeCloseTo(had, 12);
    });

    it('credits a kill to a killer that dies on the same tick, on its record', () => {
        const world = createArena({ gap: 300, hunterEnergy: 2500 });
        const killer = world.genomeId[HUNTER];
        world.lastBiter[PREY] = killer;
        world.lastBiteTick[PREY] = world.tick + 1;
        deliberateBite(world);
        world.energy[PREY] = 0;
        world.energy[HUNTER] = 0;
        world.lastLoss[HUNTER] = LOSS_CAUSE.COST;
        world.lastLoss[PREY] = LOSS_CAUSE.BITE;
        world.tick += 1;
        reap(world, { initBrain() {} });
        const [record] = drained(world, 'HunterLedger');
        expect(record.kills).toBe(1);
    });

    it('credits no one when the biter of an eaten victim is no longer alive', () => {
        const world = createArena({ gap: 300, hunterEnergy: 2500 });
        world.lastBiter[PREY] = 987654321;
        deliberateBite(world);
        noteLedgerKill(world, PREY);
        expect(world.ledgerKills[HUNTER]).toBe(0);
        expect(world.ledgerKills[PREY]).toBe(0);
    });

    it('does not credit a kill whose last bite was not deliberate', () => {
        const world = createArena({ gap: 300, hunterEnergy: 2500 });
        world.lastBiter[PREY] = world.genomeId[HUNTER];
        world.energy[PREY] = 0;
        world.lastLoss[PREY] = LOSS_CAUSE.BITE;
        reap(world, { initBrain() {} });
        expect(world.ledgerKills[HUNTER]).toBe(0);
    });
});

describe('birth source', () => {
    it('names a spawn by its cause', () => {
        expect(sourceOfSpawn(BORN_CAUSE.FLOOR)).toBe(BIRTH_SOURCE.FLOOR);
        expect(sourceOfSpawn(BORN_CAUSE.IMMIGRANT)).toBe(BIRTH_SOURCE.IMMIGRANT);
        expect(sourceOfSpawn(BORN_CAUSE.INITIAL)).toBe(BIRTH_SOURCE.INITIAL);
    });

    it('separates a hunter child of a hunter, a spec flip and an ordinary child', () => {
        const world = createArena({ gap: 300, hunterEnergy: 2500 });
        const born = (
            /** @type {number} */ motherSpec,
            /** @type {number} */ childSpec,
            /** @type {number} */ cause,
        ) => {
            world.spec[0] = motherSpec;
            world.spec[1] = childSpec;
            noteChildSource(world, { child: 1, mother: 0, cause });
            return world.birthSource[1];
        };
        expect(born(1, 1, BORN_CAUSE.MATE)).toBe(BIRTH_SOURCE.MATE_HUNTER);
        expect(born(1, 1, BORN_CAUSE.SPLIT)).toBe(BIRTH_SOURCE.SPLIT_HUNTER);
        expect(born(0, 1, BORN_CAUSE.MATE)).toBe(BIRTH_SOURCE.SPEC_FLIP);
        expect(born(0, 1, BORN_CAUSE.SPLIT)).toBe(BIRTH_SOURCE.SPEC_FLIP);
        expect(born(0, 0, BORN_CAUSE.MATE)).toBe(BIRTH_SOURCE.MATE);
        expect(born(1, 0, BORN_CAUSE.SPLIT)).toBe(BIRTH_SOURCE.SPLIT);
    });
});
