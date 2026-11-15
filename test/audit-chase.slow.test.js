import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { main } from '../scripts/audit-chase.mjs';
import { scaleTimeout } from '../scripts/lib/test-timeout.mjs';

const root = mkdtempSync(join(tmpdir(), 'audit-chase-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('npm run audit:chase', () => {
    it(
        'prints the body table and one pair, and logs every cell',
        async () => {
            /** @type {string[]} */
            const printed = [];
            const code = await main(['--pairs', 'predator:forager', '--trials', '1', '--seed', '7'], {
                logDir: root,
                print: (text) => printed.push(text),
            });
            expect(code).toBe(0);
            expect(printed[0]).toContain('predator chases forager');
            expect(printed[0]).toMatch(/^body\s+cruise/);
            const lines = readFileSync(join(root, 'audit-chase-7.jsonl'), 'utf8')
                .trim()
                .split('\n')
                .map((l) => JSON.parse(l));
            expect(lines[0].event).toBe('RunConfig');
            expect(lines.filter((l) => l.event === 'ChaseEnvelopeCell')).toHaveLength(5 * 8);
        },
        scaleTimeout(60_000),
    );

    it('exits 1 on an unknown specialisation', async () => {
        const code = await main(['--pairs', 'predator:nobody', '--trials', '1'], { logDir: root, print: () => {} });
        expect(code).toBe(1);
    });
});
