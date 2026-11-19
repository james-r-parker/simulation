import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { codeHash, liveName, readings, runNode, worldTrial, WORLD_METRICS } from '../scripts/lib/train-tune-world.mjs';

const root = mkdtempSync(join(tmpdir(), 'train-tune-world-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const row = (/** @type {string} */ metric, before = 1, after = 2) => ({
    metric,
    before,
    after,
    effect: after / before - 1,
    verdict: 'better',
});

describe('readings', () => {
    it('reads the three world metrics from the compare rows and marks a missing one', () => {
        const out = readings({ rows: [row(WORLD_METRICS[0]), row('other'), row(WORLD_METRICS[2], 2, 1)] });
        expect(out[WORLD_METRICS[0]]).toEqual({ before: 1, after: 2, effect: 1, verdict: 'better' });
        expect(out[WORLD_METRICS[1]]).toEqual({ before: null, after: null, effect: null, verdict: 'missing' });
        expect(out[WORLD_METRICS[2]].effect).toBe(-0.5);
        expect(readings({})[WORLD_METRICS[0]].verdict).toBe('missing');
    });
});

describe('liveName', () => {
    it('is keyed by seeds, ticks and the default config hash', () => {
        expect(liveName({ seeds: 16, ticks: 1000 })).toMatch(/^live-16x1000-[0-9a-f]{16}-[0-9a-f]{16}\.json$/);
        expect(liveName({ seeds: 16, ticks: 1000 })).not.toBe(liveName({ seeds: 8, ticks: 1000 }));
    });
});

describe('codeHash', () => {
    const tree = (/** @type {string} */ name, /** @type {string} */ simText) => {
        const dir = join(root, name);
        for (const d of ['js/sim', 'js/evo', 'wasm']) {
            mkdirSync(join(dir, d), { recursive: true });
        }
        writeFileSync(join(dir, 'js/sim/a.js'), simText);
        writeFileSync(join(dir, 'js/evo/b.js'), 'b');
        writeFileSync(join(dir, 'wasm/blob-kernels.wasm.sha256'), 'k');
        return dir;
    };

    it('changes with the sim code and the kernels, and keys the live report so old code does not reuse it', () => {
        const a = codeHash(tree('c1', 'one'));
        expect(a).toMatch(/^[0-9a-f]{16}$/);
        expect(codeHash(tree('c2', 'one'))).toBe(a);
        expect(codeHash(tree('c3', 'two'))).not.toBe(a);
        writeFileSync(join(root, 'c2', 'wasm/blob-kernels.wasm.sha256'), 'k2');
        expect(codeHash(join(root, 'c2'))).not.toBe(a);
        expect(liveName({ seeds: 1, ticks: 1, code: a })).not.toBe(liveName({ seeds: 1, ticks: 1, code: 'x' }));
    });

    it('hashes the repository by default', () => {
        expect(codeHash()).toMatch(/^[0-9a-f]{16}$/);
    });
});

describe('worldTrial', () => {
    /** @returns {{calls: {script: string, argv: string[]}[], run: (script: string, argv: string[]) => Promise<{code: number, stdout: string}>}} a fresh call log and the stub that fills it */
    const recorder = () => {
        /** @type {{script: string, argv: string[]}[]} */
        const calls = [];
        const run = async (/** @type {string} */ script, /** @type {string[]} */ argv) => {
            calls.push({ script, argv });
            if (script === 'eval') {
                writeFileSync(argv[argv.indexOf('--out') + 1], '{}');
            }
            return { code: 0, stdout: JSON.stringify({ rows: WORLD_METRICS.map((m) => row(m)) }) };
        };
        return { calls, run };
    };
    const arms = [
        { name: 'base', championsDir: join(root, 'c', 'base') },
        { name: 'a', championsDir: join(root, 'c', 'a') },
    ];

    it('evals live once and champions-v1 per arm, and compares each arm with live and each finalist with base', async () => {
        const { calls, run } = recorder();
        const options = {
            arms,
            seeds: 4,
            ticks: 100,
            workers: 2,
            dir: join(root, 'n1'),
            liveDir: join(root, 'live1'),
            run,
        };
        const out = await worldTrial(options);
        const evals = calls.filter((c) => c.script === 'eval');
        expect(evals.map((c) => c.argv[1])).toEqual(['live', 'champions-v1', 'champions-v1']);
        expect(evals[1].argv).toEqual(expect.arrayContaining(['--seeds', '4', '--ticks', '100', '--workers', '2']));
        const optionsFile = evals[1].argv[evals[1].argv.indexOf('--policy-options') + 1];
        expect(JSON.parse(readFileSync(optionsFile, 'utf8'))).toEqual({ championsDir: arms[0].championsDir });
        expect(out.base.vsBase).toBeNull();
        expect(out.a.vsLive[WORLD_METRICS[0]].effect).toBe(1);
        expect(out.a.vsBase).not.toBeNull();
        expect(calls.filter((c) => c.script === 'eval-compare')).toHaveLength(3);
    });

    it('reuses the cached live report and omits --workers when none is set; without base there is no vsBase', async () => {
        const { calls, run } = recorder();
        mkdirSync(join(root, 'live2'), { recursive: true });
        writeFileSync(join(root, 'live2', liveName({ seeds: 4, ticks: 100 })), '{}');
        const out = await worldTrial({
            arms: [arms[1]],
            seeds: 4,
            ticks: 100,
            dir: join(root, 'n2'),
            liveDir: join(root, 'live2'),
            run,
        });
        expect(calls.filter((c) => c.script === 'eval').map((c) => c.argv[1])).toEqual(['champions-v1']);
        expect(calls[0].argv).not.toContain('--workers');
        expect(out.a.vsBase).toBeNull();
        expect(existsSync(join(root, 'live2', liveName({ seeds: 4, ticks: 100 })))).toBe(true);
    });

    it('uses 200000 ticks by default', async () => {
        const { calls, run } = recorder();
        await worldTrial({ arms: [], seeds: 2, dir: join(root, 'n3'), liveDir: join(root, 'live3'), run });
        expect(calls[0].argv).toEqual(expect.arrayContaining(['--ticks', '200000']));
    });

    it('fails loudly when an eval or a compare exits non-zero', async () => {
        const { run } = recorder();
        const failEval = async () => ({ code: 3, stdout: '' });
        await expect(
            worldTrial({ arms, seeds: 2, dir: join(root, 'n4'), liveDir: join(root, 'live4'), run: failEval }),
        ).rejects.toThrow('exited 3');
        const failCompare = async (/** @type {string} */ script, /** @type {string[]} */ argv) =>
            script === 'eval' ? run(script, argv) : { code: 2, stdout: '' };
        await expect(
            worldTrial({ arms, seeds: 2, dir: join(root, 'n5'), liveDir: join(root, 'live5'), run: failCompare }),
        ).rejects.toThrow('eval:compare');
    });
});

describe('runNode', () => {
    it('runs a script of scripts/ and returns its exit code and output', async () => {
        const out = await runNode('eval-compare', []);
        expect(out.code).toBe(2);
        expect(out.stdout).toBe('');
    });
});
