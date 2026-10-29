import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { validateReport } from '../js/evo/report.js';
import { pickSeeds, runEval } from '../scripts/eval.mjs';
import { SIMPLE_WORLD } from './helpers/simple-world.js';
import { scaleTimeout } from '../scripts/lib/test-timeout.mjs';

const SMALL = {
    ...SIMPLE_WORLD,
    maxAgents: 60,
    initialAgents: 30,
    minAgents: 10,
    worldWidth: 2000,
    worldHeight: 1000,
};
/** @type {string} */
let dir;

beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'eval-runner-'));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/**
 * @param {string} name output file stem
 * @param {number} workers pool size
 * @returns {ReturnType<typeof runEval>} the run
 */
function run(name, workers) {
    return runEval({
        seeds: 2,
        ticks: 2000,
        policy: 'baseline-v5',
        configOverrides: SMALL,
        out: join(dir, `${name}.json`),
        logDir: join(dir, 'logs'),
        workers,
        sha: 'test',
    });
}

describe('runEval', () => {
    it(
        'writes identical valid reports for 2 workers and 1 worker',
        async () => {
            const [a, b] = [await run('a', 2), await run('b', 1)];
            expect(a.report).toEqual(b.report);
            expect(readFileSync(join(dir, 'a.json'), 'utf8')).toBe(readFileSync(join(dir, 'b.json'), 'utf8'));
            expect(() => validateReport(JSON.parse(readFileSync(join(dir, 'a.json'), 'utf8')))).not.toThrow();
            expect(a.report.seeds).toEqual(pickSeeds(2, 0));
            expect(a.results.map((r) => r.worldHash)).toEqual(b.results.map((r) => r.worldHash));
            expect(a.report.fitnessName).toBe('v5');
        },
        scaleTimeout(60_000),
    );

    it(
        'gives map-elites-v1 identical reports for 1 and 2 workers, with the archive metrics set',
        async () => {
            const go = (/** @type {string} */ name, /** @type {number} */ workers) =>
                runEval({
                    seeds: 2,
                    ticks: 3000,
                    policy: 'map-elites-v1',
                    configOverrides: { ...SMALL, maturityTicks: 100 },
                    out: join(dir, `${name}.json`),
                    logDir: join(dir, 'logs'),
                    workers,
                    sha: 'test',
                });
            const [a, b] = [await go('me1', 1), await go('me2', 2)];
            expect(a.report).toEqual(b.report);
            expect(readFileSync(join(dir, 'me1.json'), 'utf8')).toBe(readFileSync(join(dir, 'me2.json'), 'utf8'));
            for (const name of ['eval.coverage', 'eval.qd_score']) {
                expect(a.report.metrics[name].mean).toBeGreaterThan(0);
            }
        },
        scaleTimeout(60_000),
    );

    it(
        'logs the start, each seed and the finish',
        async () => {
            await run('c', 2);
            const lines = readFileSync(join(dir, 'logs', 'eval-baseline-v5-test-2x2000.jsonl'), 'utf8')
                .trim()
                .split('\n')
                .map((line) => JSON.parse(line));
            expect(lines.map((l) => l.event)).toEqual(['EvalStarted', 'SeedFinished', 'SeedFinished', 'EvalFinished']);
            const report = JSON.parse(readFileSync(join(dir, 'c.json'), 'utf8'));
            expect(lines[0].configHash).toBe(report.configHash);
        },
        scaleTimeout(60_000),
    );

    it(
        'names the run after a non-zero seed offset so it does not overwrite the offset-0 run',
        async () => {
            await runEval({
                seeds: 1,
                ticks: 100,
                seedOffset: 8,
                policy: 'baseline-v5',
                configOverrides: SMALL,
                out: join(dir, 'd.json'),
                logDir: join(dir, 'logs'),
                workers: 1,
                sha: 'test',
            });
            expect(readFileSync(join(dir, 'logs', 'eval-baseline-v5-test-1x100-o8.jsonl'), 'utf8')).toContain(
                'EvalStarted',
            );
        },
        scaleTimeout(60_000),
    );
});
