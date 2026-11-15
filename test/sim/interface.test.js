// Interface checks (docs/designs/senses-and-motor.md, Phase 1, T1): what the brain is told about a body is correct, of
// the sign the motor uses, and the same in a mirrored, rotated or shifted scene. Sensing and pooling run only in the
// WASM kernels (the JS ray march and pool were deleted), so these tests exercise them through `senseAll` and `poolRays`.
import { describe, expect, it } from 'vitest';
import { applyInstinct } from '../../js/evo/instinct.js';
import { OUTPUT_COUNT, OUTPUT_INDEX, POOLED_VALUES } from '../../js/sim/brain-layout.js';
import { forwardAll } from '../../js/sim/brain.js';
import { actAll } from '../../js/sim/physics.js';
import { addAgent } from './helpers/sense-world.js';
import {
    CENTRE,
    FORAGER,
    KINDS,
    PREDATOR,
    addSubject,
    bodyInput,
    brainRow,
    hitOf,
    stageSubject,
    viewOf,
    worldPoint,
} from './helpers/interface-stage.js';

const RAY = (2 * Math.PI) / 16;
const KIND_NAMES = Object.keys(KINDS);

/**
 * @param {string} kind a key of `KINDS`
 * @param {{forward: number, side: number}} offset the item's place in the subject's frame
 * @returns {{w: any, row: Float32Array, at: {x: number, y: number}}} the world, the subject's pooled row, the item's point
 */
function scene(kind, offset) {
    const w = stageSubject();
    const slot = addSubject(w, { spec: KINDS[kind].subject });
    const at = worldPoint(w, slot, offset);
    KINDS[kind].put(w, at.x, at.y);
    return { w, row: brainRow(w, slot), at };
}

/**
 * @param {any} w the world
 * @param {{x: number, y: number}} at a point
 * @returns {number} the bearing of the point from the subject's heading, in (-PI, PI]
 */
function bearingTo(w, at) {
    const d = Math.atan2(at.y - w.y[0], at.x - w.x[0]) - w.angle[0];
    return Math.atan2(Math.sin(d), Math.cos(d));
}

describe('ahead and behind', () => {
    it.each(KIND_NAMES)('a %s dead ahead reads cosine 1 and sine 0, and dead behind cosine -1', (kind) => {
        const ahead = hitOf(scene(kind, { forward: 120, side: 0 }).row, kind);
        expect(ahead.strength).toBeGreaterThan(0);
        expect(ahead.cos).toBeCloseTo(1, 5);
        expect(ahead.sin).toBeCloseTo(0, 5);
        const behind = hitOf(scene(kind, { forward: -120, side: 0 }).row, kind);
        expect(behind.cos).toBeCloseTo(-1, 5);
        expect(Math.abs(behind.sin)).toBeLessThan(1e-5);
    });

    it('a wall dead ahead reads cosine 1, and dead behind cosine -1', () => {
        const w = stageSubject();
        const slot = addSubject(w, { at: { x: 2900, y: CENTRE } });
        expect(hitOf(brainRow(w, slot), 'wall').cos).toBeCloseTo(1, 5);
        w.angle[slot] = -Math.PI; // facing -x: the wall at x = 3000 is behind
        expect(hitOf(brainRow(w, slot), 'wall').cos).toBeCloseTo(-1, 5);
    });
});

describe('sign', () => {
    it.each(KIND_NAMES)('a %s on the positive-sine side comes nearer dead ahead after TURN above 0', (kind) => {
        for (const sign of [1, -1]) {
            const offset = { forward: 120 * Math.cos(RAY), side: sign * 120 * Math.sin(RAY) };
            const { w, row, at } = scene(kind, offset);
            expect(Math.sign(hitOf(row, kind).sin)).toBe(sign);
            const before = Math.abs(bearingTo(w, at));
            w.outputs[OUTPUT_INDEX.TURN] = sign;
            actAll(w);
            expect(Math.abs(bearingTo(w, at))).toBeLessThan(before);
        }
    });

    it.each([
        ['food', FORAGER, 1],
        ['threat', FORAGER, -1],
        ['prey', PREDATOR, 1],
    ])('the %s reflex of the skip block turns the right way', (kind, spec, direction) => {
        for (const sign of [1, -1]) {
            const { w } = scene(kind, { forward: 120 * Math.cos(RAY), side: sign * 120 * Math.sin(RAY) });
            const row = w.weights.subarray(0, w.layout.weightCount);
            row.fill(0);
            applyInstinct(row, w.layout, { weight: 1, canHunt: spec === PREDATOR, herdWary: 0 });
            brainRow(w, 0);
            forwardAll(w);
            expect(Math.sign(w.outputs[OUTPUT_INDEX.TURN]), `${kind} at ${sign}`).toBe(sign * direction);
        }
    });
});

describe('monotone', () => {
    it.each(KIND_NAMES)('strength of a %s rises as it nears', (kind) => {
        let last = 0;
        for (const forward of [280, 220, 160, 100, 60]) {
            const { w, row } = scene(kind, { forward, side: 0 });
            const { strength } = hitOf(row, kind);
            expect(strength).toBeGreaterThan(last);
            last = strength;
            if (kind === 'food') {
                expect(strength).toBeCloseTo(1 - (forward - 10) / viewOf(w, 0), 3); // the ray ends on the item's edge
            }
        }
    });

    it('the energy, size, temperature, timer, velocity and memory inputs move the way their labels say', () => {
        const w = stageSubject();
        const slot = addSubject(w);
        const read = (/** @type {number} */ k) => bodyInput(brainRow(w, slot), k);
        const maxEnergy = w.maxEnergyBySpec[FORAGER];
        w.energy[slot] = 0.25 * maxEnergy;
        const low = read(0);
        w.energy[slot] = 0.75 * maxEnergy;
        expect(read(0)).toBeGreaterThan(low);
        expect(read(0)).toBeCloseTo(0.75, 5);
        const small = read(4);
        w.size[slot] = 35;
        expect(read(4)).toBeGreaterThan(small);
        const cool = read(13);
        w.temperature[slot] += 2;
        expect(read(13)).toBeGreaterThan(cool);
        w.ateTimer[slot] = 0;
        expect(read(9)).toBe(1);
        w.ateTimer[slot] = 200;
        expect(read(9)).toBeLessThan(1);
        w.bittenTimer[slot] = 0;
        expect(read(10)).toBe(1);
        w.vx[slot] = 2;
        expect(read(1)).toBeCloseTo(2 / w.config.maxVelocity, 5);
        w.outputs[slot * OUTPUT_COUNT + OUTPUT_INDEX.MEMORY_A] = 0.5;
        expect(read(31)).toBe(0.5);
    });
});

describe('class', () => {
    it.each([
        ['kin and a threat', FORAGER, PREDATOR, true, 'kin'],
        ['a threat and prey', PREDATOR, PREDATOR, false, 'threat'],
        ['neither', FORAGER, FORAGER, false, 'other'],
    ])('a body that is %s lands on its first class only', (_name, subjectSpec, otherSpec, kin, channel) => {
        const w = stageSubject();
        const me = addSubject(w, { spec: subjectSpec });
        const other = addAgent(w, CENTRE + 120, CENTRE, 25);
        w.spec[other] = otherSpec;
        if (kin) {
            w.parentA[other] = w.genomeId[me];
        }
        const row = brainRow(w, me);
        for (const c of ['kin', 'threat', 'prey', 'other']) {
            expect(hitOf(row, c).strength > 0, `${c} for ${channel}`).toBe(c === channel);
        }
    });
});

describe('mirror, rotation and shift', () => {
    const base = { angle: 0, shift: { x: 0, y: 0 }, mirror: /** @type {1 | -1} */ (1) };

    /**
     * A mixed scene with no ties: food, a threat, a rock and a kin body, the subject moving and turning.
     * @param {{angle: number, shift: {x: number, y: number}, mirror: 1 | -1}} frame the subject's heading, a shift of
     *   the whole scene, and which side of the heading the scene stands on
     * @returns {Float32Array} the subject's pooled row
     */
    function mixed({ angle, shift, mirror }) {
        const w = stageSubject();
        const me = addSubject(w, { angle, at: { x: CENTRE + shift.x, y: CENTRE + shift.y } });
        for (const [kind, forward, side] of /** @type {const} */ ([
            ['food', 130, 60],
            ['threat', 150, -85],
            ['obstacle', 110, 30],
            ['kin', -140, 40],
        ])) {
            const p = worldPoint(w, me, { forward, side: mirror * side });
            KINDS[kind].put(w, p.x, p.y);
        }
        const v = worldPoint(w, me, { forward: 2, side: mirror });
        w.vx[me] = v.x - w.x[me];
        w.vy[me] = v.y - w.y[me];
        w.turnRate[me] = mirror * 0.1;
        return brainRow(w, me);
    }

    it('mirroring across the heading flips every sine and the two lateral inputs and nothing else', () => {
        const a = mixed(base);
        const b = mixed({ ...base, mirror: -1 });
        const sines = Array.from({ length: 18 }, (_, k) => 3 * k + 2);
        const flipped = new Set([...sines, POOLED_VALUES + 2, POOLED_VALUES + 3]);
        for (let k = 0; k < a.length; k++) {
            expect(b[k], `input ${k}`).toBeCloseTo(flipped.has(k) ? -a[k] : a[k], 4);
        }
    });

    it.each([
        ['rotated', { ...base, angle: 1 }],
        ['shifted', { ...base, shift: { x: 300, y: -200 } }],
        ['rotated and shifted', { ...base, angle: -2.5, shift: { x: -400, y: 350 } }],
    ])('a scene %s with its subject gives the same row', (_name, frame) => {
        const a = mixed(base);
        const b = mixed(frame);
        for (let k = 0; k < a.length; k++) {
            expect(b[k], `input ${k}`).toBeCloseTo(a[k], 3);
        }
    });
});
