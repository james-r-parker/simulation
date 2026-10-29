import { describe, expect, it, vi } from 'vitest';
import { benchSize, main as benchMain } from '../scripts/bench.mjs';
import { scaleTimeout } from '../scripts/lib/test-timeout.mjs';

describe('benchSize', () => {
    it(
        'reports a step time and every phase',
        () => {
            const metrics = benchSize(8);
            expect(metrics['bench.step_ms@8']).toBeGreaterThan(0);
            expect(Object.keys(metrics)).toContain('bench.phase_ms.brain@8');
        },
        scaleTimeout(60000),
    );

    it(
        'suffixes every key of a tracked variant',
        () => {
            const metrics = benchSize(8, undefined, { suffix: 'merit', overrides: {} });
            expect(Object.keys(metrics).every((key) => key.endsWith('@8merit'))).toBe(true);
        },
        scaleTimeout(60000),
    );

    it(
        'benches a named policy with its hooks',
        () => {
            const metrics = benchSize(8, 'natural-v1');
            expect(metrics['bench.step_ms@8']).toBeGreaterThan(0);
        },
        scaleTimeout(60000),
    );
});

describe('main', () => {
    it(
        'reports the policy that ran',
        async () => {
            const log = vi.spyOn(console, 'log').mockImplementation(() => {});
            try {
                await benchMain(['--sizes=8', '--json', '--policy', 'natural-v1']);
                expect(JSON.parse(log.mock.calls[0][0])).toMatchObject({ policy: 'natural-v1' });
            } finally {
                log.mockRestore();
            }
        },
        scaleTimeout(60000),
    );

    it(
        'prints the tracked variants beside the tracked row as text',
        async () => {
            const log = vi.spyOn(console, 'log').mockImplementation(() => {});
            try {
                await benchMain(['--sizes=8'], { trackedSize: 8 });
                const text = String(log.mock.calls[0][0]);
                expect(text).toContain('bench.step_ms@8 ');
                expect(text).toContain('bench.step_ms@8merit ');
                expect(text).toContain('bench.step_ms@8w7680 ');
            } finally {
                log.mockRestore();
            }
        },
        scaleTimeout(60000),
    );

    it(
        'labels the text output with the policy that ran',
        async () => {
            const log = vi.spyOn(console, 'log').mockImplementation(() => {});
            try {
                await benchMain(['--sizes=8', '--policy', 'natural-v1']);
                expect(String(log.mock.calls[0][0])).toMatch(/^policy natural-v1\nbench\.step_ms@8 /);
            } finally {
                log.mockRestore();
            }
        },
        scaleTimeout(60000),
    );
});
