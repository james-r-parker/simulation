import { describe, expect, it } from 'vitest';
import { createLayerBuilder, createLayerRefs } from '../../js/app/app-layers.js';
import { createFamilySlots } from '../../js/app/family-slots.js';
import { smallReady } from './helpers/ready.js';

describe('createLayerBuilder', () => {
    it('builds the layers back to front with the motes after the bloom', () => {
        const { info, layout } = smallReady();
        const refs = createLayerRefs();
        const build = createLayerBuilder({
            refs,
            getReady: () => ({ info, layout, seed: 3 }),
            slots: createFamilySlots(),
        });
        const set = build();
        expect(set.layers).toHaveLength(15);
        expect(set.layers[4]).toBe(refs.haze);
        expect(set.afterBloom).toHaveLength(2);
        for (const layer of [...set.layers, ...set.afterBloom]) {
            expect(layer.object).toBeDefined();
            layer.dispose();
        }
    });

    it('points the references at the newest build, so a rebuilt scene is fed', () => {
        const { info, layout } = smallReady();
        const refs = createLayerRefs();
        const build = createLayerBuilder({
            refs,
            getReady: () => ({ info, layout, seed: 3 }),
            slots: createFamilySlots(),
        });
        build();
        const first = refs.haze;
        const player = refs.player;
        build();
        expect(refs.haze).not.toBe(first);
        expect(refs.player).not.toBe(player);
        expect(refs.player).not.toBeNull();
    });

    it('throws before any world is ready', () => {
        const build = createLayerBuilder({ refs: createLayerRefs(), getReady: () => null, slots: createFamilySlots() });
        expect(() => build()).toThrow(/no ready message/);
    });
});
