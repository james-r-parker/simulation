import { describe, expect, it } from 'vitest';
import { GENE_OUTPUTS, OUTPUT_COUNT } from '../../js/sim/brain-layout.js';
import { createTraceRecorder, traceSummary } from '../../js/evo/brain-trace.js';

function worldFixture() {
    return {
        alive: new Uint8Array([0, 1]),
        pooled: new Float32Array([0, 0, 0.2, -0.4]),
        hidden: new Float32Array([0, 0.1]),
        outputs: new Float32Array(2 * OUTPUT_COUNT),
        x: new Float32Array([0, 10]),
        y: new Float32Array([0, 20]),
        angle: new Float32Array([0, 0.5]),
        energy: new Float64Array([0, 30]),
    };
}

describe('createTraceRecorder', () => {
    it('records the subject brain row and leaves rows zero after the subject dies', () => {
        const recorder = createTraceRecorder({ maxTicks: 2, inputCount: 2, hidden: 1 });
        const world = worldFixture();
        world.outputs[OUTPUT_COUNT] = 0.4;
        recorder.onTick(world, { subject: [1] }, 0);
        world.alive[1] = 0;
        recorder.onTick(world, { subject: [1] }, 1);

        const trace = recorder.finish(true);

        expect(trace).toMatchObject({ ticks: 2, won: true });
        expect(Array.from(trace.pooled)).toEqual([Math.fround(0.2), Math.fround(-0.4), 0, 0]);
        expect(Array.from(trace.hidden)).toEqual([Math.fround(0.1), 0]);
        expect(trace.outputs[0]).toBe(Math.fround(0.4));
        expect(Array.from(trace.alive)).toEqual([1, 0]);
        expect(Array.from(trace.x)).toEqual([10, 0]);
        expect(Array.from(trace.energy)).toEqual([30, 0]);
    });

    it('rejects more ticks than its preallocated capacity', () => {
        const recorder = createTraceRecorder({ maxTicks: 0, inputCount: 1, hidden: 1 });

        expect(() => recorder.onTick(worldFixture(), { subject: [1] }, 0)).toThrow(RangeError);
    });
});

describe('traceSummary', () => {
    it('rejects an incomplete output label table', () => {
        expect(() => traceSummary({ ticks: 0 }, { inputs: [], outputs: [], units: [] })).toThrow(/missing label/);
    });

    it('summarizes hidden changes, output firing and active pooled inputs', () => {
        const outputs = new Float32Array(3 * OUTPUT_COUNT);
        outputs[0] = 0.2;
        outputs[OUTPUT_COUNT] = -0.1;
        const trace = {
            ticks: 3,
            won: false,
            alive: new Uint8Array([1, 1, 0]),
            hidden: new Float32Array([0.1, 0.8, 0]),
            outputs,
            pooled: new Float32Array([1, 0, 0, 0, 5, 5]),
        };
        const labels = {
            inputs: ['food.hit0.strength', 'threat.hit0.strength'],
            outputs: GENE_OUTPUTS.map((_, i) => `gene${i}`),
            units: ['h0'],
        };

        const summary = traceSummary(trace, labels);

        expect(summary.hidden[0]).toMatchObject({ min: Math.fround(0.1), max: Math.fround(0.8), largestChangeTick: 1 });
        expect(summary.hidden[0].mean).toBeCloseTo(0.45);
        expect(summary.outputs[0]).toMatchObject({ output: 'gene0', firingTicks: 1, aliveTicks: 2, firingShare: 0.5 });
        expect(summary.outputs[8].output).toBe('split');
        expect(summary.inputs).toEqual(['food.hit0.strength']);
    });

    it('reports zero summaries when no subject tick is alive', () => {
        const trace = {
            ticks: 1,
            alive: new Uint8Array([0]),
            hidden: new Float32Array([0]),
            outputs: new Float32Array(OUTPUT_COUNT),
            pooled: new Float32Array(0),
        };
        const labels = { inputs: [], outputs: GENE_OUTPUTS.map((_, i) => `gene${i}`), units: ['h0'] };

        const summary = traceSummary(trace, labels);

        expect(summary.hidden[0]).toMatchObject({ mean: 0, min: 0, max: 0, largestChangeTick: null });
        expect(summary.outputs[0]).toMatchObject({ aliveTicks: 0, firingTicks: 0, firingShare: 0 });
        expect(summary.inputs).toEqual([]);
    });
});
