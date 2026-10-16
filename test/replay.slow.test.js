import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runReplay } from '../scripts/replay.mjs';

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
            policy: 'baseline-v5',
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

describe('runReplay with --follow', () => {
    it('logs FollowSample every 10 ticks until the genome dies, then FollowEnded and nothing more', async () => {
        const { records } = await run({ ticks: 3000, follow: 1 });

        const follow = records.filter((r) => r.event.startsWith('Follow'));
        const samples = follow.filter((r) => r.event === 'FollowSample');
        const ended = follow.filter((r) => r.event === 'FollowEnded');
        expect(samples.length).toBeGreaterThan(0);
        expect(samples.map((r) => r.tick)).toEqual(samples.map((_, i) => (i + 1) * 10));
        expect(samples[0]).toMatchObject({ level: 'info', genomeId: 1 });
        expect(Object.keys(samples[0])).toEqual(['level', 'event', 'tick', 'genomeId', 'x', 'y', 'energy', 'outputs']);
        expect(samples[0].outputs.every((/** @type {unknown} */ v) => typeof v === 'number')).toBe(true);
        expect(ended).toHaveLength(1);
        expect(ended[0]).toMatchObject({ genomeId: 1, reason: 'died' });
        expect(ended[0].tick).toBeLessThan(3000);
        expect(ended[0].tick).toBeGreaterThanOrEqual(samples.at(-1).tick);
        expect(follow.at(-1)).toBe(ended[0]);
    }, 60000);

    it('ends with "run ended" when the agent outlives the run, and warns if the genome never appears', async () => {
        const alive = await run({ ticks: 100, follow: 1 });
        const never = await run({ ticks: 100, follow: 999999 });

        expect(alive.records.filter((r) => r.event === 'FollowEnded')).toMatchObject([
            { tick: 100, reason: 'run ended' },
        ]);
        expect(never.records.filter((r) => r.event.startsWith('Follow'))).toMatchObject([
            { level: 'warn', event: 'FollowNeverSeen', genomeId: 999999 },
        ]);
    });

    it('logs nothing about following when --follow is absent', async () => {
        const { records } = await run({ ticks: 50 });

        expect(records.some((r) => r.event.startsWith('Follow'))).toBe(false);
    });
});
