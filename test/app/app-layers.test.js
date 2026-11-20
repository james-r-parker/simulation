import { describe, expect, it } from 'vitest';
import { createLayerBuilder, createLayerRefs } from '../../js/app/app-layers.js';
import { createFamilySlots } from '../../js/app/family-slots.js';
import { smallReady } from './helpers/ready.js';

describe('createLayerBuilder', () => {
    it('builds the layers back to front, the scent lens among them', () => {
        const { info, layout } = smallReady();
        const refs = createLayerRefs();
        const build = createLayerBuilder({
            refs,
            getReady: () => ({ info, layout, seed: 3 }),
            slots: createFamilySlots(),
        });
        const layers = build();
        expect(layers).toHaveLength(21);
        expect(layers[4]).toBe(refs.haze);
        for (const layer of layers) {
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

    it('gives the effects player the agent layer dents and dying bodies, so a bite dents and a death plays', () => {
        const { info, layout } = smallReady();
        const refs = createLayerRefs();
        createLayerBuilder({ refs, getReady: () => ({ info, layout, seed: 3 }), slots: createFamilySlots() })();
        expect(refs.player?.dents).not.toBeNull();
        expect(refs.player?.dying).not.toBeNull();
    });

    it('builds the effect stores over one shared buffer and hands the player those same stores', () => {
        const { info, layout } = smallReady();
        const refs = createLayerRefs();
        expect(refs.stores).toBeNull();
        createLayerBuilder({ refs, getReady: () => ({ info, layout, seed: 3 }), slots: createFamilySlots() })();
        expect(refs.stores?.memory).toBeInstanceOf(SharedArrayBuffer);
        expect(refs.stores?.dents.angle.buffer).toBe(refs.stores?.memory);
        expect(refs.player?.dents).toBe(refs.stores?.dents);
        expect(refs.player?.tweens).toBe(refs.stores?.tweens);
        expect(refs.player?.dying).toBe(refs.stores?.dying);
    });

    it('keeps the stores of a world across a rebuild (a device loss) and makes new ones for a new world', () => {
        const { info, layout } = smallReady();
        const refs = createLayerRefs();
        let ready = { info, layout, seed: 3 };
        const build = createLayerBuilder({ refs, getReady: () => ready, slots: createFamilySlots() });
        build();
        const stores = refs.stores;
        build();
        expect(refs.stores).toBe(stores);
        ready = { info, layout, seed: 4 };
        build();
        expect(refs.stores).not.toBe(stores);
    });

    it('throws before any world is ready', () => {
        const build = createLayerBuilder({ refs: createLayerRefs(), getReady: () => null, slots: createFamilySlots() });
        expect(() => build()).toThrow(/no ready message/);
    });
});
