import { describe, expect, it } from 'vitest';
import { ELITE, placeOf } from '../../../js/evo/archive.js';
import { descriptorV1, descriptorV6 } from '../../../js/evo/descriptors.js';
import { FITNESS_V6 } from '../../../js/evo/fitness-v6.js';
import { ensureRoom } from '../../../js/evo/growable-log.js';
import { createObserver } from '../../../js/evo/observer.js';
import { POLICIES } from '../../../js/evo/policies/index.js';
import { createMapElitesV6 } from '../../../js/evo/policies/map-elites-v6.js';
import { DEATH_CAUSE, EVENT_TYPE, pushEvent } from '../../../js/sim/events.js';
import { createSimLog } from '../../../js/sim/log.js';
import { createRng } from '../../../js/sim/rng.js';
import { smallWorld } from '../../sim/helpers/small-world.js';

/**
 * @param {Record<string, any>} [options] policy options
 * @param {'debug' | 'info'} [level] the log level
 * @returns {{policy: any, world: any, observer: any, records: any[]}} a v6 policy with an observer on a small world
 */
function v6(options = {}, level = 'debug') {
    const world = smallWorld({ brainHidden: 4, maxAgents: 8 });
    /** @type {any[]} */
    const records = [];
    const log = createSimLog((r) => records.push(r), { level });
    const observer = createObserver(world.config, createRng(1));
    const policy = createMapElitesV6({ config: world.config, log, observer, ...options });
    return { policy, world, observer, records };
}

/**
 * Kills a mature agent in `slot` the way the host does: the death hook, the observer's scoring (the policy's fitness
 * into the next death-log row), the event record, then the policy's `onEvent`.
 * @param {{policy: any, world: any, observer: any}} ctx the run
 * @param {{slot: number, genomeId: number, roleSkill: number, bodyPlan: number, deliberate?: number}} agent the death
 * @returns {void}
 */
function die({ policy, world, observer }, { slot, genomeId, roleSkill, bodyPlan, deliberate = 0 }) {
    world.alive[slot] = 1;
    world.genomeId[slot] = genomeId;
    world.ageTicks[slot] = world.config.maturityTicks + 10;
    world.spec[slot] = 0;
    world.proven[slot] = 1;
    world.established[slot] = 1;
    policy.brain.onDeath(world, slot, DEATH_CAUSE.STARVED);
    observer.spec[slot] = 0;
    observer.intent.deliberateFood[slot] = deliberate;
    const fitness = policy.fitness(observer, slot, world.config);
    const row = observer.deathCount++;
    ensureRoom(observer.deaths, row);
    observer.deaths.genomeId[row] = genomeId;
    observer.deaths.fitness[row] = fitness;
    observer.deaths.roleSkill[row] = roleSkill;
    observer.deaths.bodyPlan[row] = bodyPlan;
    const o = pushEvent(world.events, EVENT_TYPE.AGENT_DIED, 900);
    const d = world.events.data;
    d[o + 2] = slot;
    d[o + 3] = genomeId;
    d[o + 6] = 0;
    d[o + 8] = world.ageTicks[slot];
    policy.onEvent(world, o);
}

describe('map-elites-v6 shape', () => {
    it('is registered and scored by fitnessV6 with descriptorV6', () => {
        const { policy } = v6();
        expect(POLICIES['map-elites-v6'].create).toBe(createMapElitesV6);
        expect(policy.name).toBe('map-elites-v6');
        expect(policy.fitnessName).toBe('v6');
        expect(policy.archive.descriptor).toBe(descriptorV6);
        expect(policy.fitness.weights).toMatchObject({ MATING: FITNESS_V6.MATING, BORN: FITNESS_V6.BORN });
    });

    it('passes fitness weight overrides to fitnessV6 and refuses an unknown one', () => {
        expect(v6({ fitnessOverrides: { MATING: 7 } }).policy.fitness.weights.MATING).toBe(7);
        expect(() => v6({ fitnessOverrides: { NOPE: 1 } })).toThrow(/NOPE/);
    });

    it('places by a descriptor named in the options, and refuses an unregistered name', () => {
        expect(v6({ descriptor: 'v1' }).policy.archive.descriptor).toBe(descriptorV1);
        expect(v6({ descriptor: 'v6' }).policy.archive.descriptor).toBe(descriptorV6);
        expect(() => v6({ descriptor: 'v7' })).toThrow(/unknown descriptor "v7"; known: v1, v6/);
    });

    it('takes the immigrant mix options', () => {
        expect(() => v6({ archiveShare: 0.9, cloneShareEnd: 0.5 })).toThrow(/archiveShare/);
    });
});

describe('map-elites-v6 placement and FitnessScored', () => {
    it('places a death at its role skill (x) and body plan (y)', () => {
        const ctx = v6();
        die(ctx, { slot: 3, genomeId: 600, roleSkill: 0.85, bodyPlan: 0.35 });
        expect(ctx.policy.archive.ids[placeOf(0, 3 * 10 + 8, ELITE)]).toBe(600);
    });

    it('logs FitnessScored for an offered death with the group values and the diversity factor', () => {
        const ctx = v6();
        die(ctx, { slot: 3, genomeId: 600, roleSkill: 0.85, bodyPlan: 0.35, deliberate: 1000 });
        const scored = ctx.records.filter((r) => r.event === 'FitnessScored');
        expect(scored).toHaveLength(1);
        expect(scored[0]).toMatchObject({
            level: 'debug',
            tick: 900,
            genomeId: 600,
            spec: 0,
            cell: 38,
            fitness: ctx.observer.deaths.fitness[0],
            waste: 0,
            lineage: 0,
            watch: 0,
            diversityFactor: 1,
        });
        expect(scored[0].skill).toBeGreaterThanOrEqual(1000);
        expect(scored[0].fitness).toBe(scored[0].skill);
    });

    it('reports the lineage and watch values as paid, after the skill gate, and the niche factor', () => {
        const ctx = v6();
        ctx.observer.matings[2] = 1;
        ctx.observer.packKills[2] = 1;
        ctx.observer.niche[2] = 0;
        ctx.observer.nicheTally = { count: 15, shares: new Float64Array(15) };
        die(ctx, { slot: 2, genomeId: 601, roleSkill: 1, bodyPlan: 0.5, deliberate: 1000 });
        const scored = ctx.records.find((r) => r.event === 'FitnessScored');
        expect(scored).toMatchObject({ lineage: 100, watch: 30, diversityFactor: 1.5 });
    });

    it('logs nothing and adds no columns below the debug level', () => {
        const ctx = v6({}, 'info');
        die(ctx, { slot: 3, genomeId: 600, roleSkill: 0.85, bodyPlan: 0.35, deliberate: 1000 });
        expect(ctx.records.some((r) => r.event === 'FitnessScored')).toBe(false);
        expect(ctx.observer.deaths.scoreSkill).toBeUndefined();
        expect(ctx.policy.archive.ids[placeOf(0, 38, ELITE)]).toBe(600);
    });

    it('keeps the part columns in step with the death log when it doubles', () => {
        const ctx = v6();
        const { observer, world, policy } = ctx;
        observer.deathCount = observer.deaths.capacity;
        policy.fitness(observer, 0, world.config);
        expect(observer.deaths.scoreSkill.length).toBe(observer.deaths.fitness.length);
        expect(observer.deaths.fitness.length).toBeGreaterThan(64);
    });
});
