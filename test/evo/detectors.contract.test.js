// The contract every detector keeps (docs/designs/registries.md, Detectors): its `metrics()` keys are exactly the
// registry entries that name its modules, `onSlotFree` clears its per-slot state, and every event it names exists in
// `EVENTS`.

import { describe, expect, it } from 'vitest';
import { DETECTORS } from '../../js/evo/detectors.js';
import { METRICS } from '../../js/evo/metric-registry/index.js';
import { compileDetectors } from '../../js/evo/observer-detectors.js';
import { EVENTS } from '../../js/sim/events.js';
import { observed } from './helpers/observer-world.js';

/** @param {Record<string, any>} state @param {number} n @returns {[string, any][]} the per-slot arrays of a state */
function slotArrays(state, n) {
    return Object.entries(state).filter(([, value]) => ArrayBuffer.isView(value) && value.length === n);
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
                .filter((metric) => detector.modules.includes(METRICS[metric].module))
                .sort();
            expect(keys).toEqual(entries);
            expect(keys.length).toBeGreaterThan(0);
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
            for (const [key, array] of arrays) {
                expect(array[3], `${name}.${key}`).toBe(fresh[key][3]);
                expect(array[2], `${name}.${key} neighbour`).toBe(7);
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
});
