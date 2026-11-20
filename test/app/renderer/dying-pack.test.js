import { describe, expect, it } from 'vitest';
import { createFamilySlots } from '../../../js/app/family-slots.js';
import { createInterpolated } from '../../../js/app/interpolate.js';
import { createAgentRig, rigBucket } from '../../../js/app/renderer/agent-rig.js';
import { createAgentStore, ITEM, packAgents } from '../../../js/app/renderer/agents-pack.js';
import { TWEEN } from '../../../js/app/renderer/body-tweens.js';
import { bakeClips } from '../../../js/app/renderer/clip-sampler.js';
import { CH, CLIPS } from '../../../js/app/renderer/clips.js';
import { DEATH_ANIMS } from '../../../js/app/renderer/death-anim.js';
import { beginDeath, createDying, PENDING_MAX_MS, trackBodies } from '../../../js/app/renderer/dying.js';
import { packDying } from '../../../js/app/renderer/dying-pack.js';

const FLAGS = { ATE_SHIFT: 0, BITTEN_SHIFT: 5, TIMER_MASK: 31, JAW_OPEN: 1 << 10 };
const NAMES = ['STARVED', 'EATEN'];
const SLOTS = createFamilySlots();

/**
 * @param {number[]} genomes the agents' genomes, slot = index
 * @returns {ReturnType<typeof createInterpolated>} the frame
 */
function frame(genomes) {
    const a = createInterpolated(8);
    a.count = genomes.length;
    genomes.forEach((g, i) => {
        a.slot[i] = i;
        a.genomeId[i] = g;
        a.x[i] = 10 * i;
        a.size[i] = 10;
        a.lineageId[i] = 1;
        a.energy[i] = 0.5;
        a.angle[i] = 0;
    });
    return a;
}

/**
 * @param {number} capacity rows per bucket
 * @returns {ReturnType<typeof createAgentStore>} a one-mesh store
 */
function storeOf(capacity = 8) {
    const store = createAgentStore(capacity, 1, [0], [12]);
    return store;
}

const VIEW = { slots: SLOTS, zoom: 1, causeNames: NAMES, nowMs: 0 };

describe('packDying', () => {
    it('appends a dying row after the live rows, with no agent index, a death clip kind and the progress', () => {
        const d = createDying(8);
        trackBodies(d, frame([30, 31]), 0);
        const live = frame([31]);
        live.slot[0] = 1;
        trackBodies(d, live, 16);
        beginDeath(d, { genome: 30, cause: 1, nowMs: 100 });
        const store = storeOf();
        packAgents(live, store, FLAGS, { dtMs: 16, zoom: 1, slots: SLOTS });
        expect(packDying(d, store, { ...VIEW, nowMs: 100 + DEATH_ANIMS.EATEN.ms / 2 })).toBe(1);
        const b = store.buckets[0];
        expect(b.count).toBe(2);
        expect(b.index[1]).toBe(-1);
        expect(b.tween[ITEM]).toBe(TWEEN.RUPTURE);
        expect(b.tween[ITEM + 1]).toBeCloseTo(0.5);
        expect(b.fade[1]).toBeGreaterThan(0);
        expect(b.fade[0]).toBe(0);
    });

    it('draws a pending body whole: no clip and no fade', () => {
        const d = createDying(8);
        trackBodies(d, frame([30]), 0);
        trackBodies(d, frame([]), 16);
        const store = storeOf();
        packDying(d, store, VIEW);
        expect(store.buckets[0].tween[0]).toBe(0);
        expect(store.buckets[0].fade[0]).toBe(0);
    });

    it('keeps the live lanes on a pending body, its speed slowing to rest over the failing beat', () => {
        const d = createDying(8);
        const agents = frame([30]);
        agents.speed[0] = 100;
        agents.temperature[0] = 0.4;
        agents.state[0] = 0x0000ff03;
        agents.flags[0] = 4;
        trackBodies(d, agents, 0);
        trackBodies(d, frame([]), 0);
        const view = { ...VIEW, flagBits: { PREGNANT: 4, SICK: 2, INFECTED: 1 }, maxVelocity: 200 };
        const store = storeOf();
        packDying(d, store, { ...view, nowMs: 0 });
        const b = store.buckets[0];
        expect(b.motion[0]).toBeCloseTo(0.5);
        expect(b.state[0]).toBeCloseTo(0.4);
        expect(b.extra[0]).toBe(1);
        expect(b.extra[2]).toBe(0);
        expect(b.body[0]).toBe(3);
        expect(b.body[1]).toBeCloseTo(1);
        expect(b.tween[0]).toBe(0);
        const later = storeOf();
        packDying(d, later, { ...view, nowMs: PENDING_MAX_MS });
        expect(later.buckets[0].motion[0]).toBeLessThan(0.1 * b.motion[0]);
        expect(later.buckets[0].motion[2]).toBe(b.motion[2]);
    });

    it('packs without flag bits or a speed scale: no status, the default top speed', () => {
        const d = createDying(8);
        const agents = frame([30]);
        agents.speed[0] = 100;
        agents.flags[0] = 7;
        trackBodies(d, agents, 0);
        trackBodies(d, frame([]), 0);
        const store = storeOf();
        packDying(d, store, VIEW);
        expect(store.buckets[0].extra[0]).toBe(0);
        expect(store.buckets[0].motion[0]).toBeCloseTo(0.5);
    });

    it('marks a body neutral only under the default palette without a colour slot', () => {
        const d = createDying(8);
        trackBodies(d, frame([30]), 0);
        trackBodies(d, frame([]), 16);
        const plain = storeOf();
        packDying(d, plain, VIEW);
        expect(plain.buckets[0].extra[1]).toBe(1);
        const other = storeOf();
        packDying(d, other, { ...VIEW, slots: createFamilySlots('high-contrast') });
        expect(other.buckets[0].extra[1]).toBe(0);
    });

    it('stops at the bucket capacity', () => {
        const d = createDying(8);
        trackBodies(d, frame([1, 2, 3]), 0);
        trackBodies(d, frame([]), 16);
        expect(packDying(d, storeOf(2), VIEW)).toBe(2);
    });

    it('skips the live row of a body whose death is playing, so it is drawn once', () => {
        const d = createDying(8);
        const agents = frame([30, 31]);
        trackBodies(d, agents, 0);
        beginDeath(d, { genome: 30, cause: 0, nowMs: 0 });
        const store = storeOf();
        store.dying = d;
        packAgents(agents, store, FLAGS, { dtMs: 16, zoom: 1, slots: SLOTS });
        expect(store.buckets[0].count).toBe(1);
        expect(store.buckets[0].index[0]).toBe(1);
        packDying(d, store, VIEW);
        expect(store.buckets[0].count).toBe(2);
    });

    it('rigs a dying row through its clip and carries the fade into the dent lane', () => {
        const d = createDying(8);
        trackBodies(d, frame([30]), 0);
        trackBodies(d, frame([]), 16);
        beginDeath(d, { genome: 30, cause: 0, nowMs: 0 });
        const store = storeOf();
        packDying(d, store, { ...VIEW, nowMs: DEATH_ANIMS.STARVED.ms });
        const rig = createAgentRig(8, 1);
        const ctx = {
            table: bakeClips(CLIPS),
            flags: FLAGS,
            stateBits: { RESTING: 1, SATED: 2, IN_COVER: 4, JUVENILE: 8 },
            timeSec: 0,
            palette: 'default',
            hunter: false,
            stress: { cold01: 0.2, heat01: 0.8 },
            temperatureLens: null,
            dents: null,
            tick: 0,
        };
        rigBucket(/** @type {any} */ (store.buckets[0]), createInterpolated(8), {
            rig,
            out: rig.arrays[0],
            ctx: /** @type {any} */ (ctx),
        });
        const out = rig.arrays[0];
        expect(out.dent[3]).toBe(1);
        expect(out.rig1[0]).toBeLessThan(0.4);
        expect(CH.sy).toBe(4);
    });
});
