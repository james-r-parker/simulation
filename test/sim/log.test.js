import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { BLOCKED_CAUSE, BORN_CAUSE, DEATH_CAUSE, EVENT_TYPE, pushEvent } from '../../js/sim/events.js';
import { LOG_LEVEL, createSimLog, drainEvents } from '../../js/sim/log.js';
import { createWorld } from '../../js/sim/spawn.js';
import { testPolicy } from './helpers/test-policy.js';

/**
 * @param {Record<string, any>} [over]
 * @returns {ReturnType<typeof createWorld>}
 */
function build(over = {}) {
    return createWorld(
        createConfig({
            worldWidth: 1000,
            worldHeight: 1000,
            maxAgents: 12,
            initialAgents: 3,
            minAgents: 0,
            rayCount: 4,
            brainHidden: 3,
            maxFood: 20,
            initialFood: 10,
            obstacleCount: 2,
            obstacleMinRadius: 20,
            obstacleMaxRadius: 60,
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
        expect(() => createSimLog(() => {}, { level: /** @type {any} */ ('loud') })).toThrow(/"loud"/);
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
        world.events.data.set([5, 9, DEATH_CAUSE.EATEN, 4, 3, 8, 100, 1.5, 2.5], o + 2);
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
            },
        ]);
    });

    it('logs BirthBlocked at warn and PopulationFloor at info', () => {
        const world = build();
        world.events.count = 0;
        const a = pushEvent(world.events, EVENT_TYPE.BIRTH_BLOCKED, 3);
        world.events.data.set([6, BLOCKED_CAUSE.ENERGY], a + 2);
        const b = pushEvent(world.events, EVENT_TYPE.POPULATION_FLOOR, 4);
        world.events.data[b + 2] = 2;
        const { records, log } = collect('info');
        drainEvents(world, log);
        expect(records).toEqual([
            { level: 'warn', event: 'BirthBlocked', tick: 3, slot: 6, cause: 'energy' },
            { level: 'info', event: 'PopulationFloor', tick: 4, added: 2 },
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
});
