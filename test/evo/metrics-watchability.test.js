// The watchability metrics (fitness-and-selection.md T48h): hand-built agents with chosen paths, outputs and energy,
// fed through the real `trackCircling`, `checkpoint` and `observe`, read with `computeMetrics`.

import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT } from '../../js/sim/brain-layout.js';
import { metricDirection } from '../../js/evo/compare.js';
import { computeMetrics } from '../../js/evo/metrics.js';
import {
    CIRCLE_PERIOD,
    CIRCLE_WINDOW,
    WATCHABILITY_DIRECTIONS,
    trackCircling,
} from '../../js/evo/metrics-watchability.js';
import { checkpoint, observe } from '../../js/evo/observer.js';
import { EVENT_TYPE } from '../../js/sim/events.js';
import { addBlob } from '../sim/helpers/life-world.js';
import { nextTick, observed, pushCall } from './helpers/observer-world.js';

const NAMES = ['circling_share', 'output_saturation', 'alarm_rate', 'mean_energy_share', 'energy_over_split'];
const BURN_IN = 10000;
const START = CIRCLE_PERIOD - CIRCLE_WINDOW + 1;

const read = (/** @type {any} */ r, /** @type {string} */ name) => computeMetrics(r.observer, r.world)[`eval.${name}`];

/**
 * Plays one circling window ending at `end` (a multiple of the period): `place(slot, i)` sets the agent's pose at
 * sample `i`, 0 to `CIRCLE_WINDOW - 1`.
 * @param {{world: any, observer: any}} r the run
 * @param {(slot: number, i: number) => void} place sets positions and headings for every slot
 * @param {{end?: number, burnIn?: number}} [options] the window's last tick and the burn-in
 * @returns {void}
 */
function play(r, place, { end = CIRCLE_PERIOD, burnIn = BURN_IN } = {}) {
    for (let i = 0; i < CIRCLE_WINDOW; i++) {
        r.world.tick = end - CIRCLE_WINDOW + 1 + i;
        for (let slot = 0; slot < r.world.alive.length; slot++) {
            place(slot, i);
        }
        trackCircling(r.observer.watchability, r.world, burnIn);
    }
}

/** A circle of radius 10 px at 0.1 rad per sample: 3.2 turns, 199 px of path, 10 px of net displacement. */
function circle(/** @type {any} */ world, /** @type {number} */ slot, /** @type {number} */ i) {
    const a = 0.1 * i;
    world.x[slot] = 500 + 10 * Math.cos(a);
    world.y[slot] = 500 + 10 * Math.sin(a);
    world.angle[slot] = Math.atan2(Math.sin(a + Math.PI / 2), Math.cos(a + Math.PI / 2));
}

describe('the watchability metrics', () => {
    it('have the directions of the compare table', () => {
        expect(Object.keys(WATCHABILITY_DIRECTIONS).sort()).toEqual(NAMES.map((n) => `eval.${n}`).sort());
        for (const name of NAMES.slice(0, 3)) {
            expect(metricDirection(`eval.${name}`), name).toBe('lower');
        }
        expect(metricDirection('eval.mean_energy_share')).toBe('watch');
        expect(metricDirection('eval.energy_over_split')).toBe('watch');
    });

    it('are null with a reason on a fresh observer', () => {
        const r = observed();
        for (const name of NAMES) {
            expect(read(r, name).value, name).toBeNull();
        }
        expect(read(r, 'circling_share').reason).toContain('no circling span');
        expect(read(r, 'output_saturation').reason).toContain('no checkpoint');
    });
});

describe('eval.circling_share', () => {
    it('counts the circler, not the straight mover, the spinner in place or the agent that died', () => {
        const r = observed();
        const [circler, mover, spinner, dying] = [0, 1, 2, 3].map(() => addBlob(r.world));
        play(r, (slot, i) => {
            if (slot === circler) {
                circle(r.world, slot, i);
            } else if (slot === mover) {
                r.world.x[slot] = 100 + 5 * i;
                r.world.angle[slot] = 0;
            } else if (slot === spinner) {
                r.world.angle[slot] = ((0.5 * i + Math.PI) % (2 * Math.PI)) - Math.PI;
            } else if (slot === dying && i === 100) {
                r.world.alive[slot] = 0;
            }
        });
        expect(read(r, 'circling_share').value).toBeCloseTo(1 / 3, 10);
    });

    it('counts the circler whichever way it turns', () => {
        const r = observed();
        const slot = addBlob(r.world);
        play(r, (s, i) => {
            const a = -0.1 * i;
            r.world.x[s] = 500 + 10 * Math.cos(a);
            r.world.y[s] = 500 + 10 * Math.sin(a);
            r.world.angle[s] = Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2));
        });
        expect(slot).toBe(0);
        expect(read(r, 'circling_share').value).toBe(1);
    });

    it('ignores a window that ends before the burn-in, and an agent replaced by another genome', () => {
        const early = observed();
        circle(early.world, addBlob(early.world), 0);
        play(early, (slot, i) => circle(early.world, slot, i), { burnIn: 20000 });
        expect(read(early, 'circling_share').value).toBeNull();

        const swapped = observed();
        const slot = addBlob(swapped.world);
        play(swapped, (s, i) => {
            circle(swapped.world, s, i);
            swapped.world.genomeId[s] = i < 50 ? swapped.world.genomeId[s] : 999;
        });
        expect(slot).toBe(0);
        expect(read(swapped, 'circling_share').value).toBeNull();
    });

    it('is fed by observe once the tick reaches the end of a window', () => {
        const r = observed();
        const slot = addBlob(r.world);
        for (let i = 0; i < CIRCLE_WINDOW; i++) {
            nextTick(r.world, START + i);
            circle(r.world, slot, i);
            observe(r.observer, r.world);
        }
        expect(read(r, 'circling_share').value).toBe(1);
    });
});

describe('eval.output_saturation', () => {
    it('is the mean over alive agents of the share of outputs above 0.95 in magnitude', () => {
        const r = observed();
        const a = addBlob(r.world);
        const b = addBlob(r.world);
        r.world.outputs.set([1, -0.96, 0.95, 0.5], a * OUTPUT_COUNT); // 0.95 is not above 0.95
        r.world.outputs.set([0, 0.2], b * OUTPUT_COUNT);
        r.world.tick = BURN_IN;
        checkpoint(r.observer, r.world);
        expect(read(r, 'output_saturation').value).toBeCloseTo(2 / OUTPUT_COUNT / 2, 10);
    });

    it('does not count a checkpoint before the burn-in', () => {
        const r = observed();
        addBlob(r.world);
        r.world.tick = BURN_IN - 1;
        checkpoint(r.observer, r.world);
        expect(read(r, 'output_saturation').value).toBeNull();
    });
});

describe('eval.mean_energy_share and eval.energy_over_split', () => {
    it('average energy over maxEnergy and over the specialisation split threshold', () => {
        const r = observed({ maxEnergy: 4000 });
        const forager = addBlob(r.world, { energy: 2000 });
        const predator = addBlob(r.world, { energy: 1000, spec: r.world.config.specialisations.predator.index });
        r.world.tick = BURN_IN;
        checkpoint(r.observer, r.world);
        const { splitMinBySpec, spec } = r.world;
        expect(read(r, 'mean_energy_share').value).toBeCloseTo((2000 / 4000 + 1000 / 4000) / 2, 10);
        expect(read(r, 'energy_over_split').value).toBeCloseTo(
            (2000 / splitMinBySpec[spec[forager]] + 1000 / splitMinBySpec[spec[predator]]) / 2,
            10,
        );
    });
});

describe('eval.alarm_rate', () => {
    it('is alarms per alive agent per 1000 ticks', () => {
        const r = observed();
        const slot = addBlob(r.world);
        addBlob(r.world);
        for (let tick = 1; tick <= 5; tick++) {
            nextTick(r.world, tick);
            if (tick <= 2) {
                pushCall(r.world, EVENT_TYPE.ALARM_CALLED, slot);
            }
            observe(r.observer, r.world);
        }
        expect(read(r, 'alarm_rate').value).toBeCloseTo((2 / 10) * 1000, 10);
    });
});
