// The recruitment cohort detectors (honest-budgets T33a) against hand-built `AgentBorn`, `HunterKill`, `HunterLedger` and
// `LastHunterDied` records: the cohort and its sources, slot reuse, censoring at the run boundary, the milestones and the
// two kinds of extinction.

import { describe, expect, it } from 'vitest';
import { BORN_CAUSE, DEATH_CAUSE, EVENT_TYPE, createEventRing, pushEvent } from '../../js/sim/events.js';
import { BIRTH_SOURCE } from '../../js/sim/hunter-ledger.js';
import { BURN_IN_TICKS } from '../../js/evo/burn-in.js';
import {
    RECRUIT_SOURCES,
    createRecruitScene,
    noteRecruitBirth,
    noteRecruitRecord,
    recruitMetrics,
    tickRecruit,
} from '../../js/evo/scene-recruit.js';

const MATURITY = 100;
const AFTER = BURN_IN_TICKS + 10;

/** @returns {Record<string, any>} a hand-built world of 8 slots; spec 1 hunts */
function makeWorld() {
    return {
        genomeId: new Uint32Array(8),
        alive: new Uint8Array(8),
        ageTicks: new Float64Array(8),
        birthSource: new Uint8Array(8),
        huntBySpec: new Float64Array([0, 1]),
    };
}

/**
 * Feeds one `AgentBorn` record (spec 1 hunts) and leaves the child alive in its slot.
 * @param {Record<string, any>} scene the recruit scene
 * @param {Record<string, any>} world the world
 * @param {{slot: number, genome: number, source?: number, spec?: number, tick?: number, lineage?: number, a?: number, b?: number, cause?: number, stale?: boolean}} child the child
 * @returns {void}
 */
function born(scene, world, child) {
    const { slot, genome, source = BIRTH_SOURCE.FLOOR, spec = 1, tick = AFTER } = child;
    world.genomeId[slot] = child.stale ? genome + 1000 : genome;
    world.alive[slot] = 1;
    world.birthSource[slot] = source;
    const ring = createEventRing(1);
    const o = pushEvent(ring, EVENT_TYPE.AGENT_BORN, tick);
    const d = ring.data;
    d[o + 2] = slot;
    d[o + 3] = genome;
    d[o + 4] = child.lineage ?? 1;
    d[o + 5] = spec;
    d[o + 6] = child.a ?? 0;
    d[o + 7] = child.b ?? 0;
    d[o + 8] = child.cause ?? BORN_CAUSE.FLOOR;
    noteRecruitBirth(scene, world, d, o);
}

/**
 * @param {Record<string, any>} scene the recruit scene
 * @param {Record<string, any>} world the world
 * @param {{genome: number, age: number, cause?: number, kills?: number, tick?: number, slot?: number}} death a hunter's death
 * @returns {void}
 */
function died(scene, world, { genome, age, cause = DEATH_CAUSE.STARVED, kills = 0, tick = AFTER + 500, slot }) {
    const ring = createEventRing(1);
    const o = pushEvent(ring, EVENT_TYPE.HUNTER_LEDGER, tick);
    ring.data[o + 2] = genome;
    ring.data[o + 3] = age;
    ring.data[o + 4] = (kills * 8 + cause) * 8;
    noteRecruitRecord(scene, ring.data, o);
    if (slot !== undefined) {
        world.alive[slot] = 0;
    }
}

/**
 * @param {Record<string, any>} scene the recruit scene
 * @param {number} genome the killer
 * @param {number} count the killer's kills so far
 * @returns {void}
 */
function killed(scene, genome, count) {
    const ring = createEventRing(1);
    const o = pushEvent(ring, EVENT_TYPE.HUNTER_KILL, AFTER + 50);
    ring.data[o + 2] = genome;
    ring.data[o + 4] = count;
    noteRecruitRecord(scene, ring.data, o);
}

/** @returns {Record<string, any>} a scene with `MATURITY` maturity ticks */
function fresh() {
    return createRecruitScene({ maturityTicks: MATURITY });
}

describe('the cohort', () => {
    it('holds the hunters born after burn-in, not foragers and not the founders', () => {
        const scene = fresh();
        const world = makeWorld();
        born(scene, world, { slot: 0, genome: 1, tick: 0, source: BIRTH_SOURCE.INITIAL });
        born(scene, world, { slot: 1, genome: 2, tick: BURN_IN_TICKS - 1 });
        born(scene, world, { slot: 2, genome: 3 });
        born(scene, world, { slot: 3, genome: 4, spec: 0 });
        world.ageTicks[2] = 300;
        expect(recruitMetrics(scene, world)['eval.recruit_cohort']).toEqual({ value: 1 });
    });

    it('is null with a reason before any hunter is born after burn-in', () => {
        const m = recruitMetrics(fresh(), makeWorld());
        expect(m['eval.recruit_cohort']).toEqual({ value: null, reason: 'no hunter born after burn-in' });
        expect(m['eval.recruit_matured_share']?.value).toBeNull();
        expect(m['eval.recruit_replaced_share.floor']?.value).toBeNull();
        expect(m['eval.hunter_starve_age_median']?.value).toBeNull();
    });

    it('skips a record whose slot holds another agent (born and died within the tick)', () => {
        const scene = fresh();
        const world = makeWorld();
        born(scene, world, { slot: 0, genome: 5, stale: true });
        expect(recruitMetrics(scene, world)['eval.recruit_cohort']?.value).toBeNull();
    });
});

describe('birth sources', () => {
    it('separates mating, split and flip births, and counts an immigrant with the floor', () => {
        const scene = fresh();
        const world = makeWorld();
        const sources = [
            BIRTH_SOURCE.MATE_HUNTER,
            BIRTH_SOURCE.SPLIT_HUNTER,
            BIRTH_SOURCE.SPEC_FLIP,
            BIRTH_SOURCE.FLOOR,
            BIRTH_SOURCE.IMMIGRANT,
        ];
        sources.forEach((source, i) => {
            born(scene, world, { slot: i, genome: 10 + i, source });
            world.ageTicks[i] = 300;
        });
        expect(RECRUIT_SOURCES).toEqual(['mate-hunter-parent', 'split-hunter-parent', 'spec-flip', 'floor']);
        // Genome 13 (floor) and 14 (immigrant) share the floor row; every hunter is matured and none has bred.
        const m = recruitMetrics(scene, world);
        expect(m['eval.recruit_cohort']).toEqual({ value: 5 });
        expect(m['eval.recruit_matured_hunters']).toEqual({ value: 5 });
        expect(m['eval.recruit_replaced_share.floor']).toEqual({ value: 0 });
        expect(m['eval.recruit_replaced_share.spec-flip']).toEqual({ value: 0 });
    });

    it('reads each source on its own', () => {
        const scene = fresh();
        const world = makeWorld();
        born(scene, world, { slot: 0, genome: 15, source: BIRTH_SOURCE.SPEC_FLIP });
        born(scene, world, { slot: 1, genome: 16, source: BIRTH_SOURCE.FLOOR });
        born(scene, world, { slot: 2, genome: 17, spec: 0, cause: BORN_CAUSE.SPLIT, a: 15, b: 15 });
        world.ageTicks[0] = 300;
        world.ageTicks[1] = 300;
        const m = recruitMetrics(scene, world);
        expect(m['eval.recruit_replaced_share.spec-flip']).toEqual({ value: 1 });
        expect(m['eval.recruit_replaced_share.floor']).toEqual({ value: 0 });
        expect(m['eval.recruit_replaced_share.mate-hunter-parent']?.value).toBeNull();
    });
});

describe('slot reuse', () => {
    it('keeps a dead hunter and the newborn in its slot apart, by genome id', () => {
        const scene = fresh();
        const world = makeWorld();
        born(scene, world, { slot: 3, genome: 20 });
        killed(scene, 20, 1);
        died(scene, world, { genome: 20, age: 400, slot: 3, kills: 1 });
        born(scene, world, { slot: 3, genome: 21 });
        world.ageTicks[3] = 400;
        const m = recruitMetrics(scene, world);
        expect(m['eval.recruit_cohort']).toEqual({ value: 2 });
        // Genome 20 matured at 400 and killed; genome 21 is alive at 400 and has not.
        expect(m['eval.recruit_first_kill_share']).toEqual({ value: 0.5 });
    });
});

describe('censoring at the run boundary', () => {
    it('leaves living juveniles out of the survivors and the deaths', () => {
        const scene = fresh();
        const world = makeWorld();
        born(scene, world, { slot: 0, genome: 30 });
        born(scene, world, { slot: 1, genome: 31 });
        born(scene, world, { slot: 2, genome: 32 });
        died(scene, world, { genome: 30, age: 50, slot: 0 });
        world.ageTicks[1] = 30;
        world.ageTicks[2] = 200;
        const m = recruitMetrics(scene, world);
        expect(m['eval.recruit_cohort']).toEqual({ value: 3 });
        expect(m['eval.recruit_censored_share']?.value).toBeCloseTo(1 / 3, 12);
        // Resolved: the juvenile that died and the adult that lived; one of the two matured.
        expect(m['eval.recruit_matured_share']).toEqual({ value: 0.5 });
        expect(m['eval.recruit_matured_hunters']).toEqual({ value: 1 });
    });

    it('is null when every hunter is a living juvenile', () => {
        const scene = fresh();
        const world = makeWorld();
        born(scene, world, { slot: 0, genome: 33 });
        world.ageTicks[0] = 10;
        const m = recruitMetrics(scene, world);
        expect(m['eval.recruit_censored_share']).toEqual({ value: 1 });
        expect(m['eval.recruit_matured_share']?.value).toBeNull();
        expect(m['eval.recruit_first_kill_share']?.value).toBeNull();
    });
});

describe('the milestones of a matured hunter', () => {
    it('credits a first deliberate kill, a first birth by source, and a child that reproduces', () => {
        const scene = fresh();
        const world = makeWorld();
        const mate = { source: BIRTH_SOURCE.MATE_HUNTER };
        born(scene, world, { slot: 0, genome: 40, ...mate });
        born(scene, world, { slot: 1, genome: 41, ...mate });
        // 40 splits child 42 (a hunter), and 42 later splits 43; 41 never breeds.
        const split = { cause: BORN_CAUSE.SPLIT, source: BIRTH_SOURCE.SPLIT_HUNTER };
        born(scene, world, { slot: 2, genome: 42, ...split, a: 40, b: 40 });
        born(scene, world, { slot: 3, genome: 43, ...split, spec: 0, a: 42, b: 42 });
        killed(scene, 40, 1);
        killed(scene, 40, 2);
        died(scene, world, { genome: 40, age: 600, slot: 0, kills: 2 });
        world.ageTicks[1] = 500;
        world.ageTicks[2] = 150;
        const m = recruitMetrics(scene, world);
        expect(m['eval.recruit_cohort']).toEqual({ value: 3 });
        expect(m['eval.recruit_matured_hunters']).toEqual({ value: 3 });
        expect(m['eval.recruit_first_kill_share']?.value).toBeCloseTo(1 / 3, 12);
        expect(m['eval.recruit_replaced_share.mate-hunter-parent']).toEqual({ value: 0.5 });
        expect(m['eval.recruit_replaced_share.split-hunter-parent']).toEqual({ value: 1 });
        expect(m['eval.recruit_lineage_share']?.value).toBeCloseTo(1 / 3, 12);
    });

    it('counts a parent that dies the tick it gives birth, and a child that breeds after the parent is gone', () => {
        const scene = fresh();
        const world = makeWorld();
        born(scene, world, { slot: 0, genome: 50 });
        const mate = { cause: BORN_CAUSE.MATE, source: BIRTH_SOURCE.MATE_HUNTER };
        born(scene, world, { slot: 1, genome: 51, ...mate, a: 50 });
        died(scene, world, { genome: 50, age: 700, slot: 0 });
        const split = { cause: BORN_CAUSE.SPLIT, source: BIRTH_SOURCE.SPLIT, spec: 0 };
        born(scene, world, { slot: 2, genome: 52, ...split, a: 51, b: 51 });
        world.ageTicks[1] = 300;
        const m = recruitMetrics(scene, world);
        expect(m['eval.recruit_replaced_share.floor']).toEqual({ value: 1 });
        expect(m['eval.recruit_replaced_share.mate-hunter-parent']).toEqual({ value: 1 });
        expect(m['eval.recruit_lineage_share']).toEqual({ value: 0.5 });
    });
});

describe('time to starvation', () => {
    it('is the median age at a starved death of a cohort hunter, and ignores other deaths and founders', () => {
        const scene = fresh();
        const world = makeWorld();
        for (let i = 0; i < 4; i++) {
            born(scene, world, { slot: i, genome: 60 + i });
        }
        died(scene, world, { genome: 60, age: 200, slot: 0 });
        died(scene, world, { genome: 61, age: 600, slot: 1 });
        died(scene, world, { genome: 62, age: 50, cause: DEATH_CAUSE.EATEN, slot: 2 });
        died(scene, world, { genome: 999, age: 9999 });
        expect(recruitMetrics(scene, world)['eval.hunter_starve_age_median']).toEqual({ value: 400 });
    });
});

describe('local and global extinction', () => {
    /**
     * @param {Record<string, any>} scene the scene
     * @param {Record<string, any>} world the world
     * @param {{genome: number, slot: number, lineage: number, tick?: number}} h the hunter
     * @returns {void}
     */
    function hunter(scene, world, { genome, slot, lineage, tick = AFTER }) {
        born(scene, world, { slot, genome, lineage, tick });
    }

    /**
     * @param {Record<string, any>} scene the scene
     * @returns {void}
     */
    function lastHunter(scene) {
        const ring = createEventRing(1);
        const o = pushEvent(ring, EVENT_TYPE.LAST_HUNTER_DIED, AFTER + 900);
        noteRecruitRecord(scene, ring.data, o);
    }

    it('counts a lineage that loses its last hunter while another still hunts as local, not global', () => {
        const scene = fresh();
        const world = makeWorld();
        hunter(scene, world, { genome: 70, slot: 0, lineage: 7 });
        hunter(scene, world, { genome: 71, slot: 1, lineage: 7 });
        hunter(scene, world, { genome: 72, slot: 2, lineage: 9 });
        died(scene, world, { genome: 70, age: 300, slot: 0 });
        tickRecruit(scene);
        expect(recruitMetrics(scene, world)['eval.hunter_lineage_extinctions']).toEqual({ value: 0 });
        died(scene, world, { genome: 71, age: 300, slot: 1 });
        tickRecruit(scene);
        const m = recruitMetrics(scene, world);
        expect(m['eval.hunter_lineage_extinctions']).toEqual({ value: 1 });
        expect(m['eval.hunter_global_extinctions']).toEqual({ value: 0 });
    });

    it('counts the last hunters of the world as global only', () => {
        const scene = fresh();
        const world = makeWorld();
        hunter(scene, world, { genome: 80, slot: 0, lineage: 7 });
        hunter(scene, world, { genome: 81, slot: 1, lineage: 9 });
        died(scene, world, { genome: 80, age: 300, slot: 0 });
        died(scene, world, { genome: 81, age: 300, slot: 1 });
        lastHunter(scene);
        tickRecruit(scene);
        const m = recruitMetrics(scene, world);
        expect(m['eval.hunter_lineage_extinctions']).toEqual({ value: 0 });
        expect(m['eval.hunter_global_extinctions']).toEqual({ value: 1 });
    });

    it('counts two lineages ending on one tick as local when a hunter of a third lineage lives', () => {
        const scene = fresh();
        const world = makeWorld();
        hunter(scene, world, { genome: 90, slot: 0, lineage: 7 });
        hunter(scene, world, { genome: 91, slot: 1, lineage: 9 });
        hunter(scene, world, { genome: 92, slot: 2, lineage: 11 });
        died(scene, world, { genome: 90, age: 300, slot: 0 });
        died(scene, world, { genome: 91, age: 300, slot: 1 });
        tickRecruit(scene);
        expect(recruitMetrics(scene, world)['eval.hunter_lineage_extinctions']).toEqual({ value: 2 });
    });

    it('does not count an extinction before burn-in, but counts a founder lineage after it', () => {
        const scene = fresh();
        const world = makeWorld();
        hunter(scene, world, { genome: 95, slot: 0, lineage: 7, tick: 0 });
        hunter(scene, world, { genome: 96, slot: 1, lineage: 9, tick: 0 });
        died(scene, world, { genome: 95, age: 300, slot: 0, tick: BURN_IN_TICKS - 1 });
        tickRecruit(scene);
        expect(recruitMetrics(scene, world)['eval.hunter_lineage_extinctions']).toEqual({ value: 0 });
        hunter(scene, world, { genome: 97, slot: 2, lineage: 11 });
        died(scene, world, { genome: 96, age: 300, slot: 1 });
        tickRecruit(scene);
        expect(recruitMetrics(scene, world)['eval.hunter_lineage_extinctions']).toEqual({ value: 1 });
    });
});

describe('repeat births and lineage bookkeeping', () => {
    it('keeps the cohort whole when a parent breeds twice and a kill follows, crediting the one first kill', () => {
        const scene = fresh();
        const world = makeWorld();
        born(scene, world, { slot: 0, genome: 60 });
        const mate = { cause: BORN_CAUSE.MATE, source: BIRTH_SOURCE.MATE_HUNTER };
        born(scene, world, { slot: 1, genome: 61, ...mate, a: 60 });
        born(scene, world, { slot: 2, genome: 62, ...mate, a: 60 });
        killed(scene, 60, 1);
        world.ageTicks[0] = 300;
        world.ageTicks[1] = 300;
        world.ageTicks[2] = 300;
        const m = recruitMetrics(scene, world);
        expect(m['eval.recruit_cohort']).toEqual({ value: 3 });
        expect(m['eval.recruit_first_kill_share']?.value).toBeCloseTo(1 / 3, 12);
    });

    it('ends a lineage when its last hunter dies, even if the count of hunters in it was never started', () => {
        const scene = fresh();
        const world = makeWorld();
        born(scene, world, { slot: 0, genome: 70, lineage: 9 });
        scene.lineageHunters.delete(9);
        died(scene, world, { genome: 70, age: 50, slot: 0, tick: BURN_IN_TICKS + 100 });
        expect(scene.alive).toBe(0);
        expect(scene.pendingLineages).toBe(1);
    });
});
