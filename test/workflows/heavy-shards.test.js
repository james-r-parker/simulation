import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HEAVY_TESTS } from '../../scripts/lib/test-scope.mjs';

// The named heavy shards: every test file that ran over 60 s inside a numbered shard has a CI job of its own, so no shard
// runs over 4 minutes on a quiet runner (docs/designs/agent-workflow.md, CI wall time). Adding a file here is a
// decision; test/workflows.test.js checks the matrix matches HEAVY_TESTS.
const PINNED = {
    'heavy-train-pool': 'test/train-pool.slow.test.js',
    'heavy-scripted-temperature': 'test/evo/scripted-temperature.slow.test.js',
    'heavy-train': 'test/train.slow.test.js',
    'heavy-gate-validity': 'test/evo/gate-validity.slow.test.js',
    'heavy-bench': 'test/bench.slow.test.js',
};

describe('check.yml heavy shards', () => {
    const check = readFileSync('.github/workflows/check.yml', 'utf8');

    it('names each heavy job and its file, and no other', () => {
        const jobs = Object.fromEntries(
            [...check.matchAll(/pass: heavy, id: (heavy-[\w-]+), files: (\S+) \}/g)].map((m) => [m[1], m[2]]),
        );
        expect(jobs).toEqual(PINNED);
        expect([...HEAVY_TESTS].sort()).toEqual(Object.values(PINNED).sort());
    });

    it('keeps the eight numbered shards', () => {
        const shards = [...check.matchAll(/pass: shard, id: shard-(\d+), shard: (\d+)\/(\d+)/g)];
        expect(shards.map((m) => `${m[1]}:${m[2]}/${m[3]}`)).toEqual(
            Array.from({ length: 8 }, (_, i) => `${i + 1}:${i + 1}/8`),
        );
    });
});
