import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createSimLog } from '../js/sim/log.js';
import { planScreen, textHash, ladderText } from '../scripts/lib/train-screen-grid.mjs';
import { reusable, runDir, runScreen } from '../scripts/lib/train-screen-run.mjs';
import { fakeTrain } from './helpers/fake-train.js';

const root = mkdtempSync(join(tmpdir(), 'train-screen-run-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const LADDER = [
    { name: 'one', config: null, generations: 2 },
    { name: 'two', config: null },
];
const plan = (/** @type {Record<string, any>} */ over = {}) =>
    planScreen(
        {
            curriculum: 'l.json',
            offsets: [0, 8, 16],
            generations: 6,
            until: 'two',
            arms: { a: {}, b: {} },
            reference: 'a',
            ...over,
        },
        () => structuredClone(LADDER),
    );

/** @returns {{log: import('../js/sim/log.js').SimLog, records: Record<string, any>[]}} a log that keeps its records */
function keptLog() {
    /** @type {Record<string, any>[]} */
    const records = [];
    return { log: createSimLog((r) => records.push(r), { level: 'info' }), records };
}

describe('runScreen', () => {
    it('writes each arm`s ladder, trains every arm on every offset into <runs>/<arm>/o<offset> and logs each run', async () => {
        const runs = join(root, 'first');
        const train = fakeTrain((offset) => ({ passed: offset === 0 ? 1 : 0 }));
        const { log, records } = keptLog();
        const outcomes = await runScreen(plan(), { runs, slots: 2, log, exec: train.exec });
        expect(outcomes.map((o) => `${o.arm}@${o.offset}:${o.status}`)).toEqual([
            'a@0:ran',
            'b@0:ran',
            'a@8:ran',
            'b@8:ran',
            'a@16:ran',
            'b@16:ran',
        ]);
        expect(JSON.parse(readFileSync(join(runs, 'a', 'ladder.json'), 'utf8'))).toEqual(LADDER);
        expect(existsSync(join(runDir(runs, 'b', 16), 'manifest.json'))).toBe(true);
        expect(train.calls).toHaveLength(6);
        expect(train.calls[0].argv).toEqual(
            expect.arrayContaining(['--workers', '8', '--seed-offset', '0', '--until', 'two']),
        );
        expect(records.filter((r) => r.event === 'TrainScreenRun')).toHaveLength(6);
    });

    it('reuses a finished run of the same ladder, options and offset, and retrains with force or a changed ladder', async () => {
        const runs = join(root, 'reuse');
        const first = fakeTrain(() => ({ passed: 1 }));
        await runScreen(plan(), { runs, slots: 1, log: keptLog().log, exec: first.exec });
        const again = fakeTrain(() => ({ passed: 1 }));
        const { log, records } = keptLog();
        const outcomes = await runScreen(plan(), { runs, slots: 1, log, exec: again.exec });
        expect(outcomes.every((o) => o.status === 'reused' && o.seconds === 0)).toBe(true);
        expect(again.calls).toEqual([]);
        expect(records.every((r) => r.reused === true)).toBe(true);
        const forced = fakeTrain(() => ({ passed: 1 }));
        await runScreen(plan(), { runs, slots: 1, force: true, log: keptLog().log, exec: forced.exec });
        expect(forced.calls).toHaveLength(6);
        const other = fakeTrain(() => ({ passed: 1 }));
        await runScreen(plan({ generations: 7 }), { runs, slots: 1, log: keptLog().log, exec: other.exec });
        expect(other.calls).toHaveLength(6);
        const ladder = fakeTrain(() => ({ passed: 1 }));
        const changed = plan({ generations: 7, arms: { a: { stages: { one: { generations: 3 } } }, b: {} } });
        await runScreen(changed, { runs, slots: 1, log: keptLog().log, exec: ladder.exec });
        expect(ladder.calls.map((c) => c.dir.split('/').slice(-2).join('/')).sort()).toEqual(['a/o0', 'a/o16', 'a/o8']);
    });

    it('counts a stalled run (exit code 3) as a result and a failed run as failed, logging the failure', async () => {
        const runs = join(root, 'exit');
        const train = fakeTrain((offset) => ({ passed: 0, exitCode: offset === 0 ? 3 : offset === 8 ? 1 : 0 }));
        const { log, records } = keptLog();
        const outcomes = await runScreen(plan({ arms: { a: {} }, offsets: [0, 8, 16] }), {
            runs,
            slots: 1,
            log,
            exec: train.exec,
        });
        expect(outcomes.map((o) => [o.status, o.exitCode])).toEqual([
            ['ran', 3],
            ['failed', 1],
            ['ran', 0],
        ]);
        expect(records.find((r) => r.event === 'TrainScreenRunFailed')).toMatchObject({
            arm: 'a',
            offset: 8,
            exitCode: 1,
        });
    });

    it('records a trainer that throws (a failed spawn) as a failed run and carries on', async () => {
        const good = fakeTrain(() => ({ passed: 1 }));
        const exec = async (/** @type {string[]} */ argv, /** @type {string} */ dir) => {
            if (dir.endsWith('o8')) {
                throw new Error('spawn ENOENT');
            }
            return good.exec(argv, dir);
        };
        const { log, records } = keptLog();
        const outcomes = await runScreen(plan({ arms: { a: {} } }), {
            runs: join(root, 'throws'),
            slots: 1,
            log,
            exec,
        });
        expect(outcomes.map((o) => o.status)).toEqual(['ran', 'failed', 'ran']);
        expect(records.find((r) => r.event === 'TrainScreenRunFailed')).toMatchObject({
            offset: 8,
            error: 'spawn ENOENT',
        });
    });

    it('retrains a run whose manifest is not valid JSON, logging it', async () => {
        const runs = join(root, 'corrupt');
        await runScreen(plan({ arms: { a: {} } }), {
            runs,
            slots: 1,
            log: keptLog().log,
            exec: fakeTrain(() => ({ passed: 1 })).exec,
        });
        writeFileSync(join(runDir(runs, 'a', 8), 'manifest.json'), '{"status": "do');
        const again = fakeTrain(() => ({ passed: 1 }));
        const { log, records } = keptLog();
        const outcomes = await runScreen(plan({ arms: { a: {} } }), { runs, slots: 1, log, exec: again.exec });
        expect(outcomes.map((o) => o.status)).toEqual(['reused', 'ran', 'reused']);
        expect(records.find((r) => r.event === 'TrainScreenManifestUnreadable')).toMatchObject({ offset: 8 });
    });

    it('caches the reference arm across different runs directories and never caches other arms', async () => {
        const cache = join(root, 'cache');
        const firstRuns = join(root, 'cache-first');
        const first = fakeTrain(() => ({ passed: 1 }));
        await runScreen(plan(), { runs: firstRuns, slots: 1, cache, log: keptLog().log, exec: first.exec });
        expect(first.calls).toHaveLength(6);

        const secondRuns = join(root, 'cache-second');
        const second = fakeTrain(() => ({ passed: 1 }));
        const { log, records } = keptLog();
        const outcomes = await runScreen(plan(), { runs: secondRuns, slots: 1, cache, log, exec: second.exec });
        expect(second.calls.map((c) => c.dir.split('/').slice(-2).join('/')).sort()).toEqual(['b/o0', 'b/o16', 'b/o8']);
        expect(outcomes.filter((o) => o.arm === 'a').every((o) => o.status === 'reused')).toBe(true);
        expect(outcomes.filter((o) => o.arm === 'b').every((o) => o.status === 'ran')).toBe(true);
        expect(records.filter((r) => r.cached === true)).toHaveLength(3);
        expect(existsSync(join(runDir(secondRuns, 'a', 0), 'manifest.json'))).toBe(true);

        const forced = fakeTrain(() => ({ passed: 1 }));
        await runScreen(plan(), {
            runs: join(root, 'cache-third'),
            slots: 1,
            force: true,
            cache,
            log: keptLog().log,
            exec: forced.exec,
        });
        expect(forced.calls).toHaveLength(6);

        const changed = fakeTrain(() => ({ passed: 1 }));
        await runScreen(plan({ generations: 7 }), {
            runs: join(root, 'cache-fourth'),
            slots: 1,
            cache,
            log: keptLog().log,
            exec: changed.exec,
        });
        expect(changed.calls).toHaveLength(6);
    });

    it('never runs more trainings at once than there are slots', async () => {
        let live = 0;
        let peak = 0;
        const exec = async () => {
            live += 1;
            peak = Math.max(peak, live);
            await new Promise((done) => setTimeout(done, 5));
            live -= 1;
            return 3;
        };
        await runScreen(plan(), { runs: join(root, 'slots'), slots: 3, log: keptLog().log, exec });
        expect(peak).toBe(3);
        await runScreen(plan(), { runs: join(root, 'slots1'), slots: 0, log: keptLog().log, exec });
        expect(peak).toBe(3);
    });
});

describe('reusable', () => {
    const argv = ['--generations', '6', '--seed-offset', '0', '--until', 'two'];

    it('needs a manifest that is not running, with this ladder hash and these options', async () => {
        const dir = join(root, 'reusable');
        mkdirSync(dir, { recursive: true });
        const ladderFile = join(root, 'reusable-ladder.json');
        const text = ladderText(LADDER);
        writeFileSync(ladderFile, text);
        const hash = textHash(text);
        expect(reusable(dir, { hash, argv })).toBe(false);
        await fakeTrain(() => ({ passed: 1 })).exec(['--curriculum', ladderFile, ...argv], dir);
        expect(reusable(dir, { hash, argv })).toBe(true);
        expect(reusable(dir, { hash: 'x', argv })).toBe(false);
        expect(reusable(dir, { hash, argv: [...argv.slice(0, 2), '--seed-offset', '8', '--until', 'two'] })).toBe(
            false,
        );
        expect(reusable(dir, { hash, argv: [...argv, '--ticks', '400'] })).toBe(false);
        const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
        writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ ...manifest, status: 'running' }));
        expect(reusable(dir, { hash, argv })).toBe(false);
    });
});
