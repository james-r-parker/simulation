// The registry against a live report (docs/designs/metric-trust.md, Every new metric is registered): `computeMetrics`
// on `evals/metric-registry-world.json` (the micro world with the herds, the refuges, the cold margin and the wall gap
// on) emits only registered names, and every entry is emitted or says why not (`expectedFlat`). Every entry is
// complete, names a module that exists, and names test files that contain its name.

import { existsSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { LIVE_POLICY } from '../../js/evo/policies/index.js';
import { METRICS, metricName } from '../../js/evo/metric-registry/index.js';
import { runSeed } from '../../scripts/eval-worker.mjs';

const ROOT = new URL('../../', import.meta.url);
const WORLD = JSON.parse(readFileSync(new URL('evals/metric-registry-world.json', ROOT), 'utf8'));
const TICKS = 600;

/** @type {string[]} */
let emitted = [];

beforeAll(() => {
    const report = runSeed({ seed: 1, ticks: TICKS, policy: LIVE_POLICY, overrides: WORLD });
    emitted = Object.keys(report.metrics);
});

describe('the metrics a live run emits', () => {
    it('are all registered', () => {
        expect(emitted.length).toBeGreaterThan(200);
        expect(emitted.filter((name) => !Object.hasOwn(METRICS, name))).toEqual([]);
    });

    it('include every registered metric, or the entry says why it is flat', () => {
        const missing = Object.entries(METRICS)
            .filter(([name, entry]) => !emitted.includes(name) && entry.expectedFlat === null)
            .map(([name]) => name);
        expect(missing).toEqual([]);
    });
});

describe('the registry entries', () => {
    it('have their required fields, an existing module and test files that name the metric', () => {
        const problems = [];
        for (const [name, entry] of Object.entries(METRICS)) {
            const required = [entry.meaning, entry.counts, entry.unit, entry.module, entry.family];
            if (required.some((field) => typeof field !== 'string' || field.length === 0)) {
                problems.push(`${name}: a required field is empty`);
            }
            if (!['higher', 'lower', 'watch'].includes(entry.direction)) {
                problems.push(`${name}: direction ${entry.direction}`);
            }
            if (!existsSync(new URL(entry.module, ROOT))) {
                problems.push(`${name}: module ${entry.module} does not exist`);
            }
            for (const path of [entry.tests.arithmetic, entry.tests.source].filter((p) => p !== '')) {
                const text = existsSync(new URL(path, ROOT)) ? readFileSync(new URL(path, ROOT), 'utf8') : null;
                if (text === null || !text.includes(name.replace(/^eval\./, ''))) {
                    problems.push(`${name}: test ${path} is missing or does not name it`);
                }
            }
        }
        expect(problems).toEqual([]);
    });

    it('give a metricName that has an entry back, and throw on one that has none', () => {
        expect(metricName('eval.p90_fitness', 'forager')).toBe('eval.p90_fitness.forager');
        expect(() => metricName('eval.p90_fitness', 'nothing')).toThrow(/unknown metric/);
    });
});
