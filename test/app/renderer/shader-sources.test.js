import { describe, expect, it } from 'vitest';
import { createLayerBuilder, createLayerRefs } from '../../../js/app/app-layers.js';
import { createFamilySlots } from '../../../js/app/family-slots.js';
import { smallReady } from '../helpers/ready.js';

/** Names `ShaderMaterial` declares itself, so a shader that declares them again fails to link. */
const BUILT_IN_ATTRIBUTES = ['position', 'uv', 'normal', 'color'];

/**
 * @param {any} object an `Object3D`
 * @param {any[]} found where the materials go
 * @returns {any[]} every shader material below the object
 */
function shaderMaterials(object, found = []) {
    if (object.material?.isShaderMaterial) {
        found.push(object.material);
    }
    for (const child of object.children ?? []) {
        shaderMaterials(child, found);
    }
    return found;
}

describe('every layer shader', () => {
    it('declares none of the attributes ShaderMaterial adds, in a world with terrain', () => {
        const { info, layout } = smallReady();
        const terrain = {
            layout: 'basins',
            coldMarginWidth: 200,
            wallX: 0,
            rockFirst: 0,
            rockCount: 0,
            refuges: [{ x: 100, y: 100, radius: 50 }],
        };
        const world = { info: { ...info, terrain }, layout, seed: 3 };
        const build = createLayerBuilder({
            refs: createLayerRefs(),
            getReady: () => world,
            slots: createFamilySlots(),
        });
        const set = build();
        const layers = [...set.layers, ...set.afterBloom];
        const materials = layers.flatMap((layer) => shaderMaterials(layer.object));
        expect(materials.length).toBeGreaterThan(10);
        for (const material of materials) {
            for (const name of BUILT_IN_ATTRIBUTES) {
                const declared = new RegExp(`^\\s*attribute\\s+\\w+\\s+${name}\\s*;`, 'm');
                expect(declared.test(material.vertexShader), `${name} in a vertex shader`).toBe(false);
            }
        }
        layers.forEach((layer) => layer.dispose());
    });
});
