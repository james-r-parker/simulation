// The WASM pheromone update against the recorded reference of the JS grid loops it replaced (docs/designs/wasm-kernels.md,
// Phase 4): seeded stepped worlds digest for digest after every tick, and seeded fuzz grids of every shape from 1 x 1
// after every update. `test/sim/golden.json` keeps guarding `worldHash`.
import { describe, expect, it } from 'vitest';
import { updatePheromones } from '../../js/sim/pheromones.js';
import { FIELD_FIELDS } from '../../js/sim/wasm-field.js';
import { scaleTimeout } from '../../scripts/lib/test-timeout.mjs';
import { FIELD_CASES, readFieldReference, runFieldCase, runFieldFuzz } from './helpers/field-reference.js';
import { smallWorld } from './helpers/small-world.js';

const TIMEOUT_MS = scaleTimeout(60_000);

describe('the WASM pheromone update against the recorded JS reference', () => {
    const reference = readFieldReference();
    for (const c of FIELD_CASES) {
        it(
            `reproduces the grids' digest after every tick (${c.name}, ${c.ticks} ticks)`,
            () => {
                expect(runFieldCase(c)).toEqual(reference.stepped[c.name]);
            },
            TIMEOUT_MS,
        );
    }

    it('reproduces every fuzz grid after every update', () => {
        expect(runFieldFuzz(updatePheromones)).toEqual(reference.fuzz);
    });
});

describe('the field arena', () => {
    it('holds the grids and the scratch, so a deposit in JS is what the kernel decays', () => {
        const world = smallWorld({ pheromoneDecay: 0.5, pheromoneDiffusion: 0 });
        for (const name of FIELD_FIELDS) {
            expect(world[name].buffer).toBe(world.wasm.memory.buffer);
        }
        world.danger[3] = 2;
        updatePheromones(world);
        expect(world.danger[3]).toBe(1);
    });
});
