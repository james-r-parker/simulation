import { describe, expect, it } from 'vitest';
import { arenaConfig } from '../../js/evo/chase-arena.js';
import { playCell } from '../../js/evo/chase-envelope.js';
import { scaleTimeout } from '../../scripts/lib/test-timeout.mjs';

const PREDATOR = 1;
const FORAGER = 0;
const AHEAD = 0;
const PLAY = { trials: 3, seed: 1, sprint: true, straight: true };
const TIMEOUT = scaleTimeout(60_000);

describe('the catch share of a straight runner', () => {
    it(
        'is 1 at every start distance when the pursuer is faster',
        () => {
            const config = arenaConfig({ specialisations: { predator: { sprintBoost: 2 } } });
            for (const share of [0.4, 0.8]) {
                const cell = playCell(config, { pursuer: PREDATOR, evader: FORAGER, share, bearing: AHEAD }, PLAY);
                expect(cell.share, `at ${share} of view`).toBe(1);
            }
        },
        TIMEOUT,
    );

    it(
        'is 0 when the pursuer is no faster',
        () => {
            const pair = { pursuer: PREDATOR, evader: PREDATOR, share: 0.6, bearing: AHEAD };
            expect(playCell(arenaConfig(), pair, PLAY).share).toBe(0);
        },
        TIMEOUT,
    );

    it(
        'replays from its seed, and a caught trial reports what the kill cost and returned',
        () => {
            const pair = { pursuer: PREDATOR, evader: FORAGER, share: 0.2, bearing: AHEAD };
            const a = playCell(arenaConfig(), pair, PLAY);
            expect(playCell(arenaConfig(), pair, PLAY)).toEqual(a);
            expect(a.share).toBe(1);
            expect(a.spent).toBeGreaterThan(0);
            expect(a.returned).toBeGreaterThan(a.spent / a.caught);
        },
        TIMEOUT,
    );
});
