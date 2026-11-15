import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT, OUTPUT_INDEX, POOLED_CHANNELS, POOLED_STRIDE, brainLayout } from '../../js/sim/brain-layout.js';
import { createConfig } from '../../js/sim/config.js';
import { CENSUS_EVERY, createCensus, inputRows, noteCensusTick, outputRows } from '../../js/evo/signal-census.js';

const config = createConfig();
const layout = brainLayout(config);
const FOOD = POOLED_CHANNELS.indexOf('food') * POOLED_STRIDE;
const THREAT = POOLED_CHANNELS.indexOf('threat') * POOLED_STRIDE;
const BITE = OUTPUT_INDEX.BITE;

/**
 * @param {number} agents how many agents
 * @returns {Record<string, any>} a world with every tracked array zeroed, tick 1 and the agents alive
 */
function fakeWorld(agents = 1) {
    const world = {
        config,
        layout,
        tick: 1,
        alive: new Uint8Array(agents).fill(1),
        genomeId: new Uint32Array(agents).map((_, i) => i + 1),
        parentA: new Uint32Array(agents),
        parentB: new Uint32Array(agents),
        spec: new Uint8Array(agents),
        size: new Float32Array(agents).fill(10),
        vision: new Float32Array(agents).fill(1),
        visionBySpec: new Float32Array(8).fill(300),
        x: new Float32Array(agents),
        y: new Float32Array(agents),
        foodAlive: new Uint8Array(4),
        foodX: new Float32Array(4),
        foodY: new Float32Array(4),
        pooled: new Float32Array(agents * layout.inputCount),
        outputs: new Float32Array(agents * OUTPUT_COUNT),
        weights: new Float32Array(agents * layout.weightCount),
    };
    return world;
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} at index of a hit's strength in agent 0's row
 * @param {number[]} hit strength, cosine, sine
 * @returns {void}
 */
function setHit(world, at, hit) {
    hit.forEach((v, k) => {
        world.pooled[at + k] = v;
    });
}

/**
 * Plays one tick of two food hits in agent 0's row.
 * @param {ReturnType<typeof createCensus>} census the census
 * @param {Record<string, any>} world the world
 * @param {[number[], number[]]} hits the first and second hit
 * @returns {void}
 */
function tickHits(census, world, [first, second]) {
    setHit(world, FOOD, first);
    setHit(world, FOOD + 3, second);
    world.tick += 1;
    noteCensusTick(census, world);
}

describe('the swap rate', () => {
    const near = [0.9, 1, 0];
    const far = [0.5, 0, 1];

    it('counts the ticks the two hits trade places over the ticks both were present', () => {
        const world = fakeWorld();
        const census = createCensus(config);
        tickHits(census, world, [near, far]);
        tickHits(census, world, [far, near]);
        tickHits(census, world, [far, near]);
        tickHits(census, world, [near, far]);
        const rows = inputRows(census);
        expect(rows[FOOD].swapRate).toBeCloseTo(2 / 3);
        expect(rows[FOOD + 3].swapRate).toBeCloseTo(2 / 3);
        expect(rows[FOOD + 1].swapRate).toBeNull();
    });

    it('reads 0 when the hits never trade, and when one hit is missing', () => {
        const world = fakeWorld();
        const census = createCensus(config);
        for (let t = 0; t < 4; t++) {
            tickHits(census, world, [near, t % 2 === 0 ? far : [0, 0, 0]]);
        }
        expect(inputRows(census)[FOOD].swapRate).toBe(0);
    });

    it('does not carry a row across a slot taken by a new genome', () => {
        const world = fakeWorld();
        const census = createCensus(config);
        tickHits(census, world, [near, far]);
        world.genomeId[0] = 99;
        tickHits(census, world, [far, near]);
        expect(inputRows(census)[FOOD].swapRate).toBe(0);
    });
});

describe('the chatter', () => {
    /**
     * @param {boolean} still whether the inputs hold still while BITE flips every tick
     * @returns {number} the chatter of `BITE`
     */
    function chatterOf(still) {
        const world = fakeWorld();
        const census = createCensus(config);
        for (let t = 0; t < 12; t++) {
            world.pooled[FOOD] = still ? 0.5 : t % 2;
            world.outputs[BITE] = t % 2 === 0 ? 0.2 : -0.2;
            world.tick += 1;
            noteCensusTick(census, world);
        }
        const bite = outputRows(census).find((r) => r.name === 'BITE');
        return /** @type {number} */ (bite?.chatter);
    }

    it('counts an action that flips on every tick while the inputs are still, per 100 still ticks', () => {
        expect(chatterOf(true)).toBeCloseTo(100);
    });

    it('does not count flips that follow the inputs', () => {
        expect(chatterOf(false)).toBe(0);
    });

    it('is null for an output that is not an action', () => {
        const world = fakeWorld();
        const census = createCensus(config);
        noteCensusTick(census, world);
        expect(outputRows(census).find((r) => r.name === 'TURN')?.chatter).toBeNull();
    });
});

describe('the flash rate', () => {
    /**
     * @param {boolean} onRay whether the food is on a ray
     * @returns {number | null} the food channel's flash rate with a food 100 px away
     */
    function foodFlash(onRay) {
        const world = fakeWorld();
        world.tick = CENSUS_EVERY;
        world.foodAlive[1] = 1;
        world.foodX[1] = 100;
        world.pooled[FOOD] = onRay ? 0.7 : 0;
        const census = createCensus(config);
        noteCensusTick(census, world);
        return inputRows(census)[FOOD].flashRate;
    }

    it('is 1 when a food is in vision and no ray holds it, and 0 when one does', () => {
        expect(foodFlash(false)).toBe(1);
        expect(foodFlash(true)).toBe(0);
    });

    it('ignores a food beyond vision', () => {
        const world = fakeWorld();
        world.tick = CENSUS_EVERY;
        world.foodAlive[1] = 1;
        world.foodX[1] = 5000;
        const census = createCensus(config);
        noteCensusTick(census, world);
        expect(inputRows(census)[FOOD].flashRate).toBe(0);
    });

    it('puts a larger hunter in the threat channel', () => {
        const world = fakeWorld(2);
        world.tick = CENSUS_EVERY;
        world.spec[1] = 1;
        world.size[1] = 30;
        world.x[1] = 80;
        const census = createCensus(config);
        noteCensusTick(census, world);
        const rows = inputRows(census);
        expect(rows[THREAT].flashRate).toBe(1);
        expect(rows[FOOD].flashRate).toBe(0);
    });
});
