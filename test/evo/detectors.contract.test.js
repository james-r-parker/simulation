// The contract every detector keeps (docs/designs/registries.md, Detectors): its `metrics()` keys are exactly the
// registry entries that name its modules, `onSlotFree` clears its per-slot state, and every event it names exists in
// `EVENTS`.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DETECTORS } from '../../js/evo/detectors.js';
import { SOURCE_BY_MODULE } from '../../js/evo/metric-registry/entry.js';
import { METRICS } from '../../js/evo/metric-registry/index.js';
import { computeMetrics } from '../../js/evo/metrics.js';
import { compileDetectors } from '../../js/evo/observer-detectors.js';
import { EVENTS } from '../../js/sim/events.js';
import { observed } from './helpers/observer-world.js';

/** @returns {string[]} the metric names the committed report holds (`test/fixtures/metric-names.json`) */
function committedNames() {
    return JSON.parse(readFileSync(new URL('../fixtures/metric-names.json', import.meta.url), 'utf8'));
}

/**
 * @param {Record<string, any>} state a detector's state
 * @param {number} n the number of slots
 * @returns {[string, any][]} its per-slot arrays: typed arrays holding a whole number of values per slot
 */
function slotArrays(state, n) {
    return Object.entries(state).filter(
        ([, value]) => ArrayBuffer.isView(value) && /** @type {any} */ (value).length % n === 0,
    );
}

/** @param {any} array a per-slot array @param {number} n the number of slots @param {number} slot @returns {number[]} the slot's values */
function region(array, n, slot) {
    const stride = array.length / n;
    return Array.from(array.slice(slot * stride, (slot + 1) * stride));
}

describe('DETECTORS', () => {
    const r = observed();
    const n = r.world.config.maxAgents;

    it.each(DETECTORS.map((detector) => [detector.name, detector]))(
        '%s: metrics() keys equal the registry entries of its modules',
        (name, detector) => {
            const state = r.observer.scenes[name];
            const keys = Object.keys(detector.metrics(state, r.world, r.observer)).sort();
            const entries = Object.keys(METRICS)
                .filter((metric) =>
                    detector.modules.includes(/** @type {Record<string, any>} */ (METRICS)[metric].module),
                )
                .sort();
            expect(keys).toEqual(entries);
            // A rule scene (proof, heritage, niche, mate) names no module: `ruleMetrics` merges its metrics.
            expect(keys.length > 0, name).toBe(detector.modules.length > 0);
        },
    );

    it.each(DETECTORS.filter((detector) => detector.onSlotFree !== undefined).map((d) => [d.name, d]))(
        '%s: onSlotFree puts the slot back to a fresh state',
        (name, detector) => {
            const fresh = detector.create(r.world.config, { runTicks: 0 });
            const dirty = detector.create(r.world.config, { runTicks: 0 });
            const arrays = slotArrays(dirty, n);
            expect(arrays.length).toBeGreaterThan(0);
            for (const [, array] of arrays) {
                array.fill(7);
            }
            /** @type {(state: any, slot: number) => void} */ (detector.onSlotFree)(dirty, 3);
            // A reset may leave a field that another field gates (an idle approach's last closing tick); what it does
            // write is the fresh value, for this slot only, and it writes something.
            const stays = (/** @type {number[]} */ values) => values.every((value) => value === 7);
            const written = arrays.filter(([, array]) => !stays(region(array, n, 3)));
            expect(written.length, `${name} resets something`).toBeGreaterThan(0);
            for (const [key, array] of arrays) {
                expect(stays(region(array, n, 2)), `${name}.${key} neighbour`).toBe(true);
            }
            for (const [key, array] of written) {
                expect(region(array, n, 3), `${name}.${key}`).toEqual(region(fresh[key], n, 3));
            }
        },
    );

    it('names only events that EVENTS holds', () => {
        const known = new Set(EVENTS.map((def) => def.name));
        for (const detector of DETECTORS) {
            for (const event of Object.keys(detector.on ?? {})) {
                expect(known.has(event), `${detector.name} names ${event}`).toBe(true);
            }
        }
    });

    it('refuses a detector that names an event EVENTS does not hold', () => {
        const bad = { ...DETECTORS[0], name: 'bad', on: { NOT_AN_EVENT: () => {} } };
        expect(() => compileDetectors([bad])).toThrow(/bad names the event NOT_AN_EVENT/);
    });

    it('holds SOURCE_BY_MODULE to the source tests the detectors declare', () => {
        // `entry.js` cannot import the detectors (`metrics-stats.js` imports the registry, which imports `entry.js`),
        // so the table is a mirror that this test keeps equal to the detectors' `sourceTest`.
        const declared = Object.fromEntries(
            DETECTORS.filter((detector) => detector.sourceTest !== undefined).flatMap((detector) =>
                detector.modules.map((module) => [module, detector.sourceTest]),
            ),
        );
        const tableOnly = ['js/evo/metrics-combat.js'];
        expect({ ...declared, ...Object.fromEntries(tableOnly.map((m) => [m, SOURCE_BY_MODULE[m]])) }).toEqual(
            SOURCE_BY_MODULE,
        );
    });

    it('lists every metric a detector returns in the committed report names', () => {
        const names = committedNames();
        for (const detector of DETECTORS) {
            for (const metric of Object.keys(detector.metrics(r.observer.scenes[detector.name], r.world, r.observer))) {
                expect(names, `${detector.name} returns ${metric}`).toContain(metric);
            }
        }
    });

    it('names in the committed report only metrics the report produces', () => {
        // The report is `computeMetrics` (js/evo/metrics.js). Its keys are the detectors' `metrics()`, the rule metrics
        // (`ruleMetrics`, reached through `selectionMetrics`), the alarm-reach and reward metrics (through
        // `sceneMetrics`), and the other `metrics-*.js` modules (combat, intent, trend, lineage, body, ...), which
        // produce the names the detectors do not. A fresh observer, so the rng draws of an earlier test do not matter.
        const fresh = observed();
        const produced = new Set(Object.keys(computeMetrics(fresh.observer, fresh.world)));
        for (const name of committedNames()) {
            expect(produced.has(name), `${name} is in the committed report names and nothing produces it`).toBe(true);
        }
    });
});
