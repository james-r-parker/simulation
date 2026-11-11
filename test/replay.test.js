import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { LIVE_POLICY } from '../js/evo/policies/index.js';
import { configHash, createConfig } from '../js/sim/config.js';
import { createWorld } from '../js/sim/spawn.js';
import { cloneWithNoisePolicy } from '../js/sim/birth-policy.js';
import { dumpWorld, main, parseArgs, runIdFor, runReplay } from '../scripts/replay.mjs';
import { scaleTimeout } from '../scripts/lib/test-timeout.mjs';

const CONFIG = { initialAgents: 20, minAgents: 20, maxAgents: 40 };

describe('parseArgs', () => {
    it('reads every flag', () => {
        const argv = '--seed 3 --ticks 50 --config c.json --dump 7 --level debug --budget-ms 2 --check-invariants';
        expect(parseArgs(argv.split(' '))).toEqual({
            seed: 3,
            ticks: 50,
            config: 'c.json',
            dump: 7,
            level: 'debug',
            budgetMs: 2,
            checkInvariants: true,
            policy: 'map-elites-v6',
            follow: null,
        });
    });

    it('reads --policy and --follow', () => {
        const args = parseArgs('--seed 1 --ticks 5 --policy baseline-v5 --follow 4'.split(' '));

        expect(args).toMatchObject({ policy: 'baseline-v5', follow: 4 });
    });

    it('defaults to the live policy, and --policy live names it', () => {
        expect(parseArgs('--seed 1 --ticks 5'.split(' ')).policy).toBe(LIVE_POLICY);
        expect(parseArgs('--seed 1 --ticks 5 --policy live'.split(' ')).policy).toBe(LIVE_POLICY);
    });

    it('rejects an unknown policy, listing the known ones, and a bad --follow', () => {
        expect(() => parseArgs('--seed 1 --ticks 5 --policy nope'.split(' '))).toThrow(
            /Unknown policy "nope"; known: live, baseline-v5[\s\S]*usage: replay/,
        );
        expect(() => parseArgs('--seed 1 --ticks 5 --follow 0'.split(' '))).toThrow('--follow must be an integer >= 1');
    });

    it('rejects missing, bad and unknown arguments', () => {
        expect(() => parseArgs(['--ticks', '5'])).toThrow('--seed and --ticks are required');
        expect(() => parseArgs(['--seed', 'x', '--ticks', '5'])).toThrow('--seed must be an integer');
        expect(() => parseArgs(['--seed', '1', '--ticks', '5', '--level', 'loud'])).toThrow('--level');
        expect(() => parseArgs(['--fast'])).toThrow('unknown argument');
        expect(() => parseArgs(['--seed', '1', '--ticks', '5', '--dump', '0'])).toThrow('--dump');
    });
});

describe('runIdFor and dumpWorld', () => {
    it('joins seed and config hash', () => {
        expect(runIdFor(4, 'abcd')).toBe('4-abcd');
    });

    it('turns typed arrays into plain arrays and keeps rng state but not config', () => {
        const world = createWorld(createConfig({ ...CONFIG, seed: 2 }), cloneWithNoisePolicy());
        const dump = dumpWorld(world);

        expect(Array.isArray(dump.x)).toBe(true);
        expect(dump.x).toHaveLength(world.x.length);
        expect(Array.isArray(dump.rng[Object.keys(dump.rng)[0]].s)).toBe(true);
        expect(dump.config).toBeUndefined();
        expect(() => JSON.stringify(dump)).not.toThrow();
    });
});

describe('main', () => {
    it(
        'runs a config file and writes the log under the given directory',
        async () => {
            const dir = mkdtempSync(join(tmpdir(), 'replay-main-'));
            const configPath = join(dir, 'c.json');
            writeFileSync(configPath, JSON.stringify(CONFIG));
            const print = vi.spyOn(console, 'log').mockImplementation(() => {});

            const code = await main(['--seed', '1', '--ticks', '1000', '--config', configPath], {
                logDir: join(dir, 'logs'),
                dumpDir: join(dir, 'dumps'),
            });

            expect(code).toBe(0);
            expect(print).toHaveBeenCalledWith(expect.stringMatching(/^tick 1000 worldHash /));
            expect(readdirSync(join(dir, 'logs'))).toHaveLength(1);
            print.mockRestore();
        },
        scaleTimeout(60000),
    );

    it(
        'logs the events createWorld pushes before the first tick, such as FoodPatchesCreated',
        async () => {
            const dir = mkdtempSync(join(tmpdir(), 'replay-created-'));
            const configPath = join(dir, 'c.json');
            writeFileSync(configPath, JSON.stringify({ ...CONFIG, foodPatchCount: 3 }));
            const print = vi.spyOn(console, 'log').mockImplementation(() => {});

            const code = await main(['--seed', '1', '--ticks', '1', '--config', configPath], {
                logDir: join(dir, 'logs'),
                dumpDir: join(dir, 'dumps'),
            });

            expect(code).toBe(0);
            const [file] = readdirSync(join(dir, 'logs'));
            const lines = readFileSync(join(dir, 'logs', file), 'utf8')
                .trim()
                .split('\n')
                .map((l) => JSON.parse(l));
            expect(lines.find((l) => l.event === 'FoodPatchesCreated')).toMatchObject({ count: 3 });
            print.mockRestore();
        },
        scaleTimeout(60000),
    );
});

describe('RunConfig', () => {
    it(
        'runs map-elites-v6 for --policy live and logs RunConfig as the first event',
        async () => {
            const dir = mkdtempSync(join(tmpdir(), 'replay-live-'));
            const args = parseArgs('--seed 1 --ticks 2 --policy live'.split(' '));
            const result = await runReplay({
                ...args,
                configOverrides: CONFIG,
                logDir: join(dir, 'logs'),
                dumpDir: join(dir, 'dumps'),
            });
            const records = readFileSync(join(dir, 'logs', `${result.runId}.jsonl`), 'utf8')
                .trim()
                .split('\n')
                .map((line) => JSON.parse(line));

            expect(records[0]).toEqual({
                level: 'info',
                event: 'RunConfig',
                tool: 'replay',
                policy: 'map-elites-v6',
                configHash: configHash(createConfig({ ...CONFIG, seed: 1 })),
                seeds: [1],
                ticks: 2,
                runId: result.runId,
            });
            expect(records[1]).toMatchObject({ event: 'RunStarted', policy: 'map-elites-v6' });
        },
        scaleTimeout(60000),
    );
});
