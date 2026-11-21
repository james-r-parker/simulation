import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT, OUTPUT_INDEX, brainLayout } from '../../js/sim/brain-layout.js';
import { createConfig } from '../../js/sim/config.js';
import {
    CENSUS_EVERY,
    createCensus,
    inputRows,
    noteCensusTick,
    outputRows,
    verdictOf,
} from '../../js/evo/signal-census.js';

const config = createConfig();
const layout = brainLayout(config);

/**
 * A world with `agents` alive agents and zeroed inputs, outputs and weights.
 * @param {number} agents how many agents
 * @returns {Record<string, any>} the fake world
 */
function fakeWorld(agents = 2) {
    return {
        config,
        layout,
        tick: CENSUS_EVERY,
        alive: new Uint8Array(agents).fill(1),
        genomeId: new Uint32Array(agents).map((_, i) => i + 1),
        parentA: new Uint32Array(agents),
        parentB: new Uint32Array(agents),
        spec: new Uint8Array(agents),
        size: new Float32Array(agents).fill(10),
        lanes: { visionRange: new Float64Array(agents).fill(300) },
        x: new Float32Array(agents),
        y: new Float32Array(agents),
        foodAlive: new Uint8Array(4),
        foodX: new Float32Array(4),
        foodY: new Float32Array(4),
        pooled: new Float32Array(agents * layout.inputCount),
        outputs: new Float32Array(agents * OUTPUT_COUNT),
        weights: new Float32Array(agents * layout.weightCount),
    };
}

describe('the input rows', () => {
    it('read a constant input as narrow, a zero one as dead and a spread one as neither', () => {
        const world = fakeWorld();
        const census = createCensus(config);
        for (let round = 0; round < 4; round++) {
            for (let slot = 0; slot < 2; slot++) {
                world.pooled[slot * layout.inputCount + 0] = 0.5;
                world.pooled[slot * layout.inputCount + 1] = (round + slot) % 2 === 0 ? -1 : 1;
            }
            world.tick = CENSUS_EVERY * (round + 1);
            noteCensusTick(census, world);
        }
        const rows = inputRows(census);
        expect(rows[0]).toMatchObject({ nonzeroShare: 1, mean: 0.5, sd: 0, narrow: true });
        expect(rows[1].narrow).toBe(false);
        expect(rows[1].sd).toBeCloseTo(1);
        expect(rows[2]).toMatchObject({ nonzeroShare: 0, narrow: false, verdict: 'dead' });
    });

    it('sample only on ticks that divide by CENSUS_EVERY', () => {
        const world = fakeWorld();
        const census = createCensus(config);
        world.tick = CENSUS_EVERY + 1;
        noteCensusTick(census, world);
        expect(census.samples).toBe(0);
    });

    it('measure use as the mean absolute weight leaving an input over the mean of all inputs', () => {
        const world = fakeWorld(1);
        const census = createCensus(config);
        world.weights.fill(1);
        const inputWeights = layout.hidden;
        const input = layout.inputCount - 1;
        for (let h = 0; h < layout.hidden; h++) {
            world.weights[layout.wIn + input * layout.hidden + h] = 0;
        }
        world.pooled[0] = 1;
        noteCensusTick(census, world);
        const rows = inputRows(census);
        expect(inputWeights).toBeGreaterThan(0);
        expect(rows[input].use).toBe(0);
        expect(rows[input].verdict).toBe('dead');
        expect(rows[0].use).toBeGreaterThan(1);
        expect(rows[0].verdict).toBe('alive');
    });

    it('call a present input with no weight leaving it unused', () => {
        expect(verdictOf(0.5, 0.05)).toBe('unused');
        expect(verdictOf(0.5, 0.1)).toBe('alive');
        expect(verdictOf(0.005, 5)).toBe('dead');
    });
});

describe('the output rows', () => {
    it('count the fire share of each action against its own threshold', () => {
        const world = fakeWorld(1);
        const census = createCensus(config);
        const row = (/** @type {Record<string, number>} */ values) => {
            world.outputs.fill(0);
            for (const [name, v] of Object.entries(values)) {
                world.outputs[OUTPUT_INDEX[/** @type {keyof typeof OUTPUT_INDEX} */ (name)]] = v;
            }
            noteCensusTick(census, world);
        };
        row({ BITE: 0.1, ALARM: 0.5 });
        row({ BITE: -0.1, ALARM: 0.7 });
        const byName = Object.fromEntries(outputRows(census).map((r) => [r.name, r]));
        expect(byName.BITE.fireShare).toBe(0.5);
        expect(byName.ALARM.fireShare).toBe(0.5);
        expect(byName.TURN.fireShare).toBeNull();
        expect(byName.BITE.nonzeroShare).toBe(1);
        expect(byName.SMOKE.nonzeroShare).toBe(0);
    });

    it('track only the first CENSUS_AGENTS slots and skip dead ones', () => {
        const world = fakeWorld(40);
        world.alive[3] = 0;
        const census = createCensus(config);
        noteCensusTick(census, world);
        expect(census.outputTicks).toBe(31);
    });
});

describe('a census that has sampled nothing', () => {
    it('reads every input and output row as zero, without dividing by nothing', () => {
        const census = createCensus(config);
        for (const row of inputRows(census)) {
            expect(row).toMatchObject({ nonzeroShare: 0, mean: 0, sd: 0, min: 0, max: 0, use: 0, narrow: false });
        }
        for (const row of outputRows(census)) {
            expect(row).toMatchObject({ nonzeroShare: 0, mean: 0, sd: 0 });
            expect(row.fireShare === null || row.fireShare === 0).toBe(true);
        }
        expect(outputRows(census).some((row) => row.fireShare === 0)).toBe(true);
    });
});
