import { describe, expect, it } from 'vitest';
import { BURN_IN_TICKS } from '../../js/evo/observer-events.js';
import { computeMetrics } from '../../js/evo/metrics.js';
import { metricDirection } from '../../js/evo/compare.js';
import { MIN_CORRELATION_DEATHS, selectionMetrics } from '../../js/evo/metrics-selection.js';
import { addCheckpoint, addDeath, bareObserver } from './helpers/metrics-observer.js';

const NAMES = [
    'eval.offspring_per_life',
    'eval.generation_depth_p90',
    'eval.opportunity_for_selection',
    'eval.fitness_lrs_corr',
    'eval.archive_lineage_share',
    'eval.kin_within_call_radius',
];

/** A death that ends after burn-in, mature (maturityTicks is 20). */
const LATE = { birthTick: BURN_IN_TICKS, ageTicks: 100 };

describe('selectionMetrics', () => {
    it('is null with a reason for every metric on an empty observer', () => {
        const m = selectionMetrics(bareObserver());
        expect(Object.keys(m)).toEqual(NAMES);
        expect(m['eval.offspring_per_life']).toEqual({ value: null, reason: 'no completed life after burn-in' });
        expect(m['eval.archive_lineage_share']).toEqual({ value: null, reason: 'no archive' });
        expect(m['eval.kin_within_call_radius']).toEqual({ value: null, reason: 'no alarm call' });
        expect(m['eval.fitness_lrs_corr'].value).toBeNull();
    });

    it('uses only lives that end at or after burn-in', () => {
        const o = bareObserver();
        addDeath(o, { birthTick: 0, ageTicks: BURN_IN_TICKS - 1, children: 9, generation: 9 });
        addDeath(o, { ...LATE, children: 1, generation: 2 });
        addDeath(o, { ...LATE, children: 3, generation: 4 });
        const m = selectionMetrics(o);
        expect(m['eval.offspring_per_life']).toEqual({ value: 2 });
        expect(m['eval.generation_depth_p90']).toEqual({ value: expect.closeTo(3.8, 10) });
        expect(m['eval.opportunity_for_selection']).toEqual({ value: 0.25 });
    });

    it('has no opportunity for selection when nobody had children', () => {
        const o = bareObserver();
        addDeath(o, { ...LATE, children: 0 });
        expect(selectionMetrics(o)['eval.opportunity_for_selection']).toEqual({ value: null, reason: 'no children' });
    });

    it('correlates fitness at death with children from MIN_CORRELATION_DEATHS mature deaths', () => {
        const o = bareObserver();
        for (let i = 0; i < MIN_CORRELATION_DEATHS - 1; i++) {
            addDeath(o, { ...LATE, children: i, fitness: i });
        }
        expect(selectionMetrics(o)['eval.fitness_lrs_corr'].value).toBeNull();
        addDeath(o, { ...LATE, children: 40, fitness: 40 });
        expect(selectionMetrics(o)['eval.fitness_lrs_corr'].value).toBeCloseTo(1, 12);
    });

    it('skips immature deaths and deaths with no fitness, and is null when children are constant', () => {
        const o = bareObserver();
        for (let i = 0; i < MIN_CORRELATION_DEATHS; i++) {
            addDeath(o, { ...LATE, children: 2, fitness: i });
        }
        addDeath(o, { ...LATE, ageTicks: 5, children: 9, fitness: 100 });
        addDeath(o, { ...LATE, children: 9 });
        expect(selectionMetrics(o)['eval.fitness_lrs_corr']).toEqual({
            value: null,
            reason: 'fitness or children is constant',
        });
    });

    it('takes the archive-lineage share of agent-ticks at checkpoints after burn-in, null without an archive', () => {
        const o = bareObserver();
        addCheckpoint(o, { tick: 100, population: 10, archiveAgents: 10 });
        addCheckpoint(o, { tick: BURN_IN_TICKS, population: 10, archiveAgents: 2 });
        addCheckpoint(o, { tick: BURN_IN_TICKS + 100, population: 30, archiveAgents: 12 });
        expect(selectionMetrics(o)['eval.archive_lineage_share'].value).toBeNull();
        o.archiveDraw = () => false;
        expect(selectionMetrics(o)['eval.archive_lineage_share']).toEqual({ value: 0.35 });
        const none = bareObserver();
        none.archiveDraw = () => false;
        expect(selectionMetrics(none)['eval.archive_lineage_share'].reason).toBe('no checkpoint after burn-in');
    });

    it('averages the kin around each alarm caller', () => {
        const o = bareObserver();
        Object.assign(o.intent.run, { alarms: 4, kinNearSum: 10 });
        expect(selectionMetrics(o)['eval.kin_within_call_radius']).toEqual({ value: 2.5 });
    });

    it('is merged into computeMetrics and is watch-only', () => {
        const m = computeMetrics(bareObserver(), {});
        for (const name of NAMES) {
            expect(m[name], name).toBeDefined();
            expect(metricDirection(name)).toBe('watch');
        }
    });
});
