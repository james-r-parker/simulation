import { describe, expect, it } from 'vitest';
import { runDirectorDry } from '../../scripts/lib/director-dry.mjs';
import { scaleTimeout } from '../../scripts/lib/test-timeout.mjs';
import { noisePolicy, SMALL_CONFIG } from '../worker/helpers/host-harness.js';

describe('runDirectorDry over a longer world', () => {
    it(
        'reads the shortest shot, its cut to its pullback, off the shots that ended',
        () => {
            const r = runDirectorDry({ seed: 3, ticks: 36000, overrides: SMALL_CONFIG, createPolicy: noisePolicy });
            const ended = r.shots.flatMap((s) => (s.holdS === null ? [] : [s.holdS]));
            expect(ended.length).toBeGreaterThan(0);
            expect(r.minShotHoldS).toBe(Math.min(...ended));
            expect(r.minShotHoldS).toBeGreaterThanOrEqual(30);
            expect(
                runDirectorDry({ seed: 3, ticks: 60, overrides: SMALL_CONFIG, createPolicy: noisePolicy }).minShotHoldS,
            ).toBeNull();
        },
        scaleTimeout(60000),
    );
});
