import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createConfig } from '../js/sim/config.js';
import { makeChampionFileFor } from './evo/helpers/champion-file.js';
import { parseArgs } from '../scripts/lib/inspect-brain-args.mjs';
import { main, runInspect } from '../scripts/inspect-brain.mjs';
import { writeDossier } from '../scripts/lib/brain-inspection-report.mjs';

/** @type {string[]} */
const roots = [];

/**
 * @returns {{root: string, champions: string, configPath: string}} an isolated champion fixture
 */
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

/**
 * @param {{champions: string, configPath: string, out: string, name?: string, workers?: number, edit?: string | null}} options
 * @returns {Record<string, any>} parsed CLI arguments
 */
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
    it('formats empty weight lists and non-finite summary values deterministically', () => {
        const data = fixture();
        const out = join(data.root, 'formatted');
        writeDossier(
            {
                subject: { name: 'fixture' },
                drill: 'empty',
                trials: 1,
                seed: 1,
                units: [],
                skip: [{ label: 'thrust', bias: Number.NaN, weights: [] }],
                traits: {},
                traces: [
                    {
                        trial: 0,
                        won: false,
                        summary: {
                            ticks: 1,
                            hidden: [
                                {
                                    unit: 'h0',
                                    mean: Number.NaN,
                                    min: Number.NaN,
                                    max: Number.NaN,
                                    largestChangeTick: null,
                                },
                            ],
                            outputs: [],
                            inputs: [],
                        },
                        trace: {
                            ticks: 0,
                            alive: new Uint8Array(0),
                            pooled: new Float32Array(0),
                            hidden: new Float32Array(0),
                            outputs: new Float32Array(0),
                            x: new Float32Array(0),
                            y: new Float32Array(0),
                            heading: new Float32Array(0),
                            energy: new Float64Array(0),
                        },
                    },
                ],
                ablations: [],
                labels: { inputs: [], outputs: [], units: [] },
                edit: null,
            },
            out,
        );
        expect(readFileSync(join(out, 'weights.md'), 'utf8')).toContain('thrust | NaN | -');
        expect(readFileSync(join(out, 'summary.md'), 'utf8')).toContain('h0 | NaN | NaN | NaN');
    });

    it('checks required options and trace counts before creating a log', async () => {
        const data = fixture();
        const base = args({ ...data, out: join(data.root, 'out') });
        for (const key of ['champions', 'drill', 'out']) {
            await expect(runInspect({ ...base, [key]: null }, { logDir: join(data.root, 'logs') })).rejects.toThrow(
                `missing --${key}`,
            );
        }
        await expect(runInspect({ ...base, traceTrials: 3 }, { logDir: join(data.root, 'logs') })).rejects.toThrow(
            /trace-trials must be no greater/,
        );
    });

    it('rejects an unknown drill and malformed edits', async () => {
        const data = fixture();
        const logDir = join(data.root, 'logs');
        await expect(
            runInspect({ ...args({ ...data, out: join(data.root, 'bad-drill') }), drill: 'missing' }, { logDir }),
        ).rejects.toThrow(/unknown drill/);

        const edit = join(data.root, 'invalid-edit.json');
        writeFileSync(edit, JSON.stringify([{ op: 'replace' }]));
        await expect(runInspect(args({ ...data, out: join(data.root, 'bad-edit'), edit }), { logDir })).rejects.toThrow(
            /expected op silence, set or scale/,
        );
        expect(readFileSync(join(logDir, 'inspect-9x2.jsonl'), 'utf8')).toContain('InspectEditInvalid');

        writeFileSync(edit, '{}');
        await expect(
            runInspect(args({ ...data, out: join(data.root, 'bad-edit-array'), edit }), { logDir }),
        ).rejects.toThrow(/expected a JSON array/);
    });

    it('rejects a champion whose specialisation does not match the drill', async () => {
        const data = fixture();
        const champion = join(data.champions, 'hunter.json');
        writeFileSync(
            champion,
            JSON.stringify(makeChampionFileFor(createConfig({ brainHidden: 2 }), 'hunter', 4, { specialisation: 1 })),
        );
        await expect(
            runInspect(args({ ...data, out: join(data.root, 'wrong-specialisation'), name: 'hunter' }), {
                logDir: join(data.root, 'logs'),
            }),
        ).rejects.toThrow(/requires 0/);
    });

    it('selects a named champion, writes the four dossier files and is deterministic across worker counts', async () => {
        const data = fixture();
        const out1 = join(data.root, 'one');
        const out4 = join(data.root, 'four');
        const logDir = join(data.root, 'logs');
        mkdir(out1);
        writeFileSync(join(out1, 'trace-99.jsonl'), 'stale\n');
        writeFileSync(join(out1, 'edit.md'), 'stale\n');
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

    it('uses the only champion when no name is required and the CLI wrapper returns its exit code', async () => {
        const data = fixture();
        const single = join(data.root, 'single');
        mkdir(single);
        writeFileSync(
            join(single, 'only.json'),
            JSON.stringify(makeChampionFileFor(createConfig({ brainHidden: 2 }), 'only', 3)),
        );
        const command = parseArgs(['--champions', single, '--drill', 'food-ahead', '--out', join(data.root, 'cli')]);
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});

        await expect(
            main([
                '--champions',
                single,
                '--drill',
                'food-ahead',
                '--out',
                command.out,
                '--config',
                data.configPath,
                '--trials',
                '1',
                '--trace-trials',
                '1',
            ]),
        ).resolves.toBe(0);
        expect(log).toHaveBeenCalledWith(`Wrote brain inspection dossier to ${command.out}`);
        log.mockRestore();
        expect(await main(['--unknown'])).toBe(1);
    });

    it('writes edit.md with a paired comparison without writing an edited weight row', async () => {
        const data = fixture();
        const out = join(data.root, 'edited');
        const edit = join(data.root, 'edit.json');
        mkdir(out);
        writeFileSync(join(out, 'edit.md'), 'stale\n');
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
            .map((/** @type {string} */ line) => line && JSON.parse(line))
            .find((/** @type {any} */ row) => row.event === 'InspectNameUnknown');
        expect(event.names).toEqual(['forager-a', 'forager-b']);
    });
});

function mkdir(/** @type {string} */ path) {
    mkdirSync(path, { recursive: true });
}
