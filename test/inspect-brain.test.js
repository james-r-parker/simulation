import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createConfig } from '../js/sim/config.js';
import { makeChampionFileFor } from './evo/helpers/champion-file.js';
import { parseArgs, runInspect } from '../scripts/inspect-brain.mjs';

const roots = [];

function fixture() {
    const root = mkdtempSync(join(tmpdir(), 'inspect-brain-'));
    roots.push(root);
    const champions = join(root, 'champions');
    const configPath = join(root, 'config.json');
    const config = createConfig({ brainHidden: 2 });
    mkdir(champions);
    writeFileSync(configPath, JSON.stringify({ brainHidden: 2 }));
    writeFileSync(join(champions, 'a.json'), JSON.stringify(makeChampionFileFor(config, 'forager-a', 1)));
    writeFileSync(join(champions, 'b.json'), JSON.stringify(makeChampionFileFor(config, 'forager-b', 2)));
    return { root, champions, configPath };
}

function args({ champions, configPath, out, name = 'forager-a', workers = 1, edit = null }) {
    const argv = [
        '--champions',
        champions,
        '--name',
        name,
        '--drill',
        'food-ahead',
        '--out',
        out,
        '--seed',
        '9',
        '--trials',
        '2',
        '--trace-trials',
        '1',
        '--config',
        configPath,
        '--workers',
        String(workers),
    ];
    if (edit !== null) {
        argv.push('--edit', edit);
    }
    return parseArgs(argv);
}

afterEach(() => {
    for (const root of roots.splice(0)) {
        rmSync(root, { recursive: true, force: true });
    }
});

describe('parseArgs', () => {
    it('sets the dossier defaults and rejects a worker count above four', async () => {
        expect(parseArgs(['--champions', 'c', '--drill', 'food-ahead', '--out', 'o'])).toMatchObject({
            seed: 1,
            trials: 32,
            traceTrials: 4,
            top: 8,
            workers: 4,
        });
        const data = fixture();
        await expect(
            runInspect(args({ ...data, out: join(data.root, 'out'), workers: 5 }), { logDir: join(data.root, 'logs') }),
        ).rejects.toThrow(/at most 4/);
    });
});

describe('runInspect', () => {
    it('selects a named champion, writes the four dossier files and is deterministic across worker counts', async () => {
        const data = fixture();
        const out1 = join(data.root, 'one');
        const out4 = join(data.root, 'four');
        const logDir = join(data.root, 'logs');
        await runInspect(args({ ...data, out: out1, workers: 1 }), { logDir });
        await runInspect(args({ ...data, out: out4, workers: 4 }), { logDir });

        const names = ['ablation.md', 'summary.md', 'trace-0.jsonl', 'weights.md'];
        expect(readdirSync(out1).sort()).toEqual(names);
        expect(readdirSync(out4).sort()).toEqual(names);
        for (const name of names) {
            expect(readFileSync(join(out4, name), 'utf8')).toBe(readFileSync(join(out1, name), 'utf8'));
        }
        expect(readFileSync(join(out1, 'weights.md'), 'utf8')).toContain('# Weights: forager-a');
        const tick = JSON.parse(readFileSync(join(out1, 'trace-0.jsonl'), 'utf8').split('\n')[0]);
        expect(tick).toHaveProperty('inputs');
        expect(tick).toHaveProperty('hidden');
        expect(tick).toHaveProperty('outputs.split');
        expect(tick).not.toHaveProperty('weights');
    });

    it('writes edit.md with a paired comparison without writing an edited weight row', async () => {
        const data = fixture();
        const out = join(data.root, 'edited');
        const edit = join(data.root, 'edit.json');
        writeFileSync(edit, JSON.stringify([{ op: 'scale', block: 'wOut', row: 0, factor: 0 }]));
        await runInspect(args({ ...data, out, edit }), { logDir: join(data.root, 'logs') });

        const report = readFileSync(join(out, 'edit.md'), 'utf8');
        expect(report).toContain('McNemar p');
        expect(readdirSync(out).filter((name) => name.endsWith('.json'))).toEqual([]);
        expect(report).not.toContain('weights');
    });

    it('rejects an unknown name and logs the available champions', async () => {
        const data = fixture();
        const logDir = join(data.root, 'logs');
        await expect(
            runInspect(args({ ...data, out: join(data.root, 'bad'), name: 'missing' }), { logDir }),
        ).rejects.toThrow(/forager-a, forager-b/);
        const event = readFileSync(join(logDir, 'inspect-9x2.jsonl'), 'utf8')
            .split('\n')
            .map((line) => line && JSON.parse(line))
            .find((row) => row.event === 'InspectNameUnknown');
        expect(event.names).toEqual(['forager-a', 'forager-b']);
    });
});

function mkdir(path) {
    mkdirSync(path, { recursive: true });
}
