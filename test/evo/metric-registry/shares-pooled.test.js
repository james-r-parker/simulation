// The pooled share registry entries: complete fields, real module and source tests, and each pooled name beside its old
// one with the old unit, direction, intended direction, module and scenes. Unmeasured until the 128-seed run.

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

    it.each(Object.keys(SHARES_POOLED))('%s is unmeasured: no liveness, no power, no minimum seed count', (name) => {
        const e = at(name);
        expect([e.liveness, e.power, e.minSeeds]).toEqual([null, null, null]);
    });
});
