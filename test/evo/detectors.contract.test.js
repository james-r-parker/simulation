// The contract every detector keeps (docs/designs/registries.md, Detectors): its `metrics()` keys are exactly the
// registry entries that name its modules, `onSlotFree` clears its per-slot state, and every event it names exists in
// `EVENTS`.

import { describe, expect, it } from 'vitest';
import { DETECTORS } from '../../js/evo/detectors.js';
import { METRICS } from '../../js/evo/metric-registry/index.js';
import { compileDetectors } from '../../js/evo/observer-detectors.js';
import { EVENTS } from '../../js/sim/events.js';
import { observed } from './helpers/observer-world.js';

/**
 * @param {Record<string, any>} state a detector's state
 * @param {number} n the number of slots
 * @returns {[string, any][]} its per-slot arrays: typed arrays holding a whole number of values per slot
 */
function slotArrays(state, n) {
    return Object.entries(state).filter(([, value]) => ArrayBuffer.isView(value) && value.length % n === 0);
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
});
