import { describe, expect, it } from 'vitest';
import { createHerdDraw } from '../../../js/app/renderer/herd-draw.js';
import { makeSnapshot } from '../helpers/snapshots.js';

const INFO = { herdMax: 4, herdRadius: 80, herdRunSpeed: 6.5 };

describe('createHerdDraw', () => {
    it('blends the herds between the held snapshots and draws one instance per animal', () => {
        const layer = createHerdDraw({ info: INFO });
        const prev = makeSnapshot(10, [], { herds: [[0, 0, 1, 0.5, 0, 0]] });
        const next = makeSnapshot(12, [], { herds: [[10, 0, 1, 0.5, 0, 0]] });
        layer.update?.(
            /** @type {any} */ ({
                snapshot: next,
                prevSnapshot: prev,
                alpha: 0.5,
                nowMs: 0,
                family: { palette: 'default' },
            }),
        );
        expect(layer.object.geometry.instanceCount).toBe(1);
        expect(layer.object.geometry.attributes.iPose.data.array[0]).toBeCloseTo(5);
        layer.update?.(/** @type {any} */ ({ snapshot: null }));
        expect(layer.object.geometry.instanceCount).toBe(0);
        layer.dispose();
    });
});

describe('createHerdDraw without the newer info fields', () => {
    it('draws from one snapshot with no older one, family or radius', () => {
        const layer = createHerdDraw({ info: { herdMax: 2 } });
        layer.update?.(
            /** @type {any} */ ({ snapshot: makeSnapshot(1, [], { herds: [[5, 5, 0, 0, 0, 0]] }), alpha: 1, nowMs: 0 }),
        );
        expect(layer.object.geometry.instanceCount).toBe(1);
        layer.dispose();
    });
});
