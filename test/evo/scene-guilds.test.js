import { describe, expect, it } from 'vitest';
import { BORN_CAUSE, DEATH_CAUSE } from '../../js/sim/events.js';
import { BURN_IN_TICKS } from '../../js/evo/burn-in.js';
import {
    createGuildScene,
    GUILD_SAMPLE_TICKS,
    guildsDetector,
    guildMetrics,
    noteGuildAlarm,
    noteGuildBirth,
    noteGuildDeath,
    sampleGuilds,
    tickGuilds,
} from '../../js/evo/scene-guilds.js';
import { METRICS } from '../../js/evo/metric-registry/index.js';
import { directionOf, namesOf } from './helpers/metric-registry.js';

const GUILD_NAMES = [
    'eval.guild_share.forager',
    'eval.guild_share.reproducer',
    'eval.guild_share.scout',
    'eval.guild_share.defender',
    'eval.guild_survival.forager',
    'eval.guild_survival.reproducer',
    'eval.guild_survival.scout',
    'eval.guild_survival.defender',
    'eval.prey_selectivity.forager',
    'eval.prey_selectivity.reproducer',
    'eval.prey_selectivity.scout',
    'eval.prey_selectivity.defender',
    'eval.defender_repel_per_1k',
    'eval.scout_alarm_lead_share',
    'eval.reproducer_recovery_rate',
];

/**
 * @param {number} n slots
 * @returns {Record<string, any>} minimal world fixture
 */
function makeWorld(n = 8) {
    return {
        tick: BURN_IN_TICKS,
        population: 0,
        alive: new Uint8Array(n),
        spec: new Uint8Array(n),
        huntBySpec: new Uint8Array([0, 1, 0, 0, 0]),
        alarmSeen: new Uint8Array(n),
        x: new Float64Array(n),
        y: new Float64Array(n),
    };
}

describe('scene-guilds', () => {
    it('registers every emitted guild metric with its expected direction', () => {
        const scene = createGuildScene({ maxAgeTicks: 1000, callRadius: 200, initialAgents: 0 });
        const emitted = Object.keys(guildMetrics(scene));
        expect(emitted).toEqual(GUILD_NAMES);
        expect(namesOf('js/evo/scene-guilds.js')).toEqual([...GUILD_NAMES].sort());
        expect(directionOf('eval.defender_repel_per_1k')).toBe('higher');
        expect(directionOf('eval.scout_alarm_lead_share')).toBe('higher');
        expect(directionOf('eval.reproducer_recovery_rate')).toBe('watch');
    });

    it('tracks guild shares and defender ticks after burn-in only', () => {
        const scene = createGuildScene({ maxAgeTicks: 1000, callRadius: 200, initialAgents: 5 });
        const w = makeWorld(5);
        w.alive.set([1, 1, 1, 1, 1]);
        w.spec.set([0, 1, 2, 3, 4]);
        w.population = 5;

        w.tick = BURN_IN_TICKS - 1;
        sampleGuilds(scene, w);
        tickGuilds(scene, w);
        expect(guildMetrics(scene)['eval.guild_share.forager']?.value).toBeNull();
        expect(guildMetrics(scene)['eval.defender_repel_per_1k']?.value).toBeNull();

        w.tick = BURN_IN_TICKS;
        sampleGuilds(scene, w);
        tickGuilds(scene, w);
        const m = guildMetrics(scene);
        expect(m['eval.guild_share.forager']?.value).toBeCloseTo(0.2, 6);
        expect(m['eval.guild_share.reproducer']?.value).toBeCloseTo(0.2, 6);
        expect(m['eval.guild_share.scout']?.value).toBeCloseTo(0.2, 6);
        expect(m['eval.guild_share.defender']?.value).toBeCloseTo(0.2, 6);
        expect(m['eval.defender_repel_per_1k']?.value).toBe(0);
    });

    it('tracks guild survival, scout alarm lead share, and reproducer recovery rate', () => {
        const scene = createGuildScene({ maxAgeTicks: 1000, callRadius: 200, initialAgents: 50 });
        const w = makeWorld(4);

        noteGuildDeath(scene, { tick: BURN_IN_TICKS, spec: 0, age: 500 });
        noteGuildDeath(scene, { tick: BURN_IN_TICKS, spec: 2, age: 250 });
        noteGuildDeath(scene, { tick: BURN_IN_TICKS, spec: 3, age: 750 });
        noteGuildDeath(scene, { tick: BURN_IN_TICKS, spec: 4, age: 1000 });

        // Scout alarm with threat outside half callRadius (100px) -> lead; inside -> not lead
        w.alive[0] = 1;
        w.spec[0] = 3;
        w.alarmSeen[0] = 1;
        w.x[0] = 0;
        w.y[0] = 0;
        w.alive[1] = 1;
        w.spec[1] = 1;
        w.x[1] = 150;
        w.y[1] = 0;
        noteGuildAlarm(scene, w, 0);

        w.x[1] = 60;
        noteGuildAlarm(scene, w, 0);

        // Recovery births while prevPop < 120
        noteGuildBirth(scene, { tick: BURN_IN_TICKS, spec: 2, cause: BORN_CAUSE.MATE });
        noteGuildBirth(scene, { tick: BURN_IN_TICKS, spec: 0, cause: BORN_CAUSE.SPLIT });

        const m = guildMetrics(scene);
        expect(m['eval.guild_survival.forager']?.value).toBeCloseTo(0.5, 6);
        expect(m['eval.guild_survival.reproducer']?.value).toBeCloseTo(0.25, 6);
        expect(m['eval.guild_survival.scout']?.value).toBeCloseTo(0.75, 6);
        expect(m['eval.guild_survival.defender']?.value).toBeCloseTo(1.0, 6);
        expect(m['eval.scout_alarm_lead_share']?.value).toBeCloseTo(0.5, 6);
        expect(m['eval.reproducer_recovery_rate']?.value).toBeCloseTo(0.5, 6);
    });

    it('measures each guild share of eaten deaths against its share of living prey', () => {
        const scene = createGuildScene({ maxAgeTicks: 1000, callRadius: 200, initialAgents: 5 });
        const world = makeWorld(6);
        world.alive.set([1, 1, 1, 1, 1, 1]);
        world.spec.set([0, 0, 2, 3, 4, 1]);
        sampleGuilds(scene, world);

        noteGuildDeath(scene, { tick: BURN_IN_TICKS, spec: 0, age: 10, cause: DEATH_CAUSE.EATEN });
        noteGuildDeath(scene, { tick: BURN_IN_TICKS, spec: 0, age: 10, cause: DEATH_CAUSE.EATEN });
        noteGuildDeath(scene, { tick: BURN_IN_TICKS, spec: 0, age: 10, cause: DEATH_CAUSE.EATEN });
        noteGuildDeath(scene, { tick: BURN_IN_TICKS, spec: 2, age: 10, cause: DEATH_CAUSE.EATEN });
        noteGuildDeath(scene, { tick: BURN_IN_TICKS, spec: 3, age: 10, cause: DEATH_CAUSE.EATEN });
        noteGuildDeath(scene, { tick: BURN_IN_TICKS, spec: 4, age: 10, cause: DEATH_CAUSE.OLD_AGE });

        const metrics = guildMetrics(scene);
        expect(metrics['eval.prey_selectivity.forager']?.value).toBeCloseTo(1.5, 6);
        expect(metrics['eval.prey_selectivity.reproducer']?.value).toBe(1);
        expect(metrics['eval.prey_selectivity.scout']?.value).toBe(1);
        expect(metrics['eval.prey_selectivity.defender']?.value).toBe(0);
    });

    it('starts recovery counting from an empty population when initialAgents is omitted', () => {
        const scene = createGuildScene({ maxAgeTicks: 1000, callRadius: 200 });
        noteGuildBirth(scene, { tick: BURN_IN_TICKS, spec: 2, cause: BORN_CAUSE.MATE });
        expect(guildMetrics(scene)['eval.reproducer_recovery_rate']?.value).toBe(1);
    });

    it('skips a checkpoint with nobody alive', () => {
        const scene = createGuildScene({ maxAgeTicks: 1000, callRadius: 200, initialAgents: 5 });
        sampleGuilds(scene, makeWorld(4));
        expect(guildMetrics(scene)['eval.guild_share.forager']?.value).toBeNull();
    });

    it('ignores deaths before burn-in and hunter deaths', () => {
        const scene = createGuildScene({ maxAgeTicks: 1000, callRadius: 200, initialAgents: 5 });
        noteGuildDeath(scene, { tick: BURN_IN_TICKS - 1, spec: 0, age: 500 });
        noteGuildDeath(scene, { tick: BURN_IN_TICKS, spec: 1, age: 500 });
        const m = guildMetrics(scene);
        expect(m['eval.guild_survival.forager']?.value).toBeNull();
        expect(m['eval.guild_survival.reproducer']?.value).toBeNull();
    });

    it('counts only mate and split births during a low population after burn-in', () => {
        const low = createGuildScene({ maxAgeTicks: 1000, callRadius: 200, initialAgents: 50 });
        noteGuildBirth(low, { tick: BURN_IN_TICKS - 1, spec: 2, cause: BORN_CAUSE.MATE });
        noteGuildBirth(low, { tick: BURN_IN_TICKS, spec: 2, cause: BORN_CAUSE.INITIAL });
        expect(guildMetrics(low)['eval.reproducer_recovery_rate']?.value).toBeNull();

        const high = createGuildScene({ maxAgeTicks: 1000, callRadius: 200, initialAgents: 500 });
        noteGuildBirth(high, { tick: BURN_IN_TICKS, spec: 2, cause: BORN_CAUSE.MATE });
        expect(guildMetrics(high)['eval.reproducer_recovery_rate']?.value).toBeNull();
    });

    it('ignores alarms before burn-in, from non-scouts and without a threat seen', () => {
        const scene = createGuildScene({ maxAgeTicks: 1000, callRadius: 200, initialAgents: 5 });
        const w = makeWorld(4);
        w.alive[0] = 1;
        w.spec[0] = 3;
        w.alarmSeen[0] = 1;
        w.tick = BURN_IN_TICKS - 1;
        noteGuildAlarm(scene, w, 0);
        w.tick = BURN_IN_TICKS;
        w.spec[0] = 0;
        noteGuildAlarm(scene, w, 0);
        w.spec[0] = 3;
        w.alarmSeen[0] = 0;
        noteGuildAlarm(scene, w, 0);
        expect(guildMetrics(scene)['eval.scout_alarm_lead_share']?.value).toBeNull();
    });

    it('does not count a dead hunter or a non-hunter as a close threat', () => {
        const scene = createGuildScene({ maxAgeTicks: 1000, callRadius: 200, initialAgents: 5 });
        const w = makeWorld(4);
        w.alive.set([1, 0, 1, 0]);
        w.spec.set([3, 1, 0, 0]);
        w.alarmSeen[0] = 1;
        noteGuildAlarm(scene, w, 0);
        expect(guildMetrics(scene)['eval.scout_alarm_lead_share']?.value).toBe(1);
    });
});

describe('scene-guilds: the checkpoint cadence', () => {
    it('samples every GUILD_SAMPLE_TICKS (1000) ticks and the registry text says the same', () => {
        expect(GUILD_SAMPLE_TICKS).toBe(1000);
        const w = makeWorld(5);
        w.alive.set([1, 1, 1, 1, 1]);
        w.spec.set([0, 1, 2, 3, 4]);
        const scene = createGuildScene({ maxAgeTicks: 1000, callRadius: 200, initialAgents: 5 });
        w.tick = BURN_IN_TICKS + 100;
        guildsDetector.onTick(scene, w);
        expect(scene.shareSamples).toBe(0);
        w.tick = BURN_IN_TICKS + GUILD_SAMPLE_TICKS;
        guildsDetector.onTick(scene, w);
        expect(scene.shareSamples).toBe(1);
        const e = /** @type {any} */ (METRICS)['eval.guild_share.forager'];
        expect(e.nullWhen).toEqual([`no ${GUILD_SAMPLE_TICKS}-tick checkpoint after burn-in`]);
        expect(e.counts).toContain(`${GUILD_SAMPLE_TICKS}-tick checkpoints`);
        expect(guildMetrics(scene)['eval.guild_share.forager']?.value).toBeCloseTo(0.2, 6);
    });
});
