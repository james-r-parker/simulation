// The WASM sense kernel against the recorded reference of the JS ray march it replaced (docs/designs/wasm-kernels.md,
// T11): seeded stepped worlds, every alive agent cast after every tick, digest for digest. While the port was proven the
// JS and the kernel were also compared cast for cast, byte for byte; `test/sim/golden.json` keeps guarding `worldHash`.
import { describe, expect, it } from 'vitest';
import { castRays } from '../../js/sim/ray-march.js';
import { createSpatialHash } from '../../js/sim/spatial-hash.js';
import { beginSense } from '../../js/sim/wasm-sense.js';
import { scaleTimeout } from '../../scripts/lib/test-timeout.mjs';
import { SENSE_CASES, readSenseReference, runSenseCase } from './helpers/sense-reference.js';
import { smallWorld } from './helpers/small-world.js';

const TIMEOUT_MS = scaleTimeout(60_000);

describe('beginSense', () => {
    it("refuses a hash that does not read the world's arena arrays", () => {
        const world = smallWorld();
        expect(() => beginSense(world, createSpatialHash(world.config))).toThrow(/not the world's own/);
        expect(() => beginSense(world, world.hash)).not.toThrow();
    });
});

describe('the WASM sense kernel against the recorded JS reference', () => {
    const reference = readSenseReference();
    for (const c of SENSE_CASES) {
        it(
            `reproduces the digest after every tick (${c.name}, ${c.ticks} ticks)`,
            () => {
                expect(runSenseCase(c, castRays)).toEqual(reference.stepped[c.name]);
            },
            TIMEOUT_MS,
        );
    }
});
