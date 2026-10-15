import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createConfig } from '../js/sim/config.js';
import { createWorld } from '../js/sim/spawn.js';
import { cloneWithNoisePolicy } from '../js/sim/birth-policy.js';
import { dumpWorld, main, parseArgs, runIdFor, runReplay } from '../scripts/replay.mjs';

const CONFIG = { initialAgents: 20, minAgents: 20, maxAgents: 40 };

/**
 * @param {Record<string, any>} extra run options
 * @returns {Promise<{result: any, lines: string[], records: any[], dumpDir: string}>}
 */
async function run(extra) {
    const dir = mkdtempSync(join(tmpdir(), 'replay-'));
    /** @type {string[]} */
    const lines = [];
    const result = await runReplay({
        seed: 1,
        ticks: 2000,
        configOverrides: CONFIG,
        logDir: join(dir, 'logs'),
        dumpDir: join(dir, 'dumps'),
        print: (line) => lines.push(line),
        ...extra,
    });
    const text = readFileSync(join(dir, 'logs', `${result.runId}.jsonl`), 'utf8');
    const records = text
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
    return { result, lines, records, dumpDir: join(dir, 'dumps') };
}

describe('runReplay', () => {
    it('gives the same checkpoint hashes on two runs of the same seed and config', async () => {
        const a = await run({});
        const b = await run({});

        expect(a.lines).toEqual(b.lines);
        expect(a.result.hashes).toHaveLength(2);
        expect(a.result.finalHash).toBe(b.result.finalHash);
        expect(a.lines[0]).toMatch(/^tick 1000 worldHash [0-9a-f]{16}$/);
    }, 60000);

    it('logs RunStarted, Checkpoint and RunFinished', async () => {
        const { records, result } = await run({ ticks: 1000 });

        const named = (/** @type {string} */ event) => records.find((r) => r.event === event);
        expect(records[0].event).toBe('RunStarted');
        expect(records.at(-1).event).toBe('RunFinished');
        expect(named('RunStarted')).toMatchObject({
            runId: result.runId,
            seed: 1,
            policy: 'clone-with-noise',
            ticks: 1000,
        });
        expect(named('Checkpoint')).toMatchObject({ tick: 1000, worldHash: result.hashes[0] });
        expect(named('RunFinished')).toMatchObject({ tick: 1000, worldHash: result.finalHash });
    }, 60000);

    it('logs InvariantViolated and stops when a step breaks an invariant', async () => {
        const stepFn = () => {
            throw new Error('tick 0, phase invariants: broken', {
                cause: Object.assign(new Error('x'), { invariant: 'ledger', slot: -1, value: 2.5 }),
            });
        };
        const { records, result } = await run({ ticks: 5, stepFn });

        expect(result.ok).toBe(false);
        expect(records.map((r) => r.event)).toEqual(['RunStarted', 'InvariantViolated']);
        expect(records[1]).toMatchObject({ level: 'error', tick: 0, invariant: 'ledger', slot: -1, value: 2.5 });
    });

    it('rethrows an error that is not an invariant violation', async () => {
        const stepFn = () => {
            throw new Error('boom');
        };

        await expect(run({ ticks: 5, stepFn })).rejects.toThrow('boom');
    });

    it('logs StepBudgetExceeded when a step is over budget', async () => {
        const { records } = await run({
            ticks: 3,
            budgetMs: 0,
            configOverrides: { ...CONFIG, initialAgents: 5, minAgents: 5 },
        });

        expect(records.some((r) => r.event === 'StepBudgetExceeded' && r.budgetMs === 0)).toBe(true);
    });

    it('dumps the world after the requested tick', async () => {
        const { dumpDir, result } = await run({ ticks: 3, dump: 2 });
        const dump = JSON.parse(readFileSync(join(dumpDir, `${result.runId}-2.json`), 'utf8'));

        expect(dump.tick).toBe(2);
        expect(Array.isArray(dump.alive)).toBe(true);
    });
});

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
        });
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
    it('runs a config file and writes the log under the given directory', async () => {
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
    }, 60000);
});
