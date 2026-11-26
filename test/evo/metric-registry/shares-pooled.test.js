// The pooled share registry entries: complete fields, real module and source tests, and each pooled name beside its old
// one with the old unit, direction, intended direction, module and scenes. Measured on E279, each with its own power.

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { METRICS } from '../../../js/evo/metric-registry/index.js';
import { SHARES_POOLED } from '../../../js/evo/metric-registry/shares-pooled.js';

const ROOT = new URL('../../../', import.meta.url);
// reads: js/evo/scene-eat.js, js/evo/scene-herd-metrics.js, js/evo/metrics.js, js/evo/scene-terrain.js
// reads: test/evo/metric-source-shares-pooled.test.js, test/evo/scene-eat.test.js, test/evo/scene-herd-metrics.test.js
// reads: test/evo/metrics.test.js, test/evo/scene-terrain.test.js
const at = (/** @type {string} */ name) => /** @type {any} */ (METRICS)[name];

describe('shares-pooled registry entries', () => {
    it.each(Object.keys(SHARES_POOLED))('%s is complete, names real files and sits beside its old metric', (name) => {
        const e = at(name);
        const old = at(name.replace(/_pooled$/, ''));
        expect(old).toBeDefined();
        expect(existsSync(new URL(e.module, ROOT)), e.module).toBe(true);
        expect([e.family, e.unit, e.direction, e.intended, e.module, e.scenes]).toEqual([
            old.family,
            old.unit,
            old.direction,
            old.intended,
            old.module,
            old.scenes,
        ]);
        expect(e.nullWhen).toEqual(old.nullWhen);
        expect(e.counts).toContain(`Pooled ${name.replace(/_pooled$/, '')}`);
        expect(readFileSync(new URL(e.tests.source, ROOT), 'utf8')).toContain(name.replace(/^eval\./, ''));
        expect(readFileSync(new URL(e.tests.arithmetic, ROOT), 'utf8')).toContain(name.replace(/^eval\./, ''));
    });

    it.each(Object.keys(SHARES_POOLED))('%s is measured on E279 with its own power reading', (name) => {
        const e = at(name);
        expect(e.liveness).not.toBeNull();
        expect(e.power).not.toBeNull();
        expect(e.power).not.toEqual(at(name.replace(/_pooled$/, '')).power);
    });

    it('verifies the pooled carcass hunter share at 32 seeds: 0.05 absolute where the per-seed share needs 0.10 at 64', () => {
        const pooled = at('eval.carcass_hunter_share_pooled');
        expect([pooled.power.mde32, pooled.power.mde64, pooled.minSeeds]).toEqual([0.05, 0.05, 32]);
        expect(at('eval.carcass_hunter_share').power.mde64).toBe(0.1);
    });
});
