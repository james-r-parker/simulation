import { describe, expect, it } from 'vitest';
import {
    DROP_CAUSE,
    QUEUE_SIZE,
    REWARD_SOURCE,
    dropQueuedRewards,
    noteReward,
    rewardScale,
} from '../../js/sim/reward.js';
import { EVENT_TYPE } from '../../js/sim/events.js';
import { applyGenes } from '../../js/sim/traits.js';
import { hashWorld } from '../../js/sim/world-hash.js';
import { rewardHashBytes } from '../../js/sim/reward-hash.js';
import { addBlob } from './helpers/life-world.js';
import { smallWorld } from './helpers/small-world.js';

const FOOD = 100;
const MIN = 5;
const MAX = 20;

/**
 * @param {Record<string, any>} over config overrides
 * @returns {{world: any, slot: number}} a shuffled-reward world with one agent and no trace decay
 */
function setup(over = {}) {
    const world = smallWorld({
        rewardedHebb: true,
        rewardShuffle: true,
        rewardShuffleMin: MIN,
        rewardShuffleMax: MAX,
        rewardDecay: 0,
        foodEnergy: FOOD,
        ...over,
    });
    return { world, slot: addBlob(world) };
}

/**
 * Plays ticks forward, one `rewardScale` per tick as `hebbianStep` does, and notes when the trace rises.
 * @param {Record<string, any>} world the world
 * @param {number} slot the slot
 * @param {number} ticks how many ticks to play
 * @returns {{tick: number, gain: number}[]} each delivery
 */
function play(world, slot, ticks) {
    /** @type {{tick: number, gain: number}[]} */
    const seen = [];
    for (let t = 0; t < ticks; t++) {
        const before = world.rewardTrace[slot];
        rewardScale(world, slot);
        if (world.rewardTrace[slot] > before) {
            seen.push({ tick: world.tick, gain: world.rewardTrace[slot] - before });
        }
        world.tick += 1;
    }
    return seen;
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot the slot
 * @returns {number[]} the due values (tick plus one) in the slot's queue
 */
function queued(world, slot) {
    return Array.from(world.rewardDue.slice(slot * QUEUE_SIZE, (slot + 1) * QUEUE_SIZE)).filter((d) => d > 0);
}

describe('the shuffled reward', () => {
    it('does not feed the trace at the act: it queues the reward', () => {
        const { world, slot } = setup();
        noteReward(world, slot, REWARD_SOURCE.KILL, 20);
        expect(world.rewardTrace[slot]).toBe(0);
        expect(world.rewardDue.slice(slot * QUEUE_SIZE, (slot + 1) * QUEUE_SIZE).filter((d) => d > 0)).toHaveLength(1);
        expect(world.rewardCounts[REWARD_SOURCE.KILL]).toBe(1);
    });

    it('delivers every reward with its own size, MIN to MAX ticks after the act', () => {
        const { world, slot } = setup();
        const sizes = [10, 20, 30, 5];
        sizes.forEach((stored) => noteReward(world, slot, REWARD_SOURCE.BITE, stored));
        const dueTicks = queued(world, slot).map((due) => due - 1);
        const seen = play(world, slot, MAX + 2);
        expect(seen.map((d) => d.tick)).toEqual([...new Set(dueTicks)].sort((a, b) => a - b));
        for (const tick of dueTicks) {
            expect(tick).toBeGreaterThanOrEqual(MIN);
            expect(tick).toBeLessThanOrEqual(MAX);
        }
        const total = seen.reduce((sum, d) => sum + d.gain, 0);
        expect(total).toBeCloseTo(sizes.reduce((a, b) => a + b, 0) / FOOD, 5);
        expect(queued(world, slot)).toEqual([]);
    });

    it('drops a fifth reward when the queue is full, counts it and logs the event', () => {
        const { world, slot } = setup();
        for (let i = 0; i < QUEUE_SIZE + 1; i++) {
            noteReward(world, slot, REWARD_SOURCE.BITE, 10);
        }
        expect(world.rewardDropped).toBe(1);
        const d = world.events.data;
        const o = (world.events.count - 1) * 12;
        expect(d[o]).toBe(EVENT_TYPE.REWARD_SHUFFLE_DROPPED);
        expect(d[o + 2]).toBe(world.genomeId[slot]);
        expect(d[o + 4]).toBe(DROP_CAUSE.QUEUE_FULL);
        expect(queued(world, slot)).toHaveLength(QUEUE_SIZE);
        play(world, slot, MAX + 2);
        expect(world.rewardTrace[slot]).toBeCloseTo((QUEUE_SIZE * 10) / FOOD, 5);
    });

    it('drops the queued rewards at death, one count each', () => {
        const { world, slot } = setup();
        noteReward(world, slot, REWARD_SOURCE.BITE, 10);
        noteReward(world, slot, REWARD_SOURCE.BITE, 10);
        dropQueuedRewards(world, slot);
        expect(world.rewardDropped).toBe(2);
        expect(world.events.data[(world.events.count - 1) * 12 + 4]).toBe(DROP_CAUSE.DEATH);
    });

    it('clears the queue when the slot is reused', () => {
        const { world, slot } = setup();
        noteReward(world, slot, REWARD_SOURCE.BITE, 10);
        applyGenes(world, slot);
        expect(play(world, slot, MAX + 2)).toHaveLength(0);
    });

    it('gives the same schedule from the same seed and a different one from another', () => {
        /** @param {number} seed @returns {number[]} */
        const ticks = (seed) => {
            const { world, slot } = setup({ seed });
            for (let i = 0; i < 4; i++) {
                noteReward(world, slot, REWARD_SOURCE.BITE, 10);
            }
            return Array.from(world.rewardDue.slice(slot * QUEUE_SIZE, (slot + 1) * QUEUE_SIZE));
        };
        expect(ticks(7)).toEqual(ticks(7));
        expect(ticks(7)).not.toEqual(ticks(8));
    });

    it('draws nothing with rewardShuffle off, and never moves another stream', () => {
        const off = smallWorld({ rewardedHebb: true, foodEnergy: FOOD });
        const slot = addBlob(off);
        const before = Array.from(off.rng['reward-shuffle'].s);
        noteReward(off, slot, REWARD_SOURCE.KILL, 50);
        expect(Array.from(off.rng['reward-shuffle'].s)).toEqual(before);
        const on = setup();
        const others = Object.keys(on.world.rng).filter((name) => name !== 'reward-shuffle');
        const states = others.map((name) => Array.from(on.world.rng[name].s));
        noteReward(on.world, on.slot, REWARD_SOURCE.KILL, 50);
        expect(others.map((name) => Array.from(on.world.rng[name].s))).toEqual(states);
        expect(Array.from(on.world.rng['reward-shuffle'].s)).not.toEqual(before);
    });

    it('hashes the queue and the stream only when on', () => {
        const { world, slot } = setup();
        expect(rewardHashBytes(world)).toHaveLength(4);
        const before = hashWorld(world);
        noteReward(world, slot, REWARD_SOURCE.KILL, 50);
        expect(hashWorld(world)).not.toBe(before);
        expect(rewardHashBytes(smallWorld({ rewardedHebb: true }))).toHaveLength(1);
    });
});
