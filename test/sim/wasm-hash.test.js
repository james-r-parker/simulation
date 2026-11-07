// The WASM hash build against the recorded reference of the JS `buildHash` it replaced (docs/designs/wasm-kernels.md,
// Phase 4): seeded stepped worlds, the hash after physics and a rebuild on every tick's end state, and seeded fuzz
// worlds, digest for digest. `test/sim/golden.json` keeps guarding `worldHash`.
import { describe, expect, it } from 'vitest';
import { buildHash, createSpatialHash } from '../../js/sim/spatial-hash.js';
import { HASH_CASES, readHashReference, runHashCase, runHashFuzz } from './helpers/hash-reference.js';
import { smallWorld } from './helpers/small-world.js';
import { scaleTimeout } from '../../scripts/lib/test-timeout.mjs';
import { arenaHash, hashShape } from '../../js/sim/wasm-hash.js';

const TIMEOUT_MS = scaleTimeout(60_000);

describe('the WASM hash build against the recorded JS reference', () => {
    const reference = readHashReference();
    for (const c of HASH_CASES) {
        it(
            `reproduces both builds' digests after every tick (${c.name}, ${c.ticks} ticks)`,
            () => {
                expect(runHashCase(c, buildHash)).toEqual(reference.stepped[c.name]);
            },
            TIMEOUT_MS,
        );
    }

    it('reproduces every fuzz world, built through the world hash and through a separate one', () => {
        expect(runHashFuzz(buildHash, (w) => w.hash)).toEqual(reference.fuzz);
        expect(runHashFuzz(buildHash, (w) => createSpatialHash(w.config))).toEqual(reference.fuzz);
    });
});

describe('the arena hash', () => {
    it('is the world hash at birth, over the arena arrays, sized from the config', () => {
        const world = smallWorld();
        const { views } = world.wasm;
        const { cols, rows, capacity } = hashShape(world.config);
        expect(world.hash.cellStart).toBe(views.cellStart);
        expect(world.hash.entries).toBe(views.entries);
        expect(world.hash.boxX).toBe(views.boxX);
        expect(world.hash.boxY).toBe(views.boxY);
        expect(views.cellStart.length).toBe(cols * rows + 1);
        expect(views.entries.length).toBe(capacity);
        expect(world.hash.entryCount).toBe(0);
    });

    it('carries the source hash of a copy over', () => {
        const world = smallWorld({ initialFood: 3 });
        buildHash(world.hash, world);
        const copy = arenaHash(world.wasm, world, world.hash);
        expect(copy.entryCount).toBe(world.hash.entryCount);
        expect(copy.entryCount).toBeGreaterThan(0);
    });

    it('binds a separate hash to the world arrays and keeps its own range scratch', () => {
        const world = smallWorld({ initialFood: 2 });
        const hash = createSpatialHash(world.config);
        const range = hash.range;
        buildHash(hash, world);
        expect(hash.cellStart).toBe(world.hash.cellStart);
        expect(hash.entryCount).toBe(world.hash.entryCount);
        expect(hash.range).toBe(range);
        expect(hash.range).not.toBe(world.hash.range);
    });
});
