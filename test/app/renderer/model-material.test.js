import { describe, expect, it } from 'vitest';
import { attribute, float, vec2, vec3 } from 'three/tsl';
import { modelMaterial } from '../../../js/app/renderer/model-material.js';
import { MODELS } from '../../../js/app/renderer/models.js';

const LOOK = { rimPx: 1.5, fillShare: 0.28 };

/** @returns {import('../../../js/app/renderer/model-material.js').ModelInputs} inputs naming every gate, value and colour the catalogue uses */
function allInputs() {
    const pose = attribute('iPose', 'vec4');
    /** @type {Record<string, any>} */
    const values = {};
    /** @type {Record<string, any>} */
    const colors = {};
    for (const model of Object.values(MODELS)) {
        for (const part of model.parts) {
            const p = /** @type {Record<string, any>} */ (part);
            if (p.gate) {
                values[p.gate] = float(1);
            }
            for (const v of Object.values(p)) {
                if (v && typeof v === 'object' && 'in' in v) {
                    (p.color === v ? colors : values)[v.in] = p.color === v ? vec3(1, 1, 1) : float(0.5);
                }
            }
        }
    }
    return {
        center: pose.xy,
        angle: pose.z,
        radius: pose.w,
        color: vec3(1, 0, 0),
        rig: [attribute('iRig0', 'vec4'), attribute('iRig1', 'vec4'), attribute('iRig2', 'vec4')],
        values,
        colors,
        blob: { amp: vec3(0.1, 0.1, 0.1), phase: vec3(0, 0, 0) },
    };
}

describe('modelMaterial', () => {
    it('builds a transparent, depthless material for every catalogue model', () => {
        const inputs = allInputs();
        for (const model of Object.values(MODELS)) {
            const m = modelMaterial(model, { inputs, look: LOOK });
            expect(m.transparent, model.name).toBe(true);
            expect(m.depthTest).toBe(false);
            expect(m.depthWrite).toBe(false);
            expect(m.positionNode.isNode).toBe(true);
            expect(m.colorNode.isNode).toBe(true);
            expect(m.opacityNode.isNode).toBe(true);
        }
    });

    it('builds without a rig (every channel at rest)', () => {
        const inputs = { ...allInputs(), rig: null };
        expect(() => modelMaterial(MODELS.rock, { inputs, look: LOOK })).not.toThrow();
    });

    it('fails loudly when a part names an input the draw module does not give', () => {
        const inputs = { center: vec2(0, 0), angle: float(0), radius: float(1), color: vec3(1, 1, 1) };
        expect(() => modelMaterial(MODELS.predator, { inputs, look: LOOK })).toThrow(/no (gate|colour|) ?input named/);
        expect(() => modelMaterial(MODELS.rock, { inputs, look: LOOK })).toThrow(/blob/);
    });
});
