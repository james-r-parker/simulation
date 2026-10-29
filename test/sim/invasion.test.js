import { describe, expect, it } from 'vitest';
import { EVENT_STRIDE, EVENT_TYPE, readEvents } from '../../js/sim/events.js';
import { invade } from '../../js/sim/invasion.js';
import { applyEvents } from '../../js/evo/observer-events.js';
import { createObserver } from '../../js/evo/observer.js';
import { fork, createRng } from '../../js/sim/rng.js';
import { testPolicy } from './helpers/test-policy.js';
import { smallWorld } from './helpers/small-world.js';

const INVASION = { invasionInterval: 100, invasionSize: 5, maxAgents: 8, obstacleCount: 0 };

/**
 * @param {ReturnType<typeof smallWorld>} w the world
 * @returns {number[]} the slots of the alive agents
 */
function aliveSlots(w) {
    return Array.from(w.alive.keys()).filter((i) => w.alive[i] === 1);
}

describe('invade', () => {
    it('does nothing and draws nothing off the interval or with an interval of 0', () => {
        /** @type {[Record<string, any>, number][]} */
        const cases = [
            [{}, 99],
            [{ invasionInterval: 0 }, 100],
            [{}, 0],
        ];
        for (const [over, tick] of cases) {
            const w = smallWorld({ ...INVASION, ...over });
            const before = Array.from(w.rng.spawn.s);
            w.tick = tick;
            invade(w, testPolicy);
            expect(w.population).toBe(0);
            expect(Array.from(w.rng.spawn.s)).toEqual(before);
        }
    });

    it('brings invasionSize immigrants of one lineage and specialisation to one edge', () => {
        const w = smallWorld(INVASION);
        w.tick = 100;
        invade(w, testPolicy);
        const slots = aliveSlots(w);
        expect(slots).toHaveLength(5);
        expect(new Set(slots.map((s) => w.lineageId[s])).size).toBe(1);
        expect(new Set(slots.map((s) => w.spec[s])).size).toBe(1);
        expect(new Set(slots.map((s) => w.genomeId[s])).size).toBe(5);
        const o = (readEvents(w.events) - 1) * EVENT_STRIDE;
        const [type, , count, lineage, spec, edge] = w.events.data.subarray(o, o + EVENT_STRIDE);
        expect(type).toBe(EVENT_TYPE.INVASION_ARRIVED);
        expect([count, lineage, spec]).toEqual([5, w.lineageId[slots[0]], w.spec[slots[0]]]);
        for (const s of slots) {
            const distance = [w.x[s], 1000 - w.x[s], w.y[s], 1000 - w.y[s]][edge];
            expect(distance).toBeLessThan(200);
        }
    });

    it('uses every edge across seeds and never lands in an obstacle', () => {
        const edges = new Set();
        for (let seed = 1; seed <= 30; seed++) {
            const w = smallWorld({
                ...INVASION,
                seed,
                obstacleCount: 8,
                obstacleMinRadius: 100,
                obstacleMaxRadius: 200,
            });
            w.tick = 100;
            invade(w, testPolicy);
            const o = (readEvents(w.events) - 1) * EVENT_STRIDE;
            const edge = w.events.data[o + 5];
            edges.add(edge);
            for (const s of aliveSlots(w)) {
                for (let k = 0; k < 8; k++) {
                    expect(Math.hypot(w.x[s] - w.obsX[k], w.y[s] - w.obsY[k])).toBeGreaterThan(w.obsRadius[k]);
                }
            }
        }
        expect([...edges].sort()).toEqual([0, 1, 2, 3]);
    });

    it('stops at maxAgents', () => {
        const w = smallWorld({ ...INVASION, maxAgents: 3 });
        w.tick = 200;
        invade(w, testPolicy);
        expect(w.population).toBe(3);
    });

    it('writes the final lineage, specialisation and sex into every AgentBorn record', () => {
        let next = 0;
        const policy = { initSpec: () => next++ % 3, initBrain() {} };
        const w = smallWorld({ ...INVASION, sexesEnabled: true });
        const observer = createObserver(w.config, fork(createRng(w.config.seed), 'eval'));
        w.tick = 100;
        invade(w, policy);
        const d = w.events.data;
        let born = 0;
        for (let i = 0; i < w.events.count; i++) {
            const o = i * EVENT_STRIDE;
            if (d[o] === EVENT_TYPE.AGENT_BORN) {
                const slot = d[o + 2];
                born++;
                expect([d[o + 3], d[o + 4], d[o + 5], d[o + 9]]).toEqual([
                    w.genomeId[slot],
                    w.lineageId[slot],
                    w.spec[slot],
                    w.sex[slot],
                ]);
            }
        }
        expect(born).toBe(5);
        applyEvents(observer, w, undefined);
        for (const s of aliveSlots(w)) {
            expect([observer.lineageId[s], observer.spec[s]]).toEqual([w.lineageId[s], w.spec[s]]);
        }
    });
});
