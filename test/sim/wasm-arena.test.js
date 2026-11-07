import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { brainLayout } from '../../js/sim/brain-layout.js';
import { createConfig } from '../../js/sim/config.js';
import { detTanh } from '../../js/sim/det-math.js';
import { freeAgent } from '../../js/sim/world.js';
import { hashWorld } from '../../js/sim/world-hash.js';
import {
    ALIGN,
    MAX_PAGES,
    WORLD_FIELDS,
    WasmArenaError,
    arenaSpecs,
    attachWasm,
    createArena,
    layoutArena,
} from '../../js/sim/wasm-arena.js';
import { loadKernels } from '../../js/sim/wasm-loader.js';
import { smallWorld } from './helpers/small-world.js';

const kernels = loadKernels(readFileSync(new URL('../../wasm/blob-kernels.wasm', import.meta.url)));
const module = kernels.ok ? kernels.module : /** @type {never} */ (null);

/**
 * @returns {{ records: any[], log: { log: (level: string, event: string, fields: object) => void } }} a log that keeps
 *   its records
 */
function recordingLog() {
    /** @type {any[]} */
    const records = [];
    return { records, log: { log: (level, event, fields) => records.push({ level, event, ...fields }) } };
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
        expect(WORLD_FIELDS.every((name) => name in length)).toBe(true);
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

    it('requests the whole memory up front and cannot grow', () => {
        const arena = createArena(module, world.config, world.layout);
        const pages = arena.memory.buffer.byteLength / 65536;
        expect(() => arena.memory.grow(1)).toThrow(RangeError);
        expect(arena.memory.buffer.byteLength / 65536).toBe(pages);
    });

    it('gives views that share their bytes with the kernel', () => {
        const arena = createArena(module, world.config, world.layout);
        arena.views.scratch.set([0.25, -3, 0]);
        expect(arena.exports.tanh_into(arena.offsets.scratch, 3)).toBe(0);
        expect(Array.from(arena.views.scratch.subarray(0, 3))).toEqual([detTanh(0.25), detTanh(-3), 0]);
    });

    it('throws a memory error past the page limit', () => {
        const huge = { ...world.config, maxAgents: 1e6 };
        const layout = brainLayout({ ...world.config, brainHidden: 64 });
        expect(() => createArena(module, huge, layout)).toThrow(WasmArenaError);
        try {
            createArena(module, huge, layout);
        } catch (error) {
            expect(/** @type {WasmArenaError} */ (error).reason).toBe('memory');
            expect(String(error)).toContain(`the limit is ${MAX_PAGES}`);
        }
    });
});

describe('attachWasm', () => {
    it('changes nothing with the switch off', () => {
        const world = smallWorld();
        const weights = world.weights;
        expect(attachWasm(world, kernels)).toBe(false);
        expect(attachWasm(world, kernels, { wasmKernels: false })).toBe(false);
        expect(world.weights).toBe(weights);
        expect(world.wasm).toBeUndefined();
    });

    it('moves every hot array into the arena with its contents, and the world hash does not move', () => {
        const world = smallWorld({ initialAgents: 5 });
        const before = hashWorld(world);
        const copies = Object.fromEntries(WORLD_FIELDS.map((name) => [name, world[name].slice()]));
        expect(attachWasm(world, kernels, { wasmKernels: true })).toBe(true);
        for (const name of WORLD_FIELDS) {
            expect(world[name].buffer).toBe(world.wasm.memory.buffer);
            expect(world[name]).toEqual(copies[name]);
        }
        expect(hashWorld(world)).toBe(before);
    });

    it('re-points the agent rows, so freeing a slot clears the arena bytes', () => {
        const world = smallWorld({ initialAgents: 3 });
        attachWasm(world, kernels, { wasmKernels: true });
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
        attachWasm(world, kernels, { wasmKernels: true });
        expect(() => attachWasm(world, kernels, { wasmKernels: true })).toThrow(/already runs the WASM kernels/);
        freeAgent(world, 0);
        expect(Array.from(world.alive.subarray(0, 3))).toEqual([0, 1, 1]);
    });

    it('attaches a shallow copy of an attached world on its own arena, the original untouched', () => {
        const world = smallWorld({ initialAgents: 3 });
        attachWasm(world, kernels, { wasmKernels: true });
        /** @type {Record<string, any>} */
        const copy = { ...world, agentRows: world.agentRows.map((/** @type {any} */ row) => ({ ...row })) };
        delete copy.wasm;
        expect(attachWasm(copy, kernels, { wasmKernels: true })).toBe(true);
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

    it('falls back with one WasmFallback warning when the binary is missing or the arena too big', () => {
        const world = smallWorld();
        const { records, log } = recordingLog();
        expect(attachWasm(world, loadKernels(null), { wasmKernels: true, log })).toBe(false);
        expect(records).toEqual([
            { level: 'warn', event: 'WasmFallback', reason: 'missing', detail: 'no kernel bytes' },
        ]);
        const big = smallWorld();
        big.config = { ...big.config, maxAgents: 1e6 };
        big.layout = brainLayout({ ...big.config, brainHidden: 64 });
        expect(attachWasm(big, kernels, { wasmKernels: true, log })).toBe(false);
        expect(records[1]).toMatchObject({ event: 'WasmFallback', reason: 'memory' });
        expect(world.wasm).toBeUndefined();
    });
});
