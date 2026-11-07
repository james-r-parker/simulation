import { describe, expect, it } from 'vitest';
import { createInterpolated } from '../../../js/app/interpolate.js';
import { createPursuits, pursuitRules } from '../../../js/app/pursuit.js';
import {
    CHASE_ALPHA,
    CHASE_DASHES,
    CHASE_DASHES_LOW,
    createChaseLayer,
    pushTether,
    stepChase,
} from '../../../js/app/renderer/chase-layer.js';
import { createLineBuffer } from '../../../js/app/renderer/line-buffer.js';

const info = {
    maxVelocity: 10,
    specs: [
        { index: 0, canHunt: false },
        { index: 1, canHunt: true },
    ],
};

/** @returns {ReturnType<typeof createInterpolated>} a hunter at the origin and prey 200 units ahead, running away */
function chaseFrame() {
    const a = createInterpolated(4);
    a.count = 2;
    a.size[0] = 10;
    a.speed[0] = 8;
    a.spec[0] = 1;
    a.x[1] = 200;
    a.size[1] = 5;
    a.speed[1] = 6;
    return a;
}

describe('pushTether', () => {
    it('draws one segment per dash, brighter towards the prey and with the gap', () => {
        const lines = createLineBuffer(CHASE_DASHES);
        pushTether(lines, { ax: 0, ay: 0, bx: 100, by: 0 }, { closeness: 1, dashes: CHASE_DASHES });
        expect(lines.vertices).toBe(CHASE_DASHES * 2);
        expect(lines.color[3]).toBeLessThan(lines.color[(CHASE_DASHES * 2 - 1) * 4 + 3]);
        expect(lines.color[(CHASE_DASHES * 2 - 1) * 4 + 3]).toBeCloseTo(CHASE_ALPHA, 5);
        const far = createLineBuffer(CHASE_DASHES);
        pushTether(far, { ax: 0, ay: 0, bx: 100, by: 0 }, { closeness: 0, dashes: CHASE_DASHES });
        expect(far.color[(CHASE_DASHES * 2 - 1) * 4 + 3]).toBeLessThan(CHASE_ALPHA * 0.3);
    });
});

describe('stepChase', () => {
    it('starts at the hunter nose and stops at the prey edge', () => {
        const lines = createLineBuffer(CHASE_DASHES * 4);
        const state = { pursuits: createPursuits(), rules: pursuitRules(info) };
        expect(stepChase(chaseFrame(), state, { lines, dashes: CHASE_DASHES })).toBe(1);
        expect(lines.position[0]).toBeGreaterThanOrEqual(10);
        const lastX = lines.position[(lines.vertices - 1) * 3];
        expect(lastX).toBeLessThanOrEqual(195);
    });

    it('clears the buffer when nothing is pursued', () => {
        const lines = createLineBuffer(CHASE_DASHES * 4);
        const state = { pursuits: createPursuits(), rules: pursuitRules(info) };
        stepChase(chaseFrame(), state, { lines, dashes: CHASE_DASHES });
        const quiet = chaseFrame();
        quiet.speed[0] = 0;
        expect(stepChase(quiet, state, { lines, dashes: CHASE_DASHES })).toBe(0);
        expect(lines.vertices).toBe(0);
    });
});

describe('stepChase with overlapping bodies', () => {
    it('draws no tether when the bodies touch', () => {
        const lines = createLineBuffer(CHASE_DASHES * 4);
        const state = { pursuits: createPursuits(), rules: pursuitRules(info) };
        const a = chaseFrame();
        a.x[1] = 12;
        expect(stepChase(a, state, { lines, dashes: CHASE_DASHES })).toBe(1);
        expect(lines.vertices).toBe(0);
    });
});

describe('createChaseLayer', () => {
    it('draws by tier and hides at level 2 or when the item is off', () => {
        const layer = createChaseLayer({ info });
        const frame = /** @type {any} */ ({ agents: chaseFrame() });
        layer.setLook?.({ chase: 0 });
        layer.update?.(frame);
        expect(layer.object.geometry.drawRange.count).toBe(CHASE_DASHES * 2);
        layer.setLook?.({ chase: 1 });
        layer.update?.(frame);
        expect(layer.object.geometry.drawRange.count).toBe(CHASE_DASHES_LOW * 2);
        for (const tier of [-1, 2]) {
            layer.setLook?.({ chase: tier });
            expect(layer.object.visible).toBe(false);
        }
        layer.dispose?.();
    });
});
