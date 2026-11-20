// A stand-in for `scripts/train.mjs` in the ladder screen's tests: writes the `manifest.json` and `curve.jsonl` a real run
// would, with the stages the test says the run passed.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from '../../scripts/lib/train-args.mjs';
import { seedListHash } from '../../scripts/lib/train-manifest.mjs';

/**
 * @param {(offset: number, arm: string) => {passed: number, exitCode?: number}} outcome how far the run at an offset got
 *   (stages passed) and its exit code (default 0)
 * @returns {{exec: (argv: string[], dir: string) => Promise<number>, calls: {argv: string[], dir: string}[]}} the stand-in
 *   trainer and the calls it has taken
 */
export function fakeTrain(outcome) {
    /** @type {{argv: string[], dir: string}[]} */
    const calls = [];
    const exec = async (/** @type {string[]} */ argv, /** @type {string} */ dir) => {
        calls.push({ argv, dir });
        const args = parseArgs([...argv, '--out', dir]);
        const file = /** @type {string} */ (args.curriculum);
        const ladder = JSON.parse(readFileSync(file, 'utf8'));
        const arm = file.split('/').at(-2) ?? '';
        const { passed, exitCode = 0 } = outcome(args.seedOffset, arm);
        const ran = ladder.slice(0, Math.min(ladder.length, passed + 1));
        const manifest = {
            status: exitCode === 3 || passed < ran.length ? 'stalled' : 'done',
            curriculum: { file, hash: createHash('sha256').update(readFileSync(file)).digest('hex') },
            options: {
                generations: args.generations,
                episodes: args.episodes,
                seedOffset: args.seedOffset,
                until: args.until,
                resume: null,
                ticks: args.ticks ?? null,
                offerFrom: args.offerFrom ?? null,
                checkpointEvery: args.checkpointEvery,
                seedListHash: seedListHash(),
            },
            stages: ran.map((/** @type {{name: string}} */ s, /** @type {number} */ i) => ({
                name: s.name,
                generations: 10,
                ...(i < passed ? { passedAt: 10 * (i + 1) } : {}),
            })),
        };
        writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest));
        const stage = ran[ran.length - 1].name;
        const rows = [
            { stage, cpuSeconds: 100 + 10 * passed, bestProgress: 0.4, workers: 8, cpuShare: 0.5, wallSeconds: 50 },
        ];
        writeFileSync(join(dir, 'curve.jsonl'), rows.map((r) => `${JSON.stringify(r)}\n`).join(''));
        return exitCode;
    };
    return { exec, calls };
}
