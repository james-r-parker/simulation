import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Runs the `digest` function of scripts/check.sh on a log.
 * @param {string} gate the gate name
 * @param {string} logText the gate's log
 * @returns {string[]} the digest lines
 */
function digestOf(gate, logText) {
    const dir = mkdtempSync(join(tmpdir(), 'digest-'));
    try {
        const log = join(dir, `${gate}.log`);
        writeFileSync(log, logText);
        const source = readFileSync(resolve('scripts/check.sh'), 'utf8');
        const fn = /^digest\(\) \{\n[\s\S]*?\n\}\n/m.exec(source)?.[0] ?? '';
        const script = `ROOT=${dir}; DIGEST_LINES=12\n${fn}\ndigest ${gate} ${log}`;
        const result = spawnSync('bash', ['-c', script], { encoding: 'utf8' });
        return result.stdout.split('\n').filter(Boolean);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

describe('digest of the bench-compare gate', () => {
    const warnings = Array.from({ length: 40 }, (_, i) => `npm warn ERESOLVE overriding peer dependency ${i}`);

    it('shows the base and head line and the metrics, not npm warnings', () => {
        const lines = digestOf(
            'bench-compare',
            [
                ...warnings,
                'base abc123def head 123abc456, median of 5 runs, --sizes=500',
                'FAIL bench.step_ms@500: base 3.9, head 4.5, change +15.4% (limit +10.0%)',
                'ok   bench.phase.sense_ms@500: base 1.1, head 1.1, change +0.0% (limit +10.0%)',
            ].join('\n'),
        );
        expect(lines.some((line) => line.includes('base abc123def head 123abc456'))).toBe(true);
        expect(lines.some((line) => line.includes('FAIL bench.step_ms@500'))).toBe(true);
        expect(lines.some((line) => line.includes('npm warn'))).toBe(false);
    });

    it('falls back to the log tail when no comparison line was printed', () => {
        const lines = digestOf('bench-compare', 'something broke\nsecond line');
        expect(lines.join('\n')).toContain('something broke');
    });
});
