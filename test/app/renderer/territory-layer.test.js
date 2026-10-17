import { describe, expect, it } from 'vitest';
import { createTerritoryLayer, TERRITORY_REFRESH_MS } from '../../../js/app/renderer/territory-layer.js';
import { assignSlots, createFamilySlots } from '../../../js/app/family-slots.js';
import { smallReady } from '../helpers/ready.js';
import { makeSnapshot } from '../helpers/snapshots.js';

/** @param {number[]} ids the families that hold slots @returns {ReturnType<typeof createFamilySlots>} slots */
function family(ids) {
    const slots = createFamilySlots();
    assignSlots(
        slots,
        ids.map((id) => ({ id })),
    );
    return slots;
}

/**
 * @param {Record<string, any>} over fields to change
 * @returns {any} a frame with the territory lens on, one agent of lineage 5 and 5 as the top lineage
 */
function frame(over = {}) {
    return {
        nowMs: 0,
        snapshot: makeSnapshot(1, [{ slot: 0, genomeId: 1, lineageId: 5, x: 1, y: 1 }]),
        lenses: { territory: true },
        family: family([5]),
        ...over,
    };
}

describe('createTerritoryLayer', () => {
    const { info } = smallReady();

    it('is hidden and does nothing while the lens is off', () => {
        const layer = createTerritoryLayer({ info });
        layer.update?.(frame({ lenses: { territory: false } }));
        expect(layer.object.visible).toBe(false);
        expect(layer.object.material.uniforms.uMap.value.image.data.every((/** @type {number} */ b) => b === 0)).toBe(
            true,
        );
        layer.dispose();
    });

    it('accumulates new snapshots into the texture and refreshes it at most every 250 ms', () => {
        const layer = createTerritoryLayer({ info });
        const texture = layer.object.material.uniforms.uMap.value;
        layer.update?.(frame({ nowMs: 1000 }));
        expect(layer.object.visible).toBe(true);
        const alpha = () => texture.image.data[3];
        expect(alpha()).toBeGreaterThan(0);
        const first = alpha();
        layer.update?.(
            frame({
                nowMs: 1000 + TERRITORY_REFRESH_MS - 1,
                snapshot: makeSnapshot(2, [{ slot: 0, genomeId: 1, lineageId: 5, x: 1, y: 1 }]),
            }),
        );
        expect(alpha()).toBe(first);
        layer.update?.(
            frame({
                nowMs: 1000 + TERRITORY_REFRESH_MS,
                snapshot: makeSnapshot(2, [{ slot: 0, genomeId: 1, lineageId: 5, x: 1, y: 1 }]),
            }),
        );
        expect(alpha()).toBeGreaterThan(first);
        layer.dispose();
    });

    it('does not count the same snapshot twice', () => {
        const layer = createTerritoryLayer({ info });
        const texture = layer.object.material.uniforms.uMap.value;
        layer.update?.(frame({ nowMs: 0 }));
        const once = texture.image.data[3];
        layer.update?.(frame({ nowMs: 5000 }));
        expect(texture.image.data[3]).toBe(once);
        layer.dispose();
    });
});
