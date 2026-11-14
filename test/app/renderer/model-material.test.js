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

describe('modelMaterial input checks', () => {
    const base = { center: vec2(0, 0), angle: float(0), radius: float(1), color: vec3(1, 1, 1) };

    it('names a missing bound parameter, colour or gate', () => {
        const param = {
            name: 'p',
            parts: [{ name: 'a', shape: 'arc', r: 1, width: 0.1, start: 0, sweep: { in: 'level', mul: 1 } }],
        };
        expect(() => modelMaterial(param, { inputs: base, look: LOOK })).toThrow(/no input named level/);
        const colour = { name: 'c', parts: [{ name: 'a', shape: 'circle', r: 1, color: { in: 'tint' } }] };
        expect(() => modelMaterial(colour, { inputs: base, look: LOOK })).toThrow(/no colour input named tint/);
        const gate = { name: 'g', parts: [{ name: 'a', shape: 'circle', r: 1, gate: 'lit' }] };
        expect(() => modelMaterial(gate, { inputs: base, look: LOOK })).toThrow(/no gate input named lit/);
    });

    it('raises a ring part to the floor it is given and dims the whole model', () => {
        const ring = { name: 'r', parts: [{ name: 'a', shape: 'ring', r: 1, width: 0.1, bind: 'ring' }] };
        const m = modelMaterial(ring, { inputs: { ...base, ringFloor: float(0.5), dim: float(0.5) }, look: LOOK });
        expect(m.premultipliedAlpha).toBe(true);
    });
});

describe('modelMaterial bound parameters', () => {
    it('takes a bound parameter at face value when it names no multiplier', () => {
        const arc = {
            name: 'a',
            parts: [{ name: 'a', shape: 'arc', r: 1, width: 0.1, start: 0, sweep: { in: 'level' } }],
        };
        const inputs = {
            center: vec2(0, 0),
            angle: float(0),
            radius: float(1),
            color: vec3(1, 1, 1),
            values: { level: float(1) },
        };
        expect(modelMaterial(arc, { inputs, look: LOOK }).colorNode.isNode).toBe(true);
    });
});
