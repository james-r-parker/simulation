import v8 from 'node:v8';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { snapshotLayout } from '../../js/sim/snapshot.js';
import { createConfig } from '../../js/sim/config.js';
import {
    AGENT_STRIDE,
    createInterpolated,
    createPlayhead,
    HEADER_WORDS,
    interpolateInto,
    lerpAngle,
    simTickAt,
    stepPlayhead,
} from '../../js/app/interpolate.js';
import { makeSnapshot } from './helpers/snapshots.js';

describe('snapshot layout constants', () => {
    it('match the sim', () => {
        const layout = snapshotLayout(createConfig({}));
        expect(layout.agentStride).toBe(AGENT_STRIDE);
        expect(layout.headerWords).toBe(HEADER_WORDS);
    });
});

describe('lerpAngle', () => {
    it('takes the shorter arc across the seam', () => {
        expect(lerpAngle(3.0, -3.0, 0.5)).toBeCloseTo(Math.PI, 5);
        expect(lerpAngle(-3.0, 3.0, 0.5)).toBeCloseTo(-Math.PI, 5);
        expect(lerpAngle(0, 1, 0.25)).toBeCloseTo(0.25, 6);
    });
});

describe('interpolateInto', () => {
    const prev = makeSnapshot(10, [
        { slot: 0, genomeId: 1, x: 0, y: 0, angle: 3.0, size: 10, energy: 0, temperature: 0 },
        { slot: 2, genomeId: 5, x: 50, y: 50 },
    ]);
    const next = makeSnapshot(11, [
        { slot: 0, genomeId: 1, x: 10, y: 20, angle: -3.0, size: 20, energy: 1, temperature: 1, flags: 7 },
        { slot: 1, genomeId: 9, x: 70, y: 80, lineageId: 4, spec: 3 },
        { slot: 2, genomeId: 6, x: 90, y: 90 },
    ]);

    it('blends matched agents and returns exactly the endpoints at alpha 0 and 1', () => {
        const out = createInterpolated(8);
        expect(interpolateInto(prev, next, 0, out)).toBe(3);
        expect([out.x[0], out.y[0], out.size[0], out.energy[0]]).toEqual([0, 0, 10, 0]);
        interpolateInto(prev, next, 1, out);
        expect([out.x[0], out.y[0], out.size[0], out.energy[0], out.temperature[0]]).toEqual([10, 20, 20, 1, 1]);
        interpolateInto(prev, next, 0.5, out);
        expect([out.x[0], out.y[0], out.size[0], out.energy[0]]).toEqual([5, 10, 15, 0.5]);
        expect(out.angle[0]).toBeCloseTo(Math.PI, 5);
        expect(out.flags[0]).toBe(7);
    });

    it('places an agent with no match at its newest position (new slot, or slot reused by another genome)', () => {
        const out = createInterpolated(8);
        interpolateInto(prev, next, 0, out);
        expect([out.x[1], out.y[1], out.lineageId[1], out.spec[1], out.genomeId[1]]).toEqual([70, 80, 4, 3, 9]);
        expect([out.x[2], out.y[2], out.genomeId[2]]).toEqual([90, 90, 6]);
    });

    it('drops agents that vanished and uses the newest alone when there is no previous snapshot', () => {
        const out = createInterpolated(8);
        expect(interpolateInto(null, next, 0.3, out)).toBe(3);
        expect([out.x[0], out.y[0]]).toEqual([10, 20]);
        const gone = makeSnapshot(12, [{ slot: 2, genomeId: 6, x: 91 }]);
        expect(interpolateInto(next, gone, 0.5, out)).toBe(1);
        expect(out.x[0]).toBeCloseTo(90.5);
    });

    it('leaves the scratch map clean and caps at the capacity', () => {
        const out = createInterpolated(2);
        expect(interpolateInto(prev, next, 0.5, out)).toBe(2);
        expect(out.previous.every((v) => v === 0)).toBe(true);
    });

    it('allocates nothing per call', () => {
        // Heap growth over a window of calls is noisy for reasons outside the function: garbage left by earlier
        // tests, and V8 tiering the loop up (OSR, concurrent TurboFan) inside the window, which can add about 1 MB
        // when the machine is loaded. So collect before each window, keep the smallest growth of several windows
        // (an allocation per call shows in every one), and do not collect after, so short-lived garbage counts.
        // The alphas are literals: a computed double passed to a call is boxed by the caller, 16 bytes a call.
        v8.setFlagsFromString('--expose-gc');
        const gc = vm.runInNewContext('gc');
        const out = createInterpolated(8);
        const calls = 5000;
        const run = () => {
            for (let i = 0; i < calls; i += 2) {
                interpolateInto(prev, next, 0.25, out);
                interpolateInto(prev, next, 0.75, out);
            }
        };
        run();
        let best = Infinity;
        for (let window = 0; window < 10; window++) {
            gc();
            const before = process.memoryUsage().heapUsed;
            run();
            best = Math.min(best, process.memoryUsage().heapUsed - before);
        }
        // Under 4 bytes a call: no call allocates even one object (the smallest is larger).
        expect(best).toBeLessThan(calls * 4);
    });
});

describe('playhead', () => {
    const a = makeSnapshot(100, []);
    const b = makeSnapshot(108, []);
    const c = makeSnapshot(116, []);

    /**
     * Feeds snapshots 8 ticks apart every 133 ms (60 ticks a second) and steps at 240 Hz.
     * @returns {{head: ReturnType<typeof createPlayhead>, alphas: number[], ticks: number[]}} the playhead and the alphas seen
     */
    function run() {
        const head = createPlayhead();
        const snaps = { prev: /** @type {any} */ (null), latest: /** @type {any} */ (null) };
        const alphas = [];
        const ticks = [];
        for (let frame = 0; frame < 480; frame++) {
            const now = frame * 4.1667;
            const arrivals = Math.floor(now / 133.3);
            const tick = 100 + arrivals * 8;
            if (snaps.latest === null || snaps.latest.tick !== tick) {
                snaps.prev = snaps.latest;
                snaps.latest = makeSnapshot(tick, []);
            }
            alphas.push(stepPlayhead(head, snaps, now));
            ticks.push(simTickAt(head));
            if (snaps.prev !== null) {
                expect(simTickAt(head)).toBeGreaterThanOrEqual(snaps.prev.tick);
                expect(simTickAt(head)).toBeLessThanOrEqual(snaps.latest.tick);
            }
        }
        return { head, alphas, ticks };
    }

    it('sits on the newest tick with one snapshot or none', () => {
        const head = createPlayhead();
        expect(stepPlayhead(head, { prev: null, latest: null }, 0)).toBe(1);
        expect(stepPlayhead(head, { prev: null, latest: a }, 10)).toBe(1);
        expect(simTickAt(head)).toBe(100);
    });

    it('stays between the held snapshots and moves smoothly under regular arrivals', () => {
        const { alphas, ticks } = run();
        for (let i = 200; i < ticks.length; i++) {
            const step = ticks[i] - ticks[i - 1];
            expect(step).toBeGreaterThan(0.05);
            expect(step).toBeLessThan(0.6);
        }
        const tail = alphas.slice(200);
        let big = 0;
        for (let i = 1; i < tail.length; i++) {
            if (Math.abs(tail[i] - tail[i - 1]) > 0.3 && tail[i] > tail[i - 1]) {
                big += 1;
            }
        }
        expect(big).toBe(0);
        expect(Math.max(...tail)).toBeGreaterThan(0.5);
        expect(Math.min(...tail)).toBeLessThan(0.5);
    });

    it('holds on the newest tick when no snapshot arrives for 250 ms, and recovers on the next one', () => {
        const head = createPlayhead();
        stepPlayhead(head, { prev: null, latest: a }, 0);
        stepPlayhead(head, { prev: a, latest: b }, 100);
        stepPlayhead(head, { prev: a, latest: b }, 120);
        expect(stepPlayhead(head, { prev: a, latest: b }, 500)).toBe(1);
        expect(simTickAt(head)).toBe(108);
        const alpha = stepPlayhead(head, { prev: b, latest: c }, 510);
        expect(alpha).toBeGreaterThanOrEqual(0);
        expect(alpha).toBeLessThan(0.5);
    });

    it('restarts its estimate when the tick goes backwards (a new world)', () => {
        const head = createPlayhead();
        stepPlayhead(head, { prev: a, latest: b }, 0);
        stepPlayhead(head, { prev: a, latest: b }, 100);
        const fresh = makeSnapshot(3, []);
        expect(stepPlayhead(head, { prev: null, latest: fresh }, 110)).toBe(1);
        expect(simTickAt(head)).toBe(3);
    });

    it('clamps a stalled frame instead of jumping', () => {
        const head = createPlayhead();
        stepPlayhead(head, { prev: a, latest: b }, 0);
        stepPlayhead(head, { prev: a, latest: b }, 100);
        stepPlayhead(head, { prev: a, latest: b }, 20000);
        expect(simTickAt(head)).toBeLessThanOrEqual(108);
    });
});

describe('playhead with identical arrival times or repeated ticks', () => {
    it('does not divide by zero and stays on a valid alpha', () => {
        const head = createPlayhead();
        const a = makeSnapshot(100, []);
        const b = makeSnapshot(108, []);
        const c = makeSnapshot(116, []);
        stepPlayhead(head, { prev: null, latest: a }, 50);
        stepPlayhead(head, { prev: a, latest: b }, 50);
        const alpha = stepPlayhead(head, { prev: b, latest: c }, 50);
        expect(Number.isFinite(alpha)).toBe(true);
        expect(alpha).toBeGreaterThanOrEqual(0);
        expect(alpha).toBeLessThanOrEqual(1);
    });

    it('gives alpha 1 when the held snapshots show the same tick', () => {
        const head = createPlayhead();
        const a = makeSnapshot(100, []);
        stepPlayhead(head, { prev: null, latest: a }, 0);
        stepPlayhead(head, { prev: makeSnapshot(99, []), latest: a }, 10);
        expect(stepPlayhead(head, { prev: a, latest: a }, 20)).toBe(1);
    });
});
