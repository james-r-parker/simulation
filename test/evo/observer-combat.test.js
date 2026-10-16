import { describe, expect, it } from 'vitest';
import { DEATH_CAUSE } from '../../js/sim/events.js';
import { ESCAPE_TICKS, PRUNE_TICKS, observeCombat } from '../../js/evo/observer-combat.js';
import { observe } from '../../js/evo/observer.js';
import { addBorn, nextTick, observed, pushDied } from './helpers/observer-world.js';

const FORAGER = 0;
const PREDATOR = 1;

/**
 * A world with one predator (slot 0) and one forager (slot 1), both known to the combat counters.
 * @param {Record<string, any>} [over] config overrides
 * @returns {{world: any, observer: any, combat: any, hunter: number, prey: number}}
 */
function arena(over = {}) {
    const { world, observer } = observed(over);
    const hunter = addBorn(world, { spec: PREDATOR });
    const prey = addBorn(world, { spec: FORAGER });
    observeCombat(observer.combat, world);
    return { world, observer, combat: observer.combat, hunter, prey };
}

/**
 * Advances one tick and observes it.
 * @param {any} world the world
 * @param {any} combat the combat counters
 * @returns {void}
 */
function tick(world, combat) {
    nextTick(world, world.tick + 1);
    observeCombat(combat, world);
}

describe('observeCombat', () => {
    it('is part of observe: the observer holds the counters', () => {
        const { world, observer } = observed();
        addBorn(world, { spec: PREDATOR });
        nextTick(world, 1);
        observe(observer, world);
        expect(observer.combat.hunterAgentTicks).toBe(1);
    });

    it('counts hunter agent-ticks for alive agents with canHunt, from tick 1', () => {
        const { world, combat } = arena();
        expect(combat.hunterAgentTicks).toBe(0);
        tick(world, combat);
        tick(world, combat);
        expect(combat.hunterAgentTicks).toBe(2);
        world.alive[0] = 0;
        tick(world, combat);
        expect(combat.hunterAgentTicks).toBe(2);
    });

    it('resolves a bite episode as escaped ESCAPE_TICKS after the last bite', () => {
        const { world, combat, prey } = arena();
        nextTick(world, 10);
        world.bittenTimer[prey] = 1;
        observeCombat(combat, world);
        world.bittenTimer[prey] = 11;
        nextTick(world, 10 + ESCAPE_TICKS - 1);
        observeCombat(combat, world);
        expect(combat.escapedEpisodes).toBe(0);
        nextTick(world, 10 + ESCAPE_TICKS);
        observeCombat(combat, world);
        expect([combat.escapedEpisodes, combat.caughtEpisodes]).toEqual([1, 0]);
        nextTick(world, 11 + ESCAPE_TICKS);
        observeCombat(combat, world);
        expect(combat.escapedEpisodes).toBe(1);
    });

    it('extends the episode with each further bite', () => {
        const { world, combat, prey } = arena();
        for (const t of [10, 200]) {
            nextTick(world, t);
            world.bittenTimer[prey] = 1;
            observeCombat(combat, world);
        }
        world.bittenTimer[prey] = 30;
        nextTick(world, 10 + ESCAPE_TICKS);
        observeCombat(combat, world);
        expect(combat.escapedEpisodes).toBe(0);
        nextTick(world, 200 + ESCAPE_TICKS);
        observeCombat(combat, world);
        expect(combat.escapedEpisodes).toBe(1);
    });

    it('resolves an open episode as caught when the victim dies', () => {
        const { world, combat, prey } = arena();
        nextTick(world, 10);
        world.bittenTimer[prey] = 1;
        observeCombat(combat, world);
        nextTick(world, 50);
        pushDied(world, { slot: prey, genomeId: world.genomeId[prey], cause: DEATH_CAUSE.STARVED, spec: FORAGER });
        world.alive[prey] = 0;
        observeCombat(combat, world);
        expect([combat.caughtEpisodes, combat.escapedEpisodes]).toEqual([1, 0]);
        nextTick(world, 10 + ESCAPE_TICKS + 5);
        observeCombat(combat, world);
        expect([combat.caughtEpisodes, combat.escapedEpisodes]).toEqual([1, 0]);
    });

    it('counts an eaten death with no episode open as one caught episode, and a hunter victim as none', () => {
        const { world, combat, hunter, prey } = arena();
        nextTick(world, 5);
        const by = world.genomeId[hunter];
        pushDied(world, { slot: prey, genomeId: world.genomeId[prey], cause: DEATH_CAUSE.EATEN, by, spec: FORAGER });
        pushDied(world, { slot: hunter, genomeId: by, cause: DEATH_CAUSE.EATEN, by: 99, spec: PREDATOR });
        world.alive.fill(0);
        observeCombat(combat, world);
        expect([combat.caughtEpisodes, combat.eatenDeaths, combat.huntKills]).toEqual([1, 2, 1]);
    });

    it('does not open an episode for a bite on a hunter', () => {
        const { world, combat, hunter } = arena();
        nextTick(world, 10);
        world.bittenTimer[hunter] = 1;
        observeCombat(combat, world);
        nextTick(world, 10 + ESCAPE_TICKS);
        observeCombat(combat, world);
        expect(combat.escapedEpisodes).toBe(0);
    });

    it('counts a pack kill when the killer and the previous biter are hunters of one lineage', () => {
        const { world, combat, hunter, prey } = arena();
        const mate = addBorn(world, { spec: PREDATOR, lineageId: world.lineageId[hunter] });
        observeCombat(combat, world);
        nextTick(world, 5);
        const f = { slot: prey, genomeId: world.genomeId[prey], cause: DEATH_CAUSE.EATEN, spec: FORAGER };
        pushDied(world, { ...f, by: world.genomeId[hunter], prevBiter: world.genomeId[mate] });
        observeCombat(combat, world);
        expect([combat.packKills, combat.eatenDeaths]).toEqual([1, 1]);
    });

    it('does not count a pack kill across lineages, with no previous biter, or with a non-hunter one', () => {
        const { world, combat, hunter, prey } = arena();
        const stranger = addBorn(world, { spec: PREDATOR });
        world.lineageId[stranger] = 77;
        observeCombat(combat, world);
        nextTick(world, 5);
        const by = world.genomeId[hunter];
        const f = { slot: prey, genomeId: 50, cause: DEATH_CAUSE.EATEN, spec: FORAGER, by };
        pushDied(world, { ...f, prevBiter: world.genomeId[stranger] });
        pushDied(world, { ...f, prevBiter: 0 });
        pushDied(world, { ...f, prevBiter: world.genomeId[prey] });
        observeCombat(combat, world);
        expect([combat.packKills, combat.huntKills, combat.eatenDeaths]).toEqual([0, 3, 3]);
    });

    it('finds a previous biter that died earlier, and forgets agents dead longer than the pack window', () => {
        const { world, combat, hunter, prey } = arena();
        const mate = addBorn(world, { spec: PREDATOR, lineageId: world.lineageId[hunter] });
        observeCombat(combat, world);
        nextTick(world, 5);
        pushDied(world, { slot: mate, genomeId: world.genomeId[mate], cause: DEATH_CAUSE.STARVED, spec: PREDATOR });
        observeCombat(combat, world);
        expect(combat.knownAgents.has(world.genomeId[mate])).toBe(true);
        nextTick(world, 8);
        const f = { slot: prey, genomeId: world.genomeId[prey], cause: DEATH_CAUSE.EATEN, spec: FORAGER };
        pushDied(world, { ...f, by: world.genomeId[hunter], prevBiter: world.genomeId[mate] });
        observeCombat(combat, world);
        expect(combat.packKills).toBe(1);
        nextTick(world, PRUNE_TICKS * 2);
        observeCombat(combat, world);
        expect(combat.knownAgents.has(world.genomeId[mate])).toBe(false);
        expect(combat.knownAgents.has(world.genomeId[hunter])).toBe(true);
    });
});
