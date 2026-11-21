import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { main } from '../scripts/audit-signals.mjs';
import { scaleTimeout } from '../scripts/lib/test-timeout.mjs';

const root = mkdtempSync(join(tmpdir(), 'audit-signals-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('npm run audit:signals', () => {
    it(
        'prints an input and an output table and logs one row per input and output',
        async () => {
            /** @type {string[]} */
            const printed = [];
            const code = await main(['--seeds', '1', '--ticks', '300', '--workers', '1'], {
                logDir: root,
                print: (text) => printed.push(text),
            });
            expect(code).toBe(0);
            expect(printed[0]).toMatch(/food hit1 strength/);
            expect(printed[0]).toMatch(/BITE/);
            const lines = readFileSync(join(root, 'audit-signals-1x1.jsonl'), 'utf8')
                .trim()
                .split('\n')
                .map((l) => JSON.parse(l));
            expect(lines[0].event).toBe('RunConfig');
            expect(lines.filter((l) => l.event === 'SignalCensusRow' && l.kind === 'input')).toHaveLength(106);
            expect(lines.filter((l) => l.event === 'SignalCensusRow' && l.kind === 'output')).toHaveLength(11);
        },
        scaleTimeout(60_000),
    );
});
