import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { BLOCKED_CAUSE, BORN_CAUSE, DEATH_CAUSE, EVENT_TYPE, pushEvent } from '../../js/sim/events.js';
import { LOG_LEVEL, createSimLog, drainEvents } from '../../js/sim/log.js';
import { createWorld } from '../../js/sim/spawn.js';
import { testPolicy } from './helpers/test-policy.js';
import { SIMPLE_WORLD } from '../helpers/simple-world.js';

/**
 * @param {Record<string, any>} [over]
 * @returns {ReturnType<typeof createWorld>}
 */
function build(over = {}) {
    return createWorld(
        createConfig({
            ...SIMPLE_WORLD,
            worldWidth: 1000,
            worldHeight: 1000,
            maxAgents: 12,
            initialAgents: 3,
            minAgents: 0,
            rayCount: 4,
            brainHidden: 3,
            maxFood: 20,
            initialFood: 10,
            fertileZoneMax: 3,
            ...over,
        }),
        testPolicy,
    );
}

/**
 * @param {string} level
 * @returns {{ records: Record<string, any>[], log: ReturnType<typeof createSimLog> }}
 */
function collect(level) {
    /** @type {Record<string, any>[]} */
    const records = [];
    return { records, log: createSimLog((r) => records.push(r), { level: /** @type {any} */ (level) }) };
}

describe('createSimLog', () => {
    it('orders the levels by severity', () => {
        expect(
            LOG_LEVEL.debug < LOG_LEVEL.info && LOG_LEVEL.info < LOG_LEVEL.warn && LOG_LEVEL.warn < LOG_LEVEL.error,
        ).toBe(true);
    });

    it('defaults to info and drops lower records', () => {
        const { records, log } = collect('info');
        const dflt = createSimLog(() => {});
        log.log('debug', 'A', { x: 1 });
        log.log('info', 'B', { x: 2 });
        log.log('error', 'C');
        expect(dflt.level).toBe('info');
        expect(records).toEqual([
            { level: 'info', event: 'B', x: 2 },
            { level: 'error', event: 'C' },
        ]);
    });

    it('keeps everything at debug', () => {
        const { records, log } = collect('debug');
        log.log('debug', 'A', {});
        expect(records).toHaveLength(1);
    });

    it('throws on an unknown configured level, naming it', () => {
        expect(() => createSimLog(() => {}, { level: /** @type {any} */ ('loud') })).toThrow(
            'log: unknown level "loud", expected one of debug, info, warn, error',
        );
    });

    it('throws on an unknown record level, naming it', () => {
        const { log } = collect('info');
        expect(() => log.log(/** @type {any} */ ('toString'), 'A', {})).toThrow(/"toString"/);
    });
});

describe('drainEvents', () => {
    it('logs the initial births of a real world with cause names', () => {
        const world = build();
        const { records, log } = collect('debug');
        drainEvents(world, log);
        expect(records).toHaveLength(3);
        expect(records[0]).toMatchObject({
            level: 'debug',
            event: 'AgentBorn',
            tick: 0,
            slot: 0,
            parentA: 0,
            parentB: 0,
            cause: 'initial',
        });
        expect(Object.keys(records[0])).toEqual([
            'level',
            'event',
            'tick',
            'slot',
            'genomeId',
            'lineageId',
            'spec',
            'parentA',
            'parentB',
            'cause',
        ]);
    });

    it('logs AgentDied with its fields', () => {
        const world = build();
        world.events.count = 0;
        const o = pushEvent(world.events, EVENT_TYPE.AGENT_DIED, 7);
        world.events.data.set([5, 9, DEATH_CAUSE.EATEN, 4, 3, 8, 100, 1.5, 2.5, 6], o + 2);
        const { records, log } = collect('debug');
        drainEvents(world, log);
        expect(records).toEqual([
            {
                level: 'debug',
                event: 'AgentDied',
                tick: 7,
                slot: 5,
                genomeId: 9,
                cause: 'eaten',
                by: 4,
                spec: 3,
                lineageId: 8,
                ageTicks: 100,
                foodEnergy: 1.5,
                biteEnergy: 2.5,
                prevBiter: 6,
            },
        ]);
    });

    it('logs BirthBlocked at warn, and PopulationFloor with FloorGuard at info', () => {
        const world = build();
        world.events.count = 0;
        const a = pushEvent(world.events, EVENT_TYPE.BIRTH_BLOCKED, 3);
        world.events.data.set([6, BLOCKED_CAUSE.ENERGY], a + 2);
        const b = pushEvent(world.events, EVENT_TYPE.POPULATION_FLOOR, 4);
        world.events.data.set([2, 5], b + 2);
        const { records, log } = collect('info');
        drainEvents(world, log);
        expect(records).toEqual([
            { level: 'warn', event: 'BirthBlocked', tick: 3, slot: 6, cause: 'energy' },
            { level: 'info', event: 'PopulationFloor', tick: 4, added: 2 },
            { level: 'info', event: 'FloorGuard', tick: 4, population: 5, spawned: 2 },
        ]);
    });

    it('logs FoodPatchesCreated at info with the count and radius', () => {
        const world = build({ foodPatchCount: 4, foodPatchRadius: 100 });
        const { records, log } = collect('info');
        drainEvents(world, log);
        expect(records).toEqual([{ level: 'info', event: 'FoodPatchesCreated', tick: 0, count: 4, radius: 100 }]);
    });

    it('logs the era events at info', () => {
        const world = build();
        const season = pushEvent(world.events, EVENT_TYPE.SEASON_CHANGED, 100);
        world.events.data.set([2, 0], season + 2);
        const drought = pushEvent(world.events, EVENT_TYPE.DROUGHT_STARTED, 100);
        world.events.data.set([1, 0], drought + 2);
        const { records, log } = collect('info');
        drainEvents(world, log);
        expect(records.slice(-2)).toEqual([
            { level: 'info', event: 'SeasonChanged', tick: 100, season: 2, year: 0 },
            { level: 'info', event: 'DroughtStarted', tick: 100, basin: 1, year: 0 },
        ]);
    });

    it('skips debug records at info level without calling the sink', () => {
        const world = build();
        let calls = 0;
        const log = createSimLog(() => (calls += 1), { level: 'info' });
        drainEvents(world, log);
        expect(world.events.count).toBe(3);
        expect(calls).toBe(0);
    });

    it('names every born cause', () => {
        const world = build();
        world.events.count = 0;
        for (const cause of Object.values(BORN_CAUSE)) {
            const o = pushEvent(world.events, EVENT_TYPE.AGENT_BORN, 1);
            world.events.data[o + 8] = cause;
        }
        const { records, log } = collect('debug');
        drainEvents(world, log);
        expect(records.map((r) => r.cause)).toEqual(['initial', 'mate', 'split', 'floor', 'immigrant']);
    });

    it('logs the call and smoke events at debug with their fields', () => {
        const world = build();
        world.events.count = 0;
        const call = (/** @type {number} */ type, /** @type {number[]} */ fields) => {
            const o = pushEvent(world.events, type, 9);
            world.events.data.set(fields, o + 2);
        };
        call(EVENT_TYPE.ALARM_CALLED, [3, 30, 0, 100.5, 200.5]);
        call(EVENT_TYPE.SMOKE_RELEASED, [4, 40, 2, 110, 210, 6]);
        call(EVENT_TYPE.PACK_CALLED, [5, 50, 1, 120, 220]);
        call(EVENT_TYPE.SMOKE_REFUSED, [6, 60]);
        const { records, log } = collect('debug');
        drainEvents(world, log);
        expect(records).toEqual([
            { level: 'debug', event: 'AlarmCalled', tick: 9, slot: 3, genomeId: 30, spec: 0, x: 100.5, y: 200.5 },
            {
                level: 'debug',
                event: 'SmokeReleased',
                tick: 9,
                slot: 4,
                genomeId: 40,
                spec: 2,
                x: 110,
                y: 210,
                cloud: 6,
            },
            { level: 'debug', event: 'PackCalled', tick: 9, slot: 5, genomeId: 50, spec: 1, x: 120, y: 220 },
            { level: 'debug', event: 'SmokeRefused', tick: 9, slot: 6, genomeId: 60 },
        ]);
    });

    it('skips the call and smoke events above debug', () => {
        const world = build();
        world.events.count = 0;
        pushEvent(world.events, EVENT_TYPE.ALARM_CALLED, 1);
        const { records, log } = collect('info');
        drainEvents(world, log);
        expect(records).toEqual([]);
    });

    it('throws on an unknown event type, naming it', () => {
        const world = build();
        world.events.count = 0;
        pushEvent(world.events, 99, 1);
        expect(() => drainEvents(world, collect('debug').log)).toThrow(/unknown event type 99/);
    });

    it('throws on an unknown cause code, naming it', () => {
        const world = build();
        world.events.count = 0;
        const o = pushEvent(world.events, EVENT_TYPE.BIRTH_BLOCKED, 1);
        world.events.data[o + 3] = 7;
        expect(() => drainEvents(world, collect('debug').log)).toThrow(/cause code 7/);
    });

    it('logs AgentBorn with every field at its record offset', () => {
        const world = build();
        world.events.count = 0;
        pushEvent(world.events, EVENT_TYPE.AGENT_DIED, 0);
        const o = pushEvent(world.events, EVENT_TYPE.AGENT_BORN, 11);
        world.events.data.set([2, 31, 32, 4, 5, 6, BORN_CAUSE.SPLIT], o + 2);
        const { records, log } = collect('debug');
        drainEvents(world, { level: log.level, log: log.log });
        expect(records[1]).toEqual({
            level: 'debug',
            event: 'AgentBorn',
            tick: 11,
            slot: 2,
            genomeId: 31,
            lineageId: 32,
            spec: 4,
            parentA: 5,
            parentB: 6,
            cause: 'split',
        });
    });

    it('logs AgentSickened with its agent identity and dose', () => {
        const world = build();
        world.events.count = 0;
        const at = pushEvent(world.events, EVENT_TYPE.AGENT_SICKENED, 37);
        world.events.data.set([2, 99, 0.36], at + 2);
        const { records, log } = collect('debug');
        drainEvents(world, log);
        expect(records).toEqual([
            { level: 'debug', event: 'AgentSickened', tick: 37, slot: 2, genomeId: 99, dose: 0.36 },
        ]);
    });

    it('names every death cause', () => {
        const world = build();
        world.events.count = 0;
        for (const cause of Object.values(DEATH_CAUSE)) {
            const o = pushEvent(world.events, EVENT_TYPE.AGENT_DIED, 1);
            world.events.data[o + 4] = cause;
        }
        const { records, log } = collect('debug');
        drainEvents(world, log);
        expect(records.map((r) => r.cause)).toEqual([
            'starved',
            'eaten',
            'collision',
            'old-age',
            'poisoned',
            'trampled',
        ]);
    });

    it('names every blocked cause', () => {
        const world = build();
        world.events.count = 0;
        for (const cause of Object.values(BLOCKED_CAUSE)) {
            const o = pushEvent(world.events, EVENT_TYPE.BIRTH_BLOCKED, 1);
            world.events.data[o + 3] = cause;
        }
        const { records, log } = collect('debug');
        drainEvents(world, log);
        expect(records.map((r) => r.cause)).toEqual(['capacity', 'energy']);
    });

    it('logs MeritSummary at debug with its fields at their record offsets', () => {
        const world = build();
        world.events.count = 0;
        const o = pushEvent(world.events, EVENT_TYPE.MERIT_SUMMARY, 1000);
        world.events.data.set([55, 90, 12, 3, 0.5], o + 2);
        const { records, log } = collect('debug');
        drainEvents(world, log);
        expect(records).toEqual([
            {
                level: 'debug',
                event: 'MeritSummary',
                tick: 1000,
                meritMean: 55,
                meritP90: 90,
                readyToSplit: 12,
                gatedSplits: 3,
                deliberateReadyShare: 0.5,
            },
        ]);
        const info = collect('info');
        drainEvents(world, info.log);
        expect(info.records).toEqual([]);
    });

    it('logs LineProven at debug with the child and its parents', () => {
        const world = build();
        world.events.count = 0;
        const o = pushEvent(world.events, EVENT_TYPE.LINE_PROVEN, 4000);
        world.events.data.set([3, 77, 40, 41, 9], o + 2);
        const { records, log } = collect('debug');
        drainEvents(world, log);
        expect(records).toEqual([
            {
                level: 'debug',
                event: 'LineProven',
                tick: 4000,
                slot: 3,
                genomeId: 77,
                parentA: 40,
                parentB: 41,
                lineageId: 9,
            },
        ]);
    });

    it('does not hand records below the log level to the log at all', () => {
        const world = build();
        world.events.count = 0;
        pushEvent(world.events, EVENT_TYPE.AGENT_BORN, 1);
        pushEvent(world.events, EVENT_TYPE.POPULATION_FLOOR, 1);
        pushEvent(world.events, EVENT_TYPE.BIRTH_BLOCKED, 1);
        /** @type {string[]} */
        const seen = [];
        drainEvents(world, { level: 'warn', log: (_level, event) => seen.push(event) });
        expect(seen).toEqual(['BirthBlocked']);
    });

    it('logs a herd route change with its group and patch', () => {
        const world = build();
        world.events.count = 0;
        const offset = pushEvent(world.events, EVENT_TYPE.HERD_ROUTE_CHANGED, 12);
        world.events.data[offset + 2] = 3;
        world.events.data[offset + 3] = 7;
        const { records, log } = collect('debug');
        drainEvents(world, log);
        expect(records).toEqual([{ level: 'debug', event: 'HerdRouteChanged', tick: 12, group: 3, patch: 7 }]);
    });

    it('logs a herd stampede with its hunter and group size', () => {
        const world = build();
        world.events.count = 0;
        const offset = pushEvent(world.events, EVENT_TYPE.HERD_STAMPEDE, 16);
        world.events.data[offset + 2] = 2;
        world.events.data[offset + 3] = 5;
        world.events.data[offset + 4] = 7;
        const { records, log } = collect('debug');
        drainEvents(world, log);
        expect(records).toEqual([{ level: 'debug', event: 'HerdStampede', tick: 16, group: 2, hunter: 5, animals: 7 }]);
    });

    it('logs herd death, birth and lost carcass records', () => {
        const world = build();
        world.events.count = 0;
        let offset = pushEvent(world.events, EVENT_TYPE.HERD_ANIMAL_DIED, 20);
        world.events.data[offset + 2] = 1;
        world.events.data[offset + 3] = 4;
        world.events.data[offset + 4] = 90;
        world.events.data[offset + 5] = 12;
        world.events.data[offset + 6] = 1;
        offset = pushEvent(world.events, EVENT_TYPE.HERD_ANIMAL_BORN, 21);
        world.events.data[offset + 2] = 1;
        world.events.data[offset + 3] = 5;
        offset = pushEvent(world.events, EVENT_TYPE.HERD_CARCASS_LOST, 22);
        world.events.data[offset + 2] = 1;
        const { records, log } = collect('debug');
        drainEvents(world, log);
        expect(records).toEqual([
            { level: 'debug', event: 'HerdAnimalDied', tick: 20, herd: 1, animal: 4, age: 90, store: 12, old: true },
            { level: 'debug', event: 'HerdAnimalBorn', tick: 21, herd: 1, animal: 5 },
            { level: 'warn', event: 'HerdCarcassLost', tick: 22, herd: 1 },
        ]);
    });

    it.each([
        ['AgentBorn', EVENT_TYPE.AGENT_BORN, 8],
        ['AgentDied', EVENT_TYPE.AGENT_DIED, 4],
        ['BirthBlocked', EVENT_TYPE.BIRTH_BLOCKED, 3],
    ])('names the %s event in an unknown cause error', (event, type, offset) => {
        const world = build();
        world.events.count = 0;
        const o = pushEvent(world.events, type, 1);
        world.events.data[o + offset] = 9;
        expect(() => drainEvents(world, collect('debug').log)).toThrow(
            `drainEvents: ${event} has unknown cause code 9`,
        );
    });
});
