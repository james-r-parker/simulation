// The WASM brain kernel against the recorded reference of the JS kernel it replaced (docs/designs/wasm-kernels.md, T7):
// the same cases, digest for digest. `test/sim/golden.json` (pinned by the JS kernel) keeps guarding `worldHash`
// through test/sim/golden.test.js and golden.slow.test.js, which now run the kernel.
import { describe, expect, it } from 'vitest';
import { forwardAll } from '../../js/sim/brain.js';
import { poolRays } from '../../js/sim/ray-pool.js';
import { PARAM_ARRAYS, STATUS_SLOT, writeBrainParams } from '../../js/sim/wasm-brain.js';
import { scaleTimeout } from '../../scripts/lib/test-timeout.mjs';
import {
    STEPPED_CASES,
    randomise,
    readReference,
    runSteppedCase,
    runUnitCase,
    unitCases,
} from './helpers/brain-reference.js';
import { smallWorld } from './helpers/small-world.js';

const TIMEOUT_MS = scaleTimeout(60_000);
const reference = readReference();

describe('the WASM brain kernel against the recorded JS reference', () => {
    it('reproduces every per-call digest: three configs, six hidden sizes, four seeds, and the edge-value fuzz', () => {
        const cases = unitCases();
        expect(cases.map((c) => c.key)).toEqual(Object.keys(reference.unit));
        for (const c of cases) {
            expect(runUnitCase(c, forwardAll), c.key).toEqual(reference.unit[c.key]);
        }
    });

    for (const c of STEPPED_CASES) {
        it(
            `reproduces the digest after every tick of a stepped world (${c.name}, ${c.ticks} ticks)`,
            () => {
                expect(runSteppedCase(c)).toEqual(reference.stepped[c.name]);
            },
            TIMEOUT_MS,
        );
    }
});

describe('forwardAll on the kernel', () => {
    it('throws the error detTanh throws on a non-finite sum or learn gene, naming the slot', () => {
        for (const bad of [NaN, Infinity]) {
            for (const at of ['bHidden', 'bOut', 'traitStart']) {
                const world = smallWorld({ hebbianRate: 0.05 });
                randomise(world, 9, { slots: [2, 5] });
                world.weights[5 * world.layout.weightCount + world.layout[at] + (at === 'traitStart' ? 3 : 0)] = bad;
                expect(() => forwardAll(world)).toThrow(/^detTanh: expected a finite x/);
                expect(world.wasm.views.params[STATUS_SLOT]).toBe(5);
            }
        }
    });

    it('fails loudly on a world without an arena', () => {
        /** @type {Record<string, any>} */
        const copy = { ...smallWorld() };
        delete copy.wasm;
        expect(() => forwardAll(copy)).toThrow(/no WASM arena/);
    });

    it('pools one slot with poolRays exactly as the brain phase pools it', () => {
        const a = smallWorld({ brainHidden: 7 });
        const b = smallWorld({ brainHidden: 7 });
        randomise(a, 4, { slots: [1, 6] });
        randomise(b, 4, { slots: [1, 6] });
        forwardAll(a);
        poolRays(b, 1);
        poolRays(b, 6);
        expect(Array.from(b.pooled)).toEqual(Array.from(a.pooled));
    });
});

describe('writeBrainParams', () => {
    it('refuses a layout without exactly one gene-less output', () => {
        const world = smallWorld();
        const layout = { ...world.layout, outputCount: world.layout.geneOutputs + 2 };
        expect(() => writeBrainParams(world.wasm, world.config, layout)).toThrow(/one gene-less output/);
    });

    it('writes every array offset into the parameter block', () => {
        const world = smallWorld();
        const { params } = world.wasm.views;
        expect(PARAM_ARRAYS.map((_, i) => params[i])).toEqual(PARAM_ARRAYS.map((n) => world.wasm.offsets[n]));
    });
});
