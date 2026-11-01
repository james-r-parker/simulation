import { describe, expect, it } from 'vitest';
import { createArchive } from '../../js/evo/archive.js';
import { createObserver } from '../../js/evo/observer.js';
import { BORN_CAUSE, DEATH_CAUSE, EVENT_TYPE, pushEvent } from '../../js/sim/events.js';
import { brainLayout } from '../../js/sim/brain-layout.js';
import { createRng } from '../../js/sim/rng.js';
import {
    FLOOR_AFTER_TICK,
    HUNT_STREAK_KILLS,
    PENDING_CAP,
    collectStats,
    createLiveStats,
    noteLogRecord,
    noteTick,
    tickerEvents,
} from '../../js/worker/live-stats.js';
import { createGenerations } from '../../js/worker/generation.js';
import { smallWorld } from '../sim/helpers/small-world.js';

const RUN = {
    ticksPerSecond: 58,
    requestedTicksPerSecond: 60,
    droppedTicks: 3,
    workerMsPerTick: 1.5,
    seed: 9,
    configHash: 'h',
};

/**
 * @param {Record<string, any>} [over] config overrides
 * @returns {{world: ReturnType<typeof smallWorld>, observer: Record<string, any>, live: ReturnType<typeof createLiveStats>,
 *   policy: Record<string, any>}} a world, its observer, fresh state and a policy with a name only
 */
function setup(over = {}) {
    const world = smallWorld(over);
    return {
        world,
        observer: createObserver(world.config, createRng(1)),
        live: createLiveStats(),
        policy: { name: 'test-policy' },
    };
}

/**
 * @param {ReturnType<typeof smallWorld>} world the world
 * @param {number} type an `EVENT_TYPE`
 * @param {number} tick the event's tick
 * @param {number[]} fields the record's fields 2 and up
 * @returns {void}
 */
function event(world, type, tick, fields) {
    const o = pushEvent(world.events, type, tick);
    fields.forEach((value, i) => {
        world.events.data[o + 2 + i] = value;
    });
}

describe('noteTick', () => {
    it('queues pack-kill for an eaten death whose prevBiter is set', () => {
        const { world, observer, live } = setup();
        event(world, EVENT_TYPE.AGENT_DIED, 50, [0, 7, DEATH_CAUSE.EATEN, 99, 0, 3, 0, 0, 0, 55]);
        noteTick(live, world, observer);
        expect(tickerEvents(live)).toEqual([
            { tick: 50, kind: 'pack-kill', text: 'pack kill', genomeId: 99, lineageId: 3 },
        ]);
    });

    it('queues nothing for an eaten death with no prevBiter, a starved death or a death with no killer', () => {
        const { world, observer, live } = setup();
        event(world, EVENT_TYPE.AGENT_DIED, 50, [0, 7, DEATH_CAUSE.EATEN, 99, 0, 3]);
        event(world, EVENT_TYPE.AGENT_DIED, 50, [1, 8, DEATH_CAUSE.STARVED, 0, 0, 3, 0, 0, 0, 55]);
        event(world, EVENT_TYPE.AGENT_DIED, 50, [2, 9, DEATH_CAUSE.EATEN, 0, 0, 3, 0, 0, 0, 55]);
        noteTick(live, world, observer);
        expect(tickerEvents(live)).toEqual([]);
    });

    it("queues hunt-streak at a predator's fifth kill only", () => {
        const { world, observer, live } = setup();
        world.alive[2] = 1;
        world.x[2] = 40;
        world.y[2] = 50;
        observer.slotOf.set(99, 2);
        observer.spec[2] = 1;
        observer.kills[2] = HUNT_STREAK_KILLS - 1;
        event(world, EVENT_TYPE.AGENT_DIED, 60, [0, 7, DEATH_CAUSE.EATEN, 99, 0, 3]);
        noteTick(live, world, observer);
        expect(tickerEvents(live)).toEqual([]);
        observer.kills[2] = HUNT_STREAK_KILLS;
        noteTick(live, world, observer);
        expect(tickerEvents(live)).toMatchObject([{ kind: 'hunt-streak', genomeId: 99, x: 40, y: 50 }]);
    });

    it('does not announce a fifth kill by an agent that cannot hunt', () => {
        const { world, observer, live } = setup();
        world.alive[2] = 1;
        observer.slotOf.set(99, 2);
        observer.spec[2] = 0;
        observer.kills[2] = HUNT_STREAK_KILLS;
        event(world, EVENT_TYPE.AGENT_DIED, 60, [0, 7, DEATH_CAUSE.EATEN, 99, 0, 3]);
        noteTick(live, world, observer);
        expect(tickerEvents(live)).toEqual([]);
    });

    it('queues floor only after the burn-in tick', () => {
        const { world, observer, live } = setup();
        event(world, EVENT_TYPE.POPULATION_FLOOR, FLOOR_AFTER_TICK, [4]);
        noteTick(live, world, observer);
        expect(tickerEvents(live)).toEqual([]);
        world.events.count = 0;
        event(world, EVENT_TYPE.POPULATION_FLOOR, FLOOR_AFTER_TICK + 1, [4]);
        noteTick(live, world, observer);
        expect(tickerEvents(live)).toMatchObject([{ tick: FLOOR_AFTER_TICK + 1, kind: 'floor' }]);
    });
});

describe('the ticker queue', () => {
    it('drains once and then is empty', () => {
        const { live } = setup();
        noteLogRecord(live, { event: 'ArchiveReplaced', spec: 1, cell: 4, newId: 12 }, 70);
        expect(tickerEvents(live)).toHaveLength(1);
        expect(tickerEvents(live)).toEqual([]);
    });

    it('turns ArchiveReplaced into an elite item and remembers it, and ignores other records', () => {
        const { live } = setup();
        noteLogRecord(live, { event: 'ChallengerSet', spec: 1, cell: 4 }, 69);
        noteLogRecord(live, { event: 'ArchiveReplaced', spec: 1, cell: 4, newId: 12 }, 70);
        expect(tickerEvents(live)).toMatchObject([{ tick: 70, kind: 'elite', genomeId: 12 }]);
        expect(live.newestReplacement).toEqual({ spec: 1, cell: 4, tick: 70 });
    });

    it('holds at most 32 items and drops the oldest', () => {
        const { live } = setup();
        for (let i = 0; i < PENDING_CAP + 5; i++) {
            noteLogRecord(live, { event: 'ArchiveReplaced', spec: 0, cell: 0, newId: i }, i);
        }
        const items = tickerEvents(live);
        expect(items).toHaveLength(PENDING_CAP);
        expect(items[0].tick).toBe(5);
    });
});

describe('collectStats', () => {
    it('reports pace, identity, the season and the population by type', () => {
        const { world, observer, live, policy } = setup({ eraSeasonTicks: 100 });
        world.tick = 150;
        world.season[0] = 1;
        world.season[1] = 150 / 400;
        for (const [slot, spec] of [
            [0, 0],
            [1, 1],
            [2, 1],
        ]) {
            world.alive[slot] = 1;
            world.spec[slot] = spec;
            world.lineageId[slot] = 5;
        }
        world.population = 3;
        const stats = collectStats(
            live,
            { world, observer, policy, generations: createGenerations(world.config) },
            RUN,
        );
        expect(stats).toMatchObject({
            tick: 150,
            ticksPerSecond: 58,
            requestedTicksPerSecond: 60,
            droppedTicks: 3,
            season: 1,
            population: 3,
            bySpec: [1, 2, 0, 0, 0],
            seed: 9,
            configHash: 'h',
            policy: 'test-policy',
            workerMsPerTick: 1.5,
        });
        expect(stats.seasonProgress).toBeCloseTo(0.5, 9);
        expect([stats.generationMax, stats.generationMedian]).toEqual([0, 0]);
    });

    it('reports the predators, the calls per 1000 ticks and the largest specialisation', () => {
        const { world, observer, live, policy } = setup();
        for (const [slot, spec] of [
            [0, 3],
            [1, 3],
            [2, 3],
            [3, 1],
        ]) {
            world.alive[slot] = 1;
            world.spec[slot] = spec;
        }
        world.population = 4;
        world.tick = 10;
        event(world, EVENT_TYPE.ALARM_CALLED, 10, []);
        noteTick(live, world, observer);
        const stats = collectStats(
            live,
            { world, observer, policy, generations: createGenerations(world.config) },
            RUN,
        );
        expect(stats).toMatchObject({ predators: 1, callsPerKiloTick: 100, largestSpec: { index: 3, share: 0.75 } });
    });

    it('reports births and deaths since the last stats message', () => {
        const { world, observer, live, policy } = setup();
        observer.births[BORN_CAUSE.MATE] = 4;
        observer.births[BORN_CAUSE.FLOOR] = 1;
        observer.deathsByCause[DEATH_CAUSE.EATEN] = 2;
        const first = collectStats(
            live,
            { world, observer, policy, generations: createGenerations(world.config) },
            RUN,
        );
        expect(first).toMatchObject({ births: 5, deaths: 2 });
        expect(first.birthsByCause).toEqual([0, 4, 0, 1, 0]);
        expect(first.deathsByCause).toEqual([0, 2, 0, 0, 0, 0]);
        observer.births[BORN_CAUSE.SPLIT] = 3;
        const second = collectStats(
            live,
            { world, observer, policy, generations: createGenerations(world.config) },
            RUN,
        );
        expect(second).toMatchObject({ births: 3, deaths: 0, birthsByCause: [0, 0, 3, 0, 0] });
    });

    it('reports bornShare as null before any birth after burn-in and as mate plus split over all after', () => {
        const { world, observer, live, policy } = setup();
        expect(
            collectStats(live, { world, observer, policy, generations: createGenerations(world.config) }, RUN)
                .bornShare,
        ).toBeNull();
        observer.birthsAfterBurnIn[BORN_CAUSE.MATE] = 2;
        observer.birthsAfterBurnIn[BORN_CAUSE.SPLIT] = 1;
        observer.birthsAfterBurnIn[BORN_CAUSE.FLOOR] = 1;
        expect(
            collectStats(live, { world, observer, policy, generations: createGenerations(world.config) }, RUN)
                .bornShare,
        ).toBe(0.75);
    });

    it('leaves combat null when the observer has no combat counters, then reports the change', () => {
        const { world, observer, live, policy } = setup();
        const counters = observer.combat;
        delete observer.combat;
        expect(
            collectStats(live, { world, observer, policy, generations: createGenerations(world.config) }, RUN).combat,
        ).toBeNull();
        expect(counters).toBeDefined();
        observer.combat = { caughtEpisodes: 5, escapedEpisodes: 2, huntKills: 4, packKills: 1 };
        expect(
            collectStats(live, { world, observer, policy, generations: createGenerations(world.config) }, RUN).combat,
        ).toEqual({
            caught: 5,
            escaped: 2,
            huntKills: 4,
            packKills: 1,
        });
        observer.combat = { caughtEpisodes: 6, escapedEpisodes: 2, huntKills: 4, packKills: 3 };
        expect(
            collectStats(live, { world, observer, policy, generations: createGenerations(world.config) }, RUN).combat,
        ).toEqual({
            caught: 1,
            escaped: 0,
            huntKills: 0,
            packKills: 2,
        });
    });

    it('lists the lineages alive, largest first, with their shares', () => {
        const { world, observer, live, policy } = setup();
        [
            [0, 4],
            [1, 4],
            [2, 9],
        ].forEach(([slot, lineage]) => {
            world.alive[slot] = 1;
            world.lineageId[slot] = lineage;
        });
        world.population = 3;
        const { lineages } = collectStats(
            live,
            { world, observer, policy, generations: createGenerations(world.config) },
            RUN,
        );
        expect(lineages.count).toBe(2);
        expect(lineages.top).toEqual([
            { id: 4, count: 2, share: 2 / 3 },
            { id: 9, count: 1, share: 1 / 3 },
        ]);
    });

    it('queues new-leader and extinct items from the lineage counts', () => {
        const { world, observer, live, policy } = setup({ maxAgents: 16 });
        world.tick = 20000;
        for (let slot = 0; slot < 12; slot++) {
            world.alive[slot] = 1;
            world.lineageId[slot] = 7;
        }
        collectStats(live, { world, observer, policy, generations: createGenerations(world.config) }, RUN);
        expect(tickerEvents(live)).toMatchObject([{ kind: 'new-leader', lineageId: 7 }]);
        world.alive.fill(0);
        world.alive[0] = 1;
        world.lineageId[0] = 8;
        collectStats(live, { world, observer, policy, generations: createGenerations(world.config) }, RUN);
        expect(tickerEvents(live).map((i) => i.kind)).toContain('extinct');
    });

    it('queues an elder item once as an agent crosses 90% of maxAgeTicks', () => {
        const { world, observer, live, policy } = setup({ maxAgeTicks: 1000 });
        world.alive[0] = 1;
        world.genomeId[0] = 33;
        world.tick = 100;
        world.ageTicks[0] = 899;
        collectStats(live, { world, observer, policy, generations: createGenerations(world.config) }, RUN);
        expect(tickerEvents(live)).toEqual([]);
        world.tick = 110;
        world.ageTicks[0] = 909;
        collectStats(live, { world, observer, policy, generations: createGenerations(world.config) }, RUN);
        expect(tickerEvents(live)).toMatchObject([{ kind: 'elder', genomeId: 33 }]);
        world.tick = 120;
        world.ageTicks[0] = 919;
        collectStats(live, { world, observer, policy, generations: createGenerations(world.config) }, RUN);
        expect(tickerEvents(live)).toEqual([]);
    });

    it('reports the archive of a policy that has one and null for one that has none', () => {
        const { world, observer, live, policy } = setup();
        expect(
            collectStats(live, { world, observer, policy, generations: createGenerations(world.config) }, RUN).archive,
        ).toBeNull();
        const archive = createArchive(brainLayout(world.config));
        archive.occupied[2 * 100 * 2] = 1;
        live.newestReplacement = { spec: 2, cell: 0, tick: 5 };
        const { archive: reported } = collectStats(
            live,
            { world, observer, policy: { ...policy, archive }, generations: createGenerations(world.config) },
            RUN,
        );
        expect(reported).toEqual({
            coverage: 1 / 500,
            occupiedCount: [0, 0, 1, 0, 0],
            newestReplacement: { spec: 2, cell: 0, tick: 5 },
        });
    });
});
