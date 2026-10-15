import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { compareStep, main } from '../scripts/bench-check.mjs';
import { benchSize, formatLines, formatMetrics, median, parseArgs, recordMetrics } from '../scripts/bench.mjs';

describe('parseArgs', () => {
    it('defaults to the three sizes, text output', () => {
        expect(parseArgs([])).toEqual({ sizes: [100, 250, 500], json: false });
    });

    it('reads --sizes and --json', () => {
        expect(parseArgs(['--json', '--sizes=500'])).toEqual({ sizes: [500], json: true });
    });

    it('rejects a bad size and an unknown flag', () => {
        expect(() => parseArgs(['--sizes=10,abc'])).toThrow('--sizes');
        expect(() => parseArgs(['--fast'])).toThrow('unknown argument');
    });
});

describe('median', () => {
    it('takes the middle of an odd count and the mean of an even count', () => {
        expect(median([3, 1, 2])).toBe(2);
        expect(median([4, 1, 3, 2])).toBe(2.5);
    });

    it('rejects an empty list', () => {
        expect(() => median([])).toThrow('at least one');
    });
});

describe('formatting', () => {
    it('names the step and each phase with its size', () => {
        const metrics = formatMetrics(500, 1.23456, { brain: 0.5 });
        expect(metrics).toEqual({ 'bench.step_ms@500': 1.2346, 'bench.phase_ms.brain@500': 0.5 });
        expect(formatLines(metrics)).toBe('bench.step_ms@500 1.2346\nbench.phase_ms.brain@500 0.5');
    });
});

describe('benchSize', () => {
    it('reports a step time and every phase', () => {
        const metrics = benchSize(8);
        expect(metrics['bench.step_ms@8']).toBeGreaterThan(0);
        expect(Object.keys(metrics)).toContain('bench.phase_ms.brain@8');
    }, 60000);
});

describe('recordMetrics', () => {
    const all = { 'bench.step_ms@100': 1.5, 'bench.phase_ms.brain@100': 0.5 };

    it('records the step and each phase with phase and agents attributes', () => {
        const record = vi.fn();
        recordMetrics({ enabled: true, record, shutdown: async () => {} }, all);

        expect(record).toHaveBeenCalledWith('sim.step_ms', 1.5, { phase: 'step', agents: 100 });
        expect(record).toHaveBeenCalledWith('sim.step_ms', 0.5, { phase: 'brain', agents: 100 });
    });

    it('records nothing when disabled', () => {
        const record = vi.fn();
        recordMetrics({ enabled: false, record, shutdown: async () => {} }, all);

        expect(record).not.toHaveBeenCalled();
    });
});

describe('compareStep', () => {
    it('passes within 15% and fails beyond it, reporting the change', () => {
        expect(compareStep(4, 4.5).ok).toBe(true);
        const slow = compareStep(4, 5);
        expect(slow.ok).toBe(false);
        expect(slow.message).toContain('baseline 4 ms');
        expect(slow.message).toContain('measured 5 ms');
        expect(slow.message).toContain('+25.0%');
    });

    it('passes a speed-up', () => {
        expect(compareStep(4, 2).ok).toBe(true);
    });

    it('rejects a missing baseline', () => {
        expect(() => compareStep(0, 1)).toThrow('baseline');
    });
});

describe('bench-check main', () => {
    /**
     * @param {number} baseline the baseline step time
     * @param {number} measured the measured step time
     * @returns {number} the exit code main returns for them
     */
    function run(baseline, measured) {
        const dir = mkdtempSync(join(tmpdir(), 'bench-check-'));
        const baselinePath = join(dir, 'baseline.json');
        const measuredPath = join(dir, 'measured.json');
        writeFileSync(baselinePath, JSON.stringify({ 'bench.step_ms@500': baseline }));
        writeFileSync(measuredPath, JSON.stringify({ 'bench.step_ms@500': measured }));
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});
        try {
            return main(baselinePath, measuredPath);
        } finally {
            log.mockRestore();
        }
    }

    it('exits 0 within 15% of the baseline', () => {
        expect(run(4, 4.4)).toBe(0);
    });

    it('exits 1 more than 15% above the baseline', () => {
        expect(run(4, 4.8)).toBe(1);
    });
});
