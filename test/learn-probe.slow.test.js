import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { main } from '../scripts/learn-probe.mjs';
import { scaleTimeout } from '../scripts/lib/test-timeout.mjs';

const root = mkdtempSync(join(tmpdir(), 'learn-probe-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('npm run probe:learn', () => {
    it(
        'prints a row for the lesson, logs each generation and writes no genome file',
        async () => {
            /** @type {string[]} */
            const printed = [];
            const code = await main(
                [
                    '--lessons',
                    'food-ahead',
                    '--generations',
                    '2',
                    '--seeds',
                    '2',
                    '--population',
                    '4',
                    '--trials',
                    '1',
                    '--workers',
                    '2',
                ],
                { logDir: root, print: (text) => printed.push(text) },
            );
            expect(code).toBe(0);
            expect(printed[0]).toMatch(/food-ahead\s+\d\.\d\d/);
            const lines = readFileSync(join(root, 'learn-2x2.jsonl'), 'utf8')
                .trim()
                .split('\n')
                .map((l) => JSON.parse(l));
            expect(lines[0].event).toBe('RunConfig');
            expect(lines.filter((l) => l.event === 'LearnGeneration')).toHaveLength(4);
        },
        scaleTimeout(60_000),
    );
});
