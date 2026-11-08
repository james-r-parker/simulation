// The registry's compile-time guarantees (docs/designs/metric-trust.md, Every new metric is registered). The `typecheck`
// gate compiles this file: each `@ts-expect-error` below fails the gate if the line stops being an error, and `NOT_STRING`
// fails it if `MetricName` widens to `string`.

import { describe, expect, it } from 'vitest';
import { METRICS } from '../../js/evo/metric-registry/index.js';

/** @typedef {import('../../js/evo/metric-registry/index.js').MetricName} MetricName */
/** @typedef {import('../../js/evo/metrics-stats.js').MetricRecord} MetricRecord */

/** @type {string extends MetricName ? never : true} `MetricName` is a union of literals, never `string` */
const NOT_STRING = true;

/** @returns {MetricRecord} a typed producer that returns a registered literal */
function registeredProducer() {
    return { 'eval.median_lifespan': { value: 1 } };
}

/** @returns {MetricRecord} a typed producer that returns an unregistered literal */
function unregisteredProducer() {
    return {
        // @ts-expect-error 'eval.not_a_metric' has no registry entry, so it is an excess property
        'eval.not_a_metric': { value: 1 },
    };
}

/** @returns {MetricRecord} a typed producer that writes an unregistered name by index */
function unregisteredIndexedWrite() {
    /** @type {MetricRecord} */
    const out = {};
    // @ts-expect-error an indexed write of a name outside MetricName fails under strict
    out['eval.not_a_metric'] = { value: 1 };
    return out;
}

describe('MetricName', () => {
    it('is a union of the registered names, not string', () => {
        expect(NOT_STRING).toBe(true);
        const names = /** @type {MetricName[]} */ (Object.keys(METRICS));
        expect(names.length).toBeGreaterThan(200);
    });

    it('lets a producer return a registered literal', () => {
        expect(registeredProducer()['eval.median_lifespan']).toEqual({ value: 1 });
    });

    it('rejects an unregistered literal at compile time and keeps it out of METRICS', () => {
        expect(Object.keys(unregisteredProducer())).toEqual(['eval.not_a_metric']);
        expect(Object.keys(unregisteredIndexedWrite())).toEqual(['eval.not_a_metric']);
        expect(Object.hasOwn(METRICS, 'eval.not_a_metric')).toBe(false);
    });
});
