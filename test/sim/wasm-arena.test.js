import { describe, expect, it } from 'vitest';
import { brainLayout } from '../../js/sim/brain-layout.js';
import { createConfig } from '../../js/sim/config.js';
import { detTanh } from '../../js/sim/det-math.js';
import { freeAgent } from '../../js/sim/world.js';
import { hashWorld } from '../../js/sim/world-hash.js';
import {
    ALIGN,
    MAX_PAGES,
    BRAIN_FIELDS,
    WORLD_FIELDS,
    arenaSpecs,
    attachWasm,
    createArena,
    layoutArena,
} from '../../js/sim/wasm-arena.js';
import { embeddedKernels } from '../../js/sim/wasm-loader.js';
import { smallWorld } from './helpers/small-world.js';

const kernels = embeddedKernels();

/**
 * @param {Record<string, any>} world an attached world
 * @returns {Record<string, any>} a shallow copy without an arena of its own yet, with its own agent and food rows
 */
function detachedCopy(world) {
    /** @type {Record<string, any>} */
    const copy = {
        ...world,
        agentRows: world.agentRows.map((/** @type {any} */ row) => ({ ...row })),
        foodRows: world.foodRows.map((/** @type {any} */ row) => ({ ...row })),
    };
    delete copy.wasm;
    return copy;
}

describe('arena layout', () => {
    const config = createConfig({ maxAgents: 37, initialAgents: 10, minAgents: 10, rayCount: 7, brainHidden: 5 });
    const layout = brainLayout(config);
    const specs = arenaSpecs(config, layout);

    it('sizes every array from maxAgents, the brain layout and rayCount', () => {
        const length = Object.fromEntries(specs.map(([name, , n]) => [name, n]));
        expect(length.weights).toBe(37 * layout.weightCount);
        expect(length.hidden).toBe(38 * 5); // one scratch row
        expect(length.inputs).toBe(37 * layout.rawInputCount);
        expect(length.pooled).toBe(37 * layout.inputCount);
        expect(length.fastOut).toBe(37 * 5 * layout.geneOutputs);
        expect(length.rayCos).toBe(7);
        expect(BRAIN_FIELDS.every((name) => name in length)).toBe(true);
    });

    it('starts every array on a 16-byte boundary at or after the heap base, with no two overlapping', () => {
        const { offsets, end } = layoutArena(specs, 65541);
        const spans = specs
            .map(([name, Type, n]) => [offsets[name], offsets[name] + n * Type.BYTES_PER_ELEMENT])
            .sort((a, b) => a[0] - b[0]);
        expect(spans[0][0]).toBeGreaterThanOrEqual(65541);
        for (const [i, [from, to]] of spans.entries()) {
            expect(from % ALIGN).toBe(0);
            expect(to).toBeLessThanOrEqual(i + 1 < spans.length ? spans[i + 1][0] : end);
        }
    });
});

describe('createArena', () => {
    const world = smallWorld();

    it('requests the whole memory up front, sized for the world, and cannot grow', () => {
        const arena = createArena(kernels, world.config, world.layout);
        const pages = arena.memory.buffer.byteLength / 65536;
        const { end } = layoutArena(arenaSpecs(world.config, world.layout), kernels.heapBase);
        expect(pages).toBe(Math.ceil(end / 65536));
        expect(() => arena.memory.grow(1)).toThrow(RangeError);
        expect(arena.memory.buffer.byteLength / 65536).toBe(pages);
    });

    it('gives views that share their bytes with the kernel', () => {
        const arena = createArena(kernels, world.config, world.layout);
        arena.views.scratch.set([0.25, -3, 0]);
        expect(arena.exports.tanh_into(arena.offsets.scratch, 3)).toBe(0);
        expect(Array.from(arena.views.scratch.subarray(0, 3))).toEqual([detTanh(0.25), detTanh(-3), 0]);
    });

    it('fails loudly past the page limit', () => {
        const huge = { ...world.config, maxAgents: 1e6 };
        const layout = brainLayout({ ...world.config, brainHidden: 64 });
        expect(() => createArena(kernels, huge, layout)).toThrow(`the limit is ${MAX_PAGES}`);
    });
});

describe('attachWasm', () => {
    it('is done at birth: every hot array of a new world lives in its arena', () => {
        const world = smallWorld({ initialAgents: 5 });
        expect(world.wasm).toBeDefined();
        for (const name of WORLD_FIELDS) {
            expect(world[name].buffer).toBe(world.wasm.memory.buffer);
        }
    });

    it('moves a copy onto its own arena with every hot array and its contents, and the world hash does not move', () => {
        const world = smallWorld({ initialAgents: 5 });
        const before = hashWorld(smallWorld({ initialAgents: 5 })); // a twin: a hashed world cannot be attached
        const copy = detachedCopy(world);
        expect(attachWasm(copy)).toBe(true);
        for (const name of WORLD_FIELDS) {
            expect(copy[name].buffer).toBe(copy.wasm.memory.buffer);
            expect(copy[name].buffer).not.toBe(world.wasm.memory.buffer);
            expect(copy[name]).toEqual(world[name]);
        }
        expect(hashWorld(copy)).toBe(before);
    });

    it('re-points the food rows too, so a food slot zeroed by its row clears the arena bytes the kernel reads', () => {
        const world = smallWorld();
        const rowArrays = world.foodRows.map((/** @type {any} */ row) => row.array);
        for (const name of ['foodX', 'foodY', 'foodRadius']) {
            expect(world[name].buffer).toBe(world.wasm.memory.buffer);
            expect(rowArrays).toContain(world[name]);
        }
    });

    it('re-points the agent rows, so freeing a slot clears the arena bytes', () => {
        const world = smallWorld({ initialAgents: 3 });
        const H = world.layout.hidden;
        world.hidden.fill(0.5, 0, 3 * H);
        world.hidden[world.config.maxAgents * H] = 0.75; // the scratch row is not an agent row
        freeAgent(world, 1);
        expect(world.alive[1]).toBe(0);
        expect(Array.from(world.hidden.subarray(H, 2 * H))).toEqual(new Array(H).fill(0));
        expect(world.hidden[0]).toBe(0.5);
        expect(world.hidden[world.config.maxAgents * H]).toBe(0.75);
        expect(world.weights[world.layout.weightCount]).toBe(0);
    });

    it('refuses a second attach, so no agent row is re-pointed at the wrong array', () => {
        const world = smallWorld({ initialAgents: 3 });
        expect(() => attachWasm(world, kernels)).toThrow(/already runs the WASM kernels/);
        freeAgent(world, 0);
        expect(Array.from(world.alive.subarray(0, 3))).toEqual([0, 1, 1]);
    });

    it('attaches a shallow copy on its own arena, the original untouched', () => {
        const world = smallWorld({ initialAgents: 3 });
        const copy = detachedCopy(world);
        expect(attachWasm(copy, kernels, { midRun: true })).toBe(true);
        const H = world.layout.hidden;
        world.hidden.fill(0.5, 0, 3 * H);
        copy.hidden.fill(0.25, 0, 3 * H);
        freeAgent(copy, 0);
        expect(Array.from(copy.alive.subarray(0, 3))).toEqual([0, 1, 1]);
        expect(Array.from(world.alive.subarray(0, 3))).toEqual([1, 1, 1]);
        expect(copy.hidden[0]).toBe(0);
        expect(copy.hidden[H]).toBe(0.25);
        expect(world.hidden[0]).toBe(0.5);
        expect(copy.agentRows.every((/** @type {any} */ row) => row.array.buffer !== world.wasm.memory.buffer)).toBe(
            true,
        );
    });

    it('refuses a world already hashed or past tick 0, whose hash views would keep reading the old arrays', () => {
        const hashed = detachedCopy(smallWorld());
        hashWorld(hashed);
        expect(() => attachWasm(hashed)).toThrow(/already hashed/);
        expect(() => attachWasm(hashed, kernels, { midRun: true })).toThrow(/already hashed/);
        const running = detachedCopy(smallWorld());
        running.tick = 5;
        expect(() => attachWasm(running)).toThrow(/past tick 0/);
        expect(attachWasm(running, kernels, { midRun: true })).toBe(true);
    });
});
