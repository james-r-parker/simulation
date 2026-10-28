import { describe, expect, it } from 'vitest';
import { STARTING_PREDATORS, sample } from './helpers/predator-rescue-world.js';
import { scaleTimeout } from '../../scripts/lib/test-timeout.mjs';

const TIMEOUT_MS = scaleTimeout(60_000);

describe('the predator rescue in a world of non-predators', () => {
    it(
        'keeps a predator alive in at least 90% of samples with predatorRescueMin 1',
        () => {
            const counts = sample({ predatorRescueMin: 1, predatorRescueInterval: 300 });
            const present = counts.filter((n) => n > 0).length / counts.length;
            expect(present).toBeGreaterThanOrEqual(0.9);
        },
        TIMEOUT_MS,
    );

    it(
        'has no predator once the starting predators starve with predatorRescueMin 0',
        () => {
            const counts = sample({ predatorRescueMin: 0 });
            expect(counts[0]).toBe(STARTING_PREDATORS);
            expect(counts.slice(-20)).toEqual(new Array(20).fill(0));
        },
        TIMEOUT_MS,
    );
});
