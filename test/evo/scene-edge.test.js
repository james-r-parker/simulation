// The low-density edge detectors (low-density-edge.md, T5): the span tallies and the seven rate and ratio detectors, and
// the reference rates the diagnosis swaps in, against hand-built checkpoint series.

import { describe, expect, it } from 'vitest';
import { BORN_CAUSE, DEATH_CAUSE } from '../../js/sim/events.js';
import { BURN_IN_TICKS } from '../../js/evo/burn-in.js';
import {
    EDGE_PREY,
    createEdgeScene,
    edgeMetrics,
    noteEdgeBirth,
    noteEdgeDeath,
    sampleEdge,
} from '../../js/evo/scene-edge.js';
import { directionOf, intendedOf, namesOf } from './helpers/metric-registry.js';

const T = Math.ceil(BURN_IN_TICKS / 1000) * 1000;
const FORAGER = 0;
const PREDATOR = 1;
const SLOTS = 600;

/**
 * @param {{tick: number, prey: number, hunters: number, intake?: number}} spec the tick, the alive prey and hunters, and
 *   the `foodEnergy` the first prey holds
 * @returns {Record<string, any>} a hand-built world
 */
function world({ tick, prey, hunters, intake = 0 }) {
    const w = {
        tick,
        huntBySpec: Uint8Array.from([0, 1]),
        alive: new Uint8Array(SLOTS),
        spec: new Uint8Array(SLOTS),
        foodEnergy: new Float64Array(SLOTS),
        // Every agent is a newborn, so the share detectors at an edge checkpoint find no ready or eligible prey.
        config: { maturityTicks: 20 },
        sex: new Uint8Array(SLOTS),
        ageTicks: new Uint32Array(SLOTS),
        cooldown: new Uint32Array(SLOTS),
        pregnancy: new Uint32Array(SLOTS),
    };
    for (let slot = 0; slot < prey + hunters; slot++) {
        w.alive[slot] = 1;
        w.spec[slot] = slot < prey ? FORAGER : PREDATOR;
    }
    w.foodEnergy[0] = intake;
    return w;
}

/**
 * @typedef {object} Row what happened before the checkpoint, and what stands at it
 * @property {number} prey alive prey at the checkpoint
 * @property {number} [hunters] alive hunters at the checkpoint
 * @property {number} [mate] prey mating births since the last checkpoint
 * @property {number} [split] prey split births
 * @property {number} [floor] prey floor births
 * @property {number} [immigrant] prey immigrant births
 * @property {number} [hunterMate] hunter mating births
 * @property {number} [starved] prey starvation deaths
 * @property {number} [eaten] prey deaths by a hunter
 * @property {number} [old] prey deaths of old age, each taking `meal` energy over its life
 * @property {number} [hunterDied] hunter deaths
 * @property {number} [meal] lifetime food energy of an old-age death
 * @property {number} [aliveIntake] food energy the alive prey hold at the checkpoint
 */

/**
 * Feeds one checkpoint per row, at tick `T + 1000 * row`.
 * @param {Row[]} rows the checkpoints
 * @returns {Record<string, any>} the scene
 */
function run(rows) {
    const scene = createEdgeScene();
    rows.forEach((r, i) => {
        const w = world({ tick: T + 1000 * i, prey: r.prey, hunters: r.hunters ?? 0, intake: r.aliveIntake ?? 0 });
        const born = [
            [BORN_CAUSE.MATE, r.mate ?? 0, FORAGER],
            [BORN_CAUSE.SPLIT, r.split ?? 0, FORAGER],
            [BORN_CAUSE.FLOOR, r.floor ?? 0, FORAGER],
            [BORN_CAUSE.IMMIGRANT, r.immigrant ?? 0, FORAGER],
            [BORN_CAUSE.MATE, r.hunterMate ?? 0, PREDATOR],
        ];
        for (const [cause, count, spec] of born) {
            for (let k = 0; k < count; k++) {
                noteEdgeBirth(scene, w, { cause, spec });
            }
        }
        const died = [
            [DEATH_CAUSE.STARVED, r.starved ?? 0, 0, FORAGER],
            [DEATH_CAUSE.EATEN, r.eaten ?? 0, 0, FORAGER],
            [DEATH_CAUSE.OLD_AGE, r.old ?? 0, r.meal ?? 0, FORAGER],
            [DEATH_CAUSE.STARVED, r.hunterDied ?? 0, 999, PREDATOR],
        ];
        for (const [cause, count, foodEnergy, spec] of died) {
            for (let k = 0; k < count; k++) {
                noteEdgeDeath(scene, w, { cause, spec, foodEnergy });
            }
        }
        sampleEdge(scene, w);
    });
    return scene;
}

/** @param {string} name a metric @param {Row[]} rows the checkpoints @returns {number | null} its value */
const value = (name, rows) => /** @type {any} */ (edgeMetrics(run(rows)))[name].value;

/** Two edge spans (10 to 13 prey, 13 to 14) and a reference span (150 to 160). */
const SERIES = [
    { prey: 10, hunters: 2 },
    {
        prey: 13,
        hunters: 3,
        mate: 3,
        split: 1,
        floor: 1,
        immigrant: 1,
        hunterMate: 1,
        starved: 2,
        eaten: 1,
        aliveIntake: 30,
    },
    { prey: 150, hunters: 3, mate: 0, floor: 2, starved: 1, hunterDied: 1, old: 1, meal: 5, aliveIntake: 30 },
    { prey: 160, hunters: 20, mate: 4, split: 2, starved: 1, eaten: 2, aliveIntake: 80 },
];

describe('the edge detectors', () => {
    it('count prey mating and split births only: floor, immigrant and hunter births are left out', () => {
        const m = edgeMetrics(run(SERIES.slice(0, 2)));
        // One edge span: 10 to 13 prey, mean 11.5, with 3 mating births, 1 split birth and 3 deaths.
        expect(m['eval.edge_mate_births_per_prey']).toEqual({ value: 3 / 11.5 });
        expect(m['eval.edge_split_births_per_prey']).toEqual({ value: 1 / 11.5 });
        expect(m['eval.edge_birth_death_ratio']).toEqual({ value: 4 / 3 });
    });

    it('take the prey count of a span as the mean of its start and end counts', () => {
        expect(value('eval.edge_starve_per_prey', SERIES.slice(0, 2))).toBe(2 / 11.5);
        expect(value('eval.edge_eaten_per_prey', SERIES.slice(0, 2))).toBe(1 / 11.5);
        expect(value('eval.edge_deaths_per_prey', SERIES.slice(0, 2))).toBe(3 / 11.5);
    });

    it('sum the counts and the prey over the edge spans, and leave the reference spans out', () => {
        // Edge spans 10 to 13 (mean 11.5) and 13 to 150 (mean 81.5): a span's kind is its start count.
        const m = edgeMetrics(run(SERIES.slice(0, 3)));
        expect(m['eval.edge_starve_per_prey']).toEqual({ value: 3 / 93 });
        expect(m['eval.edge_birth_death_ratio']).toEqual({ value: 4 / 5 });
        expect(m['eval.edge_hunters_per_prey']).toEqual({ value: (2.5 + 3) / 93 });
    });

    it('read the reference rates over the spans that start with 100 to 400 prey', () => {
        const m = edgeMetrics(run(SERIES));
        // The reference span: 150 to 160 prey, mean 155, with 4 mating births, 2 split births, 1 starved and 2 eaten.
        expect(m['eval.edge_ref_mate_births_per_prey']).toEqual({ value: 4 / 155 });
        expect(m['eval.edge_ref_split_births_per_prey']).toEqual({ value: 2 / 155 });
        expect(m['eval.edge_ref_starve_per_prey']).toEqual({ value: 1 / 155 });
        expect(m['eval.edge_ref_eaten_per_prey']).toEqual({ value: 2 / 155 });
    });

    it('count the boundaries as the doc sets them: 99 prey is an edge span, 100 and 400 reference, 401 neither', () => {
        for (const { prey, edge, ref } of [
            { prey: 99, edge: true, ref: false },
            { prey: 100, edge: false, ref: true },
            { prey: 400, edge: false, ref: true },
            { prey: 401, edge: false, ref: false },
        ]) {
            const m = edgeMetrics(run([{ prey }, { prey, starved: 1 }]));
            expect(m['eval.edge_starve_per_prey']?.value !== null, `edge at ${prey}`).toBe(edge);
            expect(m['eval.edge_ref_starve_per_prey']?.value !== null, `reference at ${prey}`).toBe(ref);
        }
        expect(EDGE_PREY).toBe(100);
    });

    it('read the intake ratio as food energy per prey per tick, edge over reference', () => {
        const rows = [
            { prey: 10 },
            { prey: 100, aliveIntake: 20, old: 1, meal: 10 },
            { prey: 100, aliveIntake: 20 },
            { prey: 100, aliveIntake: 170 },
        ];
        // Edge span 10 to 100 (mean 55 prey): 20 held by the living and 10 by the dead, 30. Reference spans 100 to 100
        // twice (200 prey in all): 0 and 150.
        expect(value('eval.edge_intake_ratio', rows)).toBeCloseTo(30 / 55 / (150 / 200), 12);
    });

    it('read the hunters over the prey in edge spans', () => {
        expect(
            value('eval.edge_hunters_per_prey', [
                { prey: 10, hunters: 4 },
                { prey: 30, hunters: 6 },
            ]),
        ).toBe(5 / 20);
    });

    it('count a prey death by every cause in the ratio and the death rate', () => {
        const rows = [{ prey: 10 }, { prey: 10, mate: 1, starved: 1, eaten: 1, old: 2 }];
        expect(value('eval.edge_birth_death_ratio', rows)).toBe(1 / 4);
        expect(value('eval.edge_deaths_per_prey', rows)).toBe(4 / 10);
    });

    it('do not count the spans before the first checkpoint or checkpoints before burn-in', () => {
        const scene = createEdgeScene();
        sampleEdge(scene, world({ tick: BURN_IN_TICKS - 1, prey: 5, hunters: 0 }));
        sampleEdge(scene, world({ tick: T + 500, prey: 5, hunters: 0 }));
        expect(scene.rows).toBe(0);
        expect(value('eval.edge_mate_births_per_prey', [{ prey: 5 }])).toBeNull();
    });
});

describe('the edge detectors with no span of a kind', () => {
    const NO_EDGE = 'no edge span (a span after burn-in that starts with 1 to 99 prey)';
    const NO_REFERENCE = 'no reference span (a span after burn-in that starts with 100 to 400 prey)';

    it('read null with a reason when a seed has no edge span', () => {
        const m = edgeMetrics(run([{ prey: 200 }, { prey: 220 }, { prey: 250 }]));
        for (const name of [
            'eval.edge_birth_death_ratio',
            'eval.edge_mate_births_per_prey',
            'eval.edge_split_births_per_prey',
            'eval.edge_starve_per_prey',
            'eval.edge_eaten_per_prey',
            'eval.edge_hunters_per_prey',
            'eval.edge_intake_ratio',
            'eval.edge_deaths_per_prey',
        ]) {
            expect(/** @type {any} */ (m)[name], name).toEqual({ value: null, reason: NO_EDGE });
        }
        expect(m['eval.edge_ref_starve_per_prey']?.value).toBe(0);
    });

    it('read null with a reason before any span, and for a lone checkpoint', () => {
        expect(edgeMetrics(run([]))['eval.edge_mate_births_per_prey']).toEqual({ value: null, reason: NO_EDGE });
        expect(edgeMetrics(run([{ prey: 5 }]))['eval.edge_mate_births_per_prey']).toEqual({
            value: null,
            reason: NO_EDGE,
        });
    });

    it('do not take a span that starts with no prey as an edge span', () => {
        expect(edgeMetrics(run([{ prey: 0 }, { prey: 5, floor: 5 }]))['eval.edge_deaths_per_prey']).toEqual({
            value: null,
            reason: NO_EDGE,
        });
    });

    it('read the ratio null when no prey died in the edge spans', () => {
        expect(edgeMetrics(run([{ prey: 10 }, { prey: 12, mate: 2 }]))['eval.edge_birth_death_ratio']).toEqual({
            value: null,
            reason: 'no prey death in an edge span',
        });
    });

    it('read the reference rates and the intake ratio null when no span starts with 100 to 400 prey', () => {
        const m = edgeMetrics(run([{ prey: 10 }, { prey: 20, starved: 1 }]));
        expect(m['eval.edge_ref_mate_births_per_prey']).toEqual({ value: null, reason: NO_REFERENCE });
        expect(m['eval.edge_intake_ratio']).toEqual({ value: null, reason: NO_REFERENCE });
        expect(m['eval.edge_starve_per_prey']?.value).toBe(1 / 15);
    });

    it('read the intake ratio null when the reference spans took no food', () => {
        const m = edgeMetrics(run([{ prey: 10 }, { prey: 10, aliveIntake: 5 }, { prey: 120 }, { prey: 120 }]));
        expect(m['eval.edge_intake_ratio']).toEqual({ value: null, reason: 'no food energy taken in reference spans' });
    });
});

describe('the registry entries of the edge detectors', () => {
    it('are the names the module produces, each with the direction the doc gives', () => {
        const names = [...namesOf('js/evo/scene-edge.js'), ...namesOf('js/evo/scene-edge-gates.js')].sort();
        expect(names).toEqual(Object.keys(edgeMetrics(createEdgeScene())).sort());
        expect(directionOf('eval.edge_birth_death_ratio')).toBe('higher');
        expect(directionOf('eval.edge_mate_births_per_prey')).toBe('higher');
        expect(directionOf('eval.edge_split_births_per_prey')).toBe('higher');
        expect(directionOf('eval.edge_starve_per_prey')).toBe('lower');
        expect(directionOf('eval.edge_eaten_per_prey')).toBe('lower');
        expect(directionOf('eval.edge_hunters_per_prey')).toBe('lower');
        expect(directionOf('eval.edge_intake_ratio')).toBe('higher');
    });

    it('give each watch metric the direction a better world moves it', () => {
        expect(directionOf('eval.edge_deaths_per_prey')).toBe('watch');
        expect(intendedOf('eval.edge_deaths_per_prey')).toBe('lower');
        expect(intendedOf('eval.edge_ref_mate_births_per_prey')).toBe('higher');
        expect(intendedOf('eval.edge_ref_split_births_per_prey')).toBe('higher');
        expect(intendedOf('eval.edge_ref_starve_per_prey')).toBe('lower');
        expect(intendedOf('eval.edge_ref_eaten_per_prey')).toBe('lower');
    });
});
