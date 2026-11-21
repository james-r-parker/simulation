// Gate 2 of fair-chase.md, "Before any training": the reproducer's metrics against planted breeding scenes (docs/designs/
// metric-noise.md, Phase 6, T21). Parents split in the real sim and the scene kills the children it names (`playSplits`), so the
// children each parent bore and the children that reached maturity are fixed; mothers of one lineage mate and give a share of
// their energy that is tied to how rich they are, or not (`playMothers`). Played under the eval observer.

import { describe, expect, it } from 'vitest';
import { scaleTimeout } from '../../scripts/lib/test-timeout.mjs';
import { ROLE_METRICS } from '../../js/evo/metric-registry/roles.js';
import { playMothers, playSplits } from './helpers/role-scene-breed.js';

const SURVIVAL = 'eval.child_survival';
const OFFSPRING = 'eval.offspring_per_life';
const SLOPE = 'eval.childshare_by_condition';
/** A parent rich enough to split once (it gives half away and stays under the gate), and one that is not. */
const RICH = 1500;
const POOR = 800;
/** Longer than `maturityTicks` (600), so a child born at the start has its fate decided by the end. */
const TICKS = 1200;
/** The energy at which `playMothers` holds each mother, and the store a share is read against. */
const ENERGIES = [800, 1000, 1200, 1400, 1600, 1800];
const STORE = 2000;
/** The slope of the share on condition the scene plants. */
const PLANTED = 0.4;

describe('the reproducer metrics against planted breeding', { timeout: scaleTimeout(120_000) }, () => {
    describe('child_survival', () => {
        const run = (/** @type {(ordinal: number) => number | null} */ childLife) =>
            playSplits({ parents: [{ energy: RICH }, { energy: RICH }], ticks: TICKS, childLife });
        const half = run((n) => (n === 0 ? 100 : null));
        const all = run(() => null);
        const none = run(() => 100);

        it('plants two children, and kills none, one or both before they mature', () => {
            for (const r of [half, all, none]) {
                expect(r.births).toHaveLength(2);
            }
            const alive = (/** @type {typeof half} */ r) => r.births.filter((b) => r.world.alive[b.child] === 1).length;
            expect([alive(all), alive(half), alive(none)]).toEqual([2, 1, 0]);
        });

        it('reads the share of children that lived to maturity: 1, 0.5 and 0', () => {
            expect(all.metrics[SURVIVAL].value).toBe(1);
            expect(half.metrics[SURVIVAL].value).toBe(0.5);
            expect(none.metrics[SURVIVAL].value).toBe(0);
        });

        it('has no reading when no child was born', () => {
            const childless = playSplits({ parents: [{ energy: POOR }], ticks: TICKS });
            expect(childless.births).toHaveLength(0);
            expect(childless.metrics[SURVIVAL].value).toBeNull();
        });
    });

    describe('offspring_per_life', () => {
        const die = (/** @type {number | null} */ childLife) =>
            playSplits({
                parents: [
                    { energy: RICH, diesAt: 900 },
                    { energy: POOR, diesAt: 900 },
                ],
                ticks: TICKS,
                childLife: () => childLife,
            });
        const orphaned = die(100);
        const surviving = die(null);

        it('is the children per completed life: the parent that split bore 1, the one that did not bore 0', () => {
            expect(orphaned.births).toHaveLength(1);
            expect(surviving.births).toHaveLength(1);
            expect(surviving.metrics[OFFSPRING].value).toBeCloseTo(1 / 2, 9);
        });

        it('counts a child that died among the completed lives, bearing none', () => {
            expect(orphaned.metrics[OFFSPRING].value).toBeCloseTo(1 / 3, 9);
        });

        it('reads 0 when no parent bore, and has no reading with no completed life', () => {
            const childless = playSplits({ parents: [{ energy: POOR, diesAt: 900 }], ticks: TICKS });
            const alive = playSplits({ parents: [{ energy: POOR }], ticks: TICKS });
            expect(childless.metrics[OFFSPRING].value).toBe(0);
            expect(alive.metrics[OFFSPRING].value).toBeNull();
        });
    });

    describe('childshare_by_condition', () => {
        const tied = playMothers({
            mothers: ENERGIES.map((energy) => ({ energy, share: 0.2 + PLANTED * (energy / STORE) })),
            ticks: 3000,
        });
        const flat = playMothers({ mothers: ENERGIES.map((energy) => ({ energy, share: 0.5 })), ticks: 3000 });

        it('plants enough matings in one lineage for the slope: 20 or more births from mothers that differ in energy', () => {
            expect(tied.births.length).toBeGreaterThanOrEqual(20);
            expect(flat.births.length).toBeGreaterThanOrEqual(20);
            expect(new Set(tied.births.map((b) => b.mother)).size).toBe(ENERGIES.length);
        });

        it('reads the slope of the share on condition the scene plants, and 0 when the share is the same for every mother', () => {
            expect(tied.metrics[SLOPE].value).toBeCloseTo(PLANTED, 3);
            expect(flat.metrics[SLOPE].value).toBeCloseTo(0, 6);
        });

        it('has no reading when no lineage has 20 matings', () => {
            const few = playMothers({ mothers: [{ energy: 1000, share: 0.4 }], ticks: 1500 });
            expect(few.births.length).toBeGreaterThan(0);
            expect(few.births.length).toBeLessThan(20);
            expect(few.metrics[SLOPE].value).toBeNull();
        });
    });

    it('reads every reproducer metric of the role table', () => {
        const run = playSplits({ parents: [{ energy: RICH }], ticks: TICKS });
        for (const name of ROLE_METRICS.reproducer) {
            expect(Object.hasOwn(run.metrics, name)).toBe(true);
        }
    });
});
