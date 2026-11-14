import { describe, expect, it } from 'vitest';
import { createInterpolated, interpolateInto } from '../../../js/app/interpolate.js';
import { createAgentRig, JUVENILE_EYE, rigBucket } from '../../../js/app/renderer/agent-rig.js';
import { createAgentStore, ITEM, packAgents } from '../../../js/app/renderer/agents-pack.js';
import { startTween, TWEEN } from '../../../js/app/renderer/body-tweens.js';
import { bakeClips } from '../../../js/app/renderer/clip-sampler.js';
import { CH, CLIPS } from '../../../js/app/renderer/clips.js';
import { FILL_FLOOR, FILL_SHARE, NEON, NEON_LIGHTNESS } from '../../../js/app/renderer/palette.js';
import { createFamilySlots } from '../../../js/app/family-slots.js';
import { makeSnapshot } from '../helpers/snapshots.js';

const FLAGS = {
    ATE_SHIFT: 0,
    BITTEN_SHIFT: 5,
    TIMER_MASK: 31,
    JAW_OPEN: 1 << 10,
    ALARMING: 1 << 11,
    HUNT_CALLING: 1 << 12,
    PREGNANT: 1 << 13,
    INFECTED: 1 << 15,
    SICK: 1 << 18,
    POLLEN: 1 << 19,
    POLLEN_HUE_SHIFT: 20,
    POLLEN_HUE_MASK: 0xfff,
};
const STATE = { RESTING: 1, SATED: 2, IN_COVER: 4, JUVENILE: 8 };
const TABLE = bakeClips(CLIPS);

/** @param {import('../helpers/snapshots.js').AgentSpec[]} specs agents @param {{tick?: number, setup?: (store: any) => void, ctx?: Record<string, any>}} [opts] */
function rigOf(specs, opts = {}) {
    const agents = createInterpolated(8);
    interpolateInto(null, makeSnapshot(1, specs), 1, agents);
    const store = createAgentStore(8, 1, [0], [12]);
    opts.setup?.(store);
    packAgents(agents, store, FLAGS, { dtMs: 1000, zoom: 1, slots: createFamilySlots(), tick: opts.tick ?? 0 });
    const rig = createAgentRig(8, 1);
    const ctx = {
        table: TABLE,
        flags: FLAGS,
        stateBits: STATE,
        timeSec: 0,
        palette: 'default',
        hunter: true,
        stress: { cold01: 0.2, heat01: 0.8 },
        temperatureLens: null,
        ...opts.ctx,
    };
    rigBucket(/** @type {any} */ (store.buckets[0]), agents, {
        rig,
        out: rig.arrays[0],
        ctx: /** @type {any} */ (ctx),
    });
    return rig.arrays[0];
}

describe('rigBucket', () => {
    it('writes a neon rim colour and a fill share that grows with energy', () => {
        const low = rigOf([{ slot: 0, genomeId: 1, energy: 0 }]);
        const high = rigOf([{ slot: 0, genomeId: 1, energy: 1 }]);
        const rim = Array.from(low.neon.slice(0, 3));
        const l = (Math.max(...rim) + Math.min(...rim)) / 2;
        expect(l).toBeCloseTo(NEON_LIGHTNESS, 3);
        expect(low.neon[3]).toBeCloseTo(FILL_FLOOR);
        expect(high.neon[3]).toBeCloseTo(FILL_SHARE.default);
    });

    it('rests the rig for a still non-hunter apart from the swim loop, and opens the jaw from the packed jaw', () => {
        const out = rigOf([{ slot: 0, genomeId: 1, flags: FLAGS.JAW_OPEN }], { ctx: { hunter: false } });
        expect(out.rig0[3]).toBeCloseTo(1, 1);
        expect(out.rig1[1]).toBeGreaterThan(0.9);
        expect(out.rig2[0]).toBe(1);
    });

    it('stalks a still hunter with its jaw open: the body stretches over the loop', () => {
        let most = 0;
        for (let t = 0; t < 2; t += 0.1) {
            const out = rigOf([{ slot: 0, genomeId: 1, flags: FLAGS.JAW_OPEN }], { ctx: { hunter: true, timeSec: t } });
            most = Math.max(most, out.rig0[3]);
        }
        expect(most).toBeGreaterThan(1.08);
    });

    it('plays the tween clip: a lunge stretches the body at its peak', () => {
        const out = rigOf([{ slot: 0, genomeId: 1 }], {
            tick: 2,
            setup: (store) => startTween(store.tweens, { slot: 0, genome: 1 }, TWEEN.LUNGE, 0),
        });
        expect(out.rig0[3]).toBeGreaterThan(1.2);
    });

    it('sets the gates and colours: pregnant, sick, pollen, alarm, cover, gestation', () => {
        const state = STATE.IN_COVER | (128 << 8);
        const out = rigOf([
            { slot: 0, genomeId: 1, flags: FLAGS.PREGNANT | FLAGS.SICK | FLAGS.POLLEN | FLAGS.ALARMING, state },
        ]);
        expect(Array.from(out.gate.slice(0, 4))).toEqual([1, 1, 0, 1]);
        expect(out.gate2[0]).toBe(1);
        expect(out.gate2[1]).toBe(1);
        expect(out.gate2[2]).toBeCloseTo(128 / 255);
        expect(Array.from(out.call.slice(0, 3))).toEqual(NEON.alarm.map((v) => Math.fround(v)));
        expect(out.accent[3]).toBe(1);
    });

    it('scales a juvenile eye and shivers a cold body', () => {
        const young = rigOf([{ slot: 0, genomeId: 1, state: STATE.JUVENILE }]);
        expect(young.rig1[2]).toBeCloseTo(JUVENILE_EYE, 1);
        const cold = rigOf([{ slot: 0, genomeId: 1, temperature: 0 }], { ctx: { timeSec: 0.02 } });
        expect(Math.abs(cold.rig0[0])).toBeGreaterThan(0);
    });

    it('takes the temperature colour under the lens', () => {
        const bands = { cold: 0.2, optimalMin: 0.4, optimalMax: 0.6, heat: 0.8 };
        const hot = rigOf([{ slot: 0, genomeId: 1, temperature: 0.95 }], { ctx: { temperatureLens: bands } });
        expect(hot.neon[0]).toBeGreaterThan(hot.neon[2]);
    });

    it('leaves rows past the count alone', () => {
        const out = rigOf([{ slot: 0, genomeId: 1 }]);
        expect(out.rig0[ITEM + CH.sx]).toBe(0);
    });
});
