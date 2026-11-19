import { describe, expect, it } from 'vitest';
import { createArchive, offer } from '../js/evo/archive.js';
import { brainLayout } from '../js/sim/brain-layout.js';
import { createConfig } from '../js/sim/config.js';
import { eliteSubjects } from '../scripts/lib/drill-subjects.mjs';
import { keeperReadings, toKept } from '../scripts/lib/train-keepers.mjs';
import { scaleTimeout } from '../scripts/lib/test-timeout.mjs';

const log = /** @type {any} */ ({ log() {} });

describe('keeperReadings', () => {
    it(
        'reads the kept passers on the stage drills, the same at one worker and at two',
        async () => {
            const archive = createArchive(brainLayout(createConfig({})));
            const row = new Float32Array(archive.layout.weightCount).fill(0.05);
            offer(archive, { spec: 0, cell: 2, row, sigma: 0.1, id: 7, fitness: 1 });
            const keepers = { nursery: toKept(eliteSubjects(archive)) };
            const stages = [{ name: 'nursery', gate: [{ read: 'drill.food-ahead.edgeLow' }] }, { name: 'next' }];
            const at = { stages, seed: 101, trials: 4, log };
            const one = await keeperReadings(keepers, { ...at, workers: 1 });
            const two = await keeperReadings(keepers, { ...at, workers: 2 });
            expect(Object.keys(one)).toEqual(['nursery']);
            expect(Object.keys(one.nursery)).toEqual(['food-ahead']);
            expect(typeof one.nursery['food-ahead'].edgeLow).toBe('number');
            expect(two).toEqual(one);
        },
        scaleTimeout(120000),
    );
});
