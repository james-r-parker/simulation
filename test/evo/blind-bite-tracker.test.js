import { describe, expect, it } from 'vitest';
import { createBlindBiteTracker, EARLY_TICKS } from '../../js/evo/blind-bite-tracker.js';
import { GENE_OUTPUTS, OUTPUT_COUNT, OUTPUT_INDEX, POOLED_CHANNELS, POOLED_STRIDE } from '../../js/sim/brain-layout.js';

const layout = { weightCount: 20000, bOut: 5, wSkip: 8, geneOutputs: 10 };
const preyStrength = POOLED_CHANNELS.indexOf('prey') * POOLED_STRIDE;
const biteAt = GENE_OUTPUTS.indexOf(OUTPUT_INDEX.BITE);

/** @returns {Record<string, any>} a two-slot world, slot 0 a hunter, slot 1 a forager */
function makeWorld() {
    const weights = new Float32Array(40000);
    weights[layout.bOut + biteAt] = 0.5;
    weights[layout.wSkip + preyStrength * layout.geneOutputs + biteAt] = 0.25;
    return {
        tick: 10,
        layout,
        alive: Uint8Array.of(1, 1),
        spec: Uint8Array.of(1, 0),
        huntBySpec: Uint8Array.of(0, 1),
        genomeId: Uint32Array.of(7, 8),
        parentA: Uint32Array.of(3, 0),
        parentB: Uint32Array.of(4, 0),
        birthSource: Uint8Array.of(7, 0),
        weights,
        outputs: new Float32Array(2 * OUTPUT_COUNT),
        jawsStamp: new Uint32Array(2),
    };
}

describe('createBlindBiteTracker', () => {
    it('opens a life with its parents, source and BITE bias, and skips non-hunters', () => {
        const tracker = createBlindBiteTracker();
        tracker.observe(makeWorld());
        const [life, ...rest] = tracker.lives();
        expect(rest).toEqual([]);
        expect(life).toMatchObject({
            id: 7,
            parentA: 3,
            parentB: 4,
            source: 'split-hunter-parent',
            born: 10,
            bias: 0.5,
            preyBite: 0.25,
        });
    });

    it('counts a blind tick only when BITE is held and the jaws are empty', () => {
        const tracker = createBlindBiteTracker();
        const world = makeWorld();
        world.outputs[OUTPUT_INDEX.BITE] = 1;
        tracker.observe(world);
        world.tick = 11;
        world.jawsStamp[0] = 11;
        tracker.observe(world);
        world.tick = 12;
        world.outputs[OUTPUT_INDEX.BITE] = 0;
        tracker.observe(world);
        const [life] = tracker.lives();
        expect(life).toMatchObject({ ticks: 3, hold: 2, blind: 1, last: 12 });
        expect(tracker.endTick()).toBe(12);
    });

    it('keeps the early window to its first ticks and ignores a dead slot', () => {
        const tracker = createBlindBiteTracker();
        const world = makeWorld();
        world.outputs[OUTPUT_INDEX.BITE] = 1;
        for (let t = 0; t < EARLY_TICKS + 5; t++) {
            world.tick = 10 + t;
            tracker.observe(world);
        }
        world.alive[0] = 0;
        world.tick += 1;
        tracker.observe(world);
        const [life] = tracker.lives();
        expect(life.earlyTicks).toBe(EARLY_TICKS);
        expect(life.earlyBlind).toBe(EARLY_TICKS);
        expect(life.ticks).toBe(EARLY_TICKS + 5);
    });
});
