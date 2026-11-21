// Gate 2 of fair-chase.md, "Before any training": the forager's metrics against planted scenes (docs/designs/metric-noise.md,
// Phase 6, T21). Foraging: one body steers to a line of food (every meal follows a closing approach), another holds `BITE` where
// food is dropped on it (no meal does), played under the eval observer (`playForaging`); the energy each ate is read from the
// world. Breeding: births counted from the sim's birth events (`playSplits`, `playMothers`). Escape: a hunter that bites its prey
// once and lets go (`playEscape`), against the chase of the predator test.

import { describe, expect, it } from 'vitest';
import { scaleTimeout } from '../../scripts/lib/test-timeout.mjs';
import { ROLE_METRICS } from '../../js/evo/metric-registry/roles.js';
import { playMothers, playSplits } from './helpers/role-scene-breed.js';
import { playEscape, playForaging } from './helpers/role-scene-forage.js';
import { playChase } from './helpers/role-scene.js';

const SHARE = 'eval.deliberate_food_share';
const FOOD = 'eval.food_energy_per_1k';
const BIRTHS = 'eval.births_per_1k';
const ESCAPE = 'eval.chase_escape_share';
const sum = (/** @type {number[]} */ xs) => xs.reduce((a, b) => a + b, 0);

describe('the forager metrics against planted scenes', { timeout: scaleTimeout(120_000) }, () => {
    const closes = playForaging({ line: 8, drops: 0, ticks: 600 });
    const dropped = playForaging({ line: 0, drops: 6, ticks: 600 });
    const both = playForaging({ line: 8, drops: 6, ticks: 600 });
    const fasting = playForaging({ line: 1, drops: 0, ticks: 3 });

    it('plants meals after a closing approach in one scene, and meals with none in another', () => {
        expect(closes.ate[0]).toBeGreaterThan(0);
        expect(dropped.ate[0]).toBeGreaterThan(0);
        expect(both.ate).toEqual([closes.ate[0], dropped.ate[0]]);
        expect(fasting.ate[0]).toBe(0);
    });

    it('deliberate_food_share reads 1 when every meal follows a closing approach, and 0 when none does', () => {
        expect(closes.metrics[SHARE].value).toBe(1);
        expect(dropped.metrics[SHARE].value).toBe(0);
    });

    it('deliberate_food_share is the deliberate eater share of the food eaten when two bodies eat each way', () => {
        expect(both.metrics[SHARE].value).toBeCloseTo(both.ate[0] / sum(both.ate), 9);
    });

    it('deliberate_food_share has no reading when nothing was eaten', () => {
        expect(fasting.metrics[SHARE].value).toBeNull();
    });

    it('food_energy_per_1k is the food energy the world says was eaten per 1000 agent-ticks, and 0 for none', () => {
        for (const run of [closes, dropped, both]) {
            expect(run.metrics[FOOD].value).toBeCloseTo((1000 * sum(run.ate)) / run.agentTicks, 9);
        }
        expect(fasting.metrics[FOOD].value).toBe(0);
    });

    it('births_per_1k is the births the sim made per 1000 agent-ticks: a split, a mating colony, and none', () => {
        const splits = playSplits({ parents: [{ energy: 1500 }, { energy: 800 }], ticks: 600 });
        const none = playSplits({ parents: [{ energy: 800 }], ticks: 600 });
        const mated = playMothers({ mothers: [{ energy: 1000, share: 0.4 }], ticks: 1500 });
        expect(splits.births).toHaveLength(1);
        expect(splits.metrics[BIRTHS].value).toBeCloseTo((1000 * splits.births.length) / splits.agentTicks, 9);
        expect(none.births).toHaveLength(0);
        expect(none.metrics[BIRTHS].value).toBe(0);
        expect(mated.births.length).toBeGreaterThan(0);
        expect(mated.metrics[BIRTHS].value).toBeCloseTo((1000 * mated.births.length) / mated.agentTicks, 9);
    });

    it('chase_escape_share reads 1 for the prey bitten once that lives, 0 for the one caught, and no reading for no chase', () => {
        const escapes = playEscape({ gap: 300, ticks: 250 });
        const caught = playChase({ gap: 300, ticks: 300 });
        const none = playChase({ gap: 9000, ticks: 300 });
        expect(escapes.bitten).toBe(true);
        expect(escapes.preyAlive).toBe(true);
        expect(escapes.metrics[ESCAPE].value).toBe(1);
        expect(escapes.metrics['eval.chase_catch_share'].value).toBe(0);
        expect(caught.killTick).toBeGreaterThan(0);
        expect(caught.metrics[ESCAPE].value).toBe(0);
        expect(none.metrics[ESCAPE].value).toBeNull();
    });

    it('reads every forager metric of the role table', () => {
        for (const name of ROLE_METRICS.forager) {
            expect(Object.hasOwn(both.metrics, name)).toBe(true);
        }
    });
});
