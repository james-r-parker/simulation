import { describe, expect, it } from 'vitest';
import { formatProfile, profileTimings } from '../scripts/lib/train-profile.mjs';
import { parseArgs } from '../scripts/train-profile.mjs';

/**
 * @param {string} stage the stage
 * @param {number[]} seconds episode, checkpoint and write seconds
 * @param {number} [busySeconds] pool seconds inside episodes
 * @returns {Record<string, any>} a `TrainTiming` record on 4 workers
 */
const timing = (stage, [episodeSeconds, checkpointSeconds, saveSeconds], busySeconds = 0) => ({
    event: 'TrainTiming',
    generation: 0,
    stage,
    workers: 4,
    busySeconds,
    episodeSeconds,
    checkpointSeconds,
    saveSeconds,
});

describe('profileTimings', () => {
    it('shares each stage`s wall time between episodes, checkpoints and writes, and prices the busy share', () => {
        const records = [
            { event: 'TrainStage', stage: 'a' },
            timing('a', [8, 1, 1], 16),
            timing('a', [8, 1, 1], 16),
            timing('b', [5, 4, 1], 10),
            { event: 'TrainGeneration', stage: 'b' },
        ];
        const { workers, rows } = profileTimings(records);
        expect(workers).toBe(4);
        expect(rows.map((r) => r.stage)).toEqual(['a', 'b', 'all']);
        expect(rows[0]).toMatchObject({ generations: 2, wallSeconds: 20 });
        expect(rows[0].episodeShare).toBeCloseTo(0.8, 12);
        expect(rows[0].checkpointShare).toBeCloseTo(0.1, 12);
        expect(rows[0].saveShare).toBeCloseTo(0.1, 12);
        expect(rows[0].busyEpisodes).toBeCloseTo(32 / (4 * 16), 12);
        expect(rows[0].busyWall).toBeCloseTo(32 / (4 * 20), 12);
        expect(rows[1].checkpointShare).toBeCloseTo(0.4, 12);
        expect(rows[2]).toMatchObject({ generations: 3, wallSeconds: 30 });
        expect(rows[2].episodeShare + rows[2].checkpointShare + rows[2].saveShare).toBeCloseTo(1, 12);
    });

    it('reads no rows from a log without a TrainTiming record', () => {
        expect(profileTimings([{ event: 'TrainGeneration' }])).toEqual({ workers: 0, rows: [] });
        expect(formatProfile({ workers: 0, rows: [] })).toEqual([
            'no TrainTiming records: the run logged no generation',
        ]);
    });

    it('survives a zero-second run', () => {
        const [row] = profileTimings([timing('a', [0, 0, 0])]).rows;
        expect(row).toMatchObject({ episodeShare: 0, busyEpisodes: 0, busyWall: 0 });
    });
});

describe('formatProfile', () => {
    it('prints a header, a line per stage and the whole run', () => {
        const lines = formatProfile(profileTimings([timing('a', [8, 1, 1], 20), timing('b', [2, 0, 0], 4)]));
        expect(lines[0]).toBe('workers 4');
        expect(lines[1]).toMatch(/stage\s+gens\s+wall s\s+episodes\s+checkpoints\s+writes\s+busy in episodes/);
        expect(lines[2]).toMatch(/^a\s+1\s+10\.0\s+80\.0%\s+10\.0%\s+10\.0%\s+62\.5%\s+50\.0%/);
        expect(lines[4]).toMatch(/^all\s+2\s+12\.0/);
    });
});

describe('parseArgs', () => {
    it('reads the train options and defaults --out under .sim/train-profile', () => {
        const { from, train } = parseArgs(['--curriculum', 'test/fixtures/train-ladder.json', '--generations', '20']);
        expect(from).toBeNull();
        expect(train).toMatchObject({ generations: 20, episodes: 32, curriculum: 'test/fixtures/train-ladder.json' });
        expect(train?.out).toBe('.sim/train-profile/train-ladder-g20');
        expect(parseArgs(['--generations', '2', '--out', 'x']).train?.out).toBe('x');
    });

    it('takes --from alone and refuses a missing --generations', () => {
        expect(parseArgs(['--from', 'run'])).toEqual({ from: 'run', train: null });
        expect(() => parseArgs(['--from', 'run', '--workers', '2'])).toThrow(/--from/);
        expect(() => parseArgs(['--workers', '2'])).toThrow(/--generations is required/);
    });
});
