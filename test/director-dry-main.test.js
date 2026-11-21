// reads: scripts/director-dry.mjs
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const result = {
    seed: 7,
    shots: [{ tick: 5, kind: 'chase', score: 2, resolved: true }],
    chasePrecision: null,
    maxKindShare: 0.5,
    shotsPerHour: 12,
    minShotHoldS: null,
    shares: { chase: 0.5, rest: 0.25 },
};
const runDirectorDry = vi.fn(/** @type {(options: any) => typeof result} */ (() => result));
vi.mock('../scripts/lib/director-dry.mjs', async (importActual) => ({
    .../** @type {any} */ (await importActual()),
    runDirectorDry,
    meetsBars: () => ({ chasePrecision: true, maxKindShare: true, shotsPerHour: true, minShotHoldS: false }),
}));

describe('director-dry as a script', () => {
    const argv = process.argv;
    beforeEach(() => {
        vi.resetModules();
        runDirectorDry.mockClear();
    });
    afterEach(() => {
        process.argv = argv;
        vi.restoreAllMocks();
    });

    /** @param {string[]} args @returns {Promise<string[]>} what was printed */
    async function run(args) {
        process.argv = [argv[0], new URL('../scripts/director-dry.mjs', import.meta.url).pathname, ...args];
        const lines = /** @type {string[]} */ ([]);
        vi.spyOn(console, 'log').mockImplementation((line) => void lines.push(String(line)));
        await import('../scripts/director-dry.mjs');
        return lines;
    }

    it('runs each seed over the ticks with the named policy and prints the readings', async () => {
        const lines = await run(['--seed', '7,8', '--ticks', '100']);
        expect(runDirectorDry).toHaveBeenCalledTimes(2);
        expect(runDirectorDry.mock.calls[0][0]).toMatchObject({ seed: 7, ticks: 100 });
        expect(runDirectorDry.mock.calls[1][0]).toMatchObject({ seed: 8 });
        expect(lines).toHaveLength(2);
        expect(lines[0]).toContain('director.min_shot_hold_s seed=7 n/a');
        expect(lines[0]).toContain('shares seed=7 chase=0.50 rest=0.25');
    });

    it('builds the policy through the registry, and prints JSON with --json', async () => {
        const lines = await run(['--json', '--ticks', '10']);
        const { createPolicy } = /** @type {any} */ (runDirectorDry.mock.calls[0][0]);
        expect(typeof createPolicy).toBe('function');
        expect(JSON.parse(lines[0])).toEqual([result]);
    });
});
