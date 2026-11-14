import { describe, expect, it } from 'vitest';
import { createCameraController } from '../../../js/app/camera.js';
import { createMomentLog, MOMENT_LOG_SIZE } from '../../../js/app/director/moment-log.js';
import { PALETTE } from '../../../js/app/renderer/colors.js';
import { createFxPointersLayer, packPointers, POINTER_MS } from '../../../js/app/renderer/fx-pointers.js';

/**
 * @param {[number, number, string, number][]} entries x, y, kind and wall time of each moment
 * @returns {any} a moment log holding them
 */
function logOf(entries) {
    const log = createMomentLog();
    entries.forEach(([x, y, kind, atMs], i) => {
        log.x[i] = x;
        log.y[i] = y;
        log.kind[i] = kind;
        log.atMs[i] = atMs;
    });
    log.count = entries.length;
    return log;
}

const VIEW = { left: 0, right: 1000, top: 1000, bottom: 0 };
const OUT = () => ({ pose: new Float32Array(MOMENT_LOG_SIZE * 4), color: new Float32Array(MOMENT_LOG_SIZE * 4) });

describe('packPointers', () => {
    it('points at a recent moment off view from the view edge, and skips one in view or too old', () => {
        const log = logOf([
            [3000, 500, 'kill', 900],
            [500, 500, 'kill', 900],
            [-2000, 500, 'stampede', 1000 - POINTER_MS - 1],
        ]);
        const out = OUT();
        expect(packPointers(log, { view: VIEW, zoom: 1, nowMs: 1000 }, out)).toBe(1);
        expect(out.pose[0]).toBeCloseTo(1000 - 36);
        expect(out.pose[1]).toBeCloseTo(500);
        expect(out.pose[2]).toBeCloseTo(0);
        expect(out.color[0]).toBeCloseTo(PALETTE.eatenFlash[0]);
    });

    it('fades over POINTER_MS and colours other moments cool white', () => {
        const out = OUT();
        packPointers(logOf([[500, -900, 'stampede', 0]]), { view: VIEW, zoom: 2, nowMs: POINTER_MS / 2 }, out);
        expect(out.color[3]).toBeCloseTo(0.6);
        expect(out.color[0]).toBeCloseTo(PALETTE.coolWhite[0]);
        expect(out.pose[2]).toBeCloseTo(-Math.PI / 2);
    });
});

describe('packPointers edges and reuse', () => {
    it('counts a moment exactly on the view edge as in view, and one just past it as off view', () => {
        const at = (/** @type {number} */ x) =>
            packPointers(logOf([[x, 500, 'kill', 0]]), { view: VIEW, zoom: 1, nowMs: 1 }, OUT());
        expect(at(1000)).toBe(0);
        expect(at(1000.5)).toBe(1);
    });

    it('writes into the same arrays over 10000 packs', () => {
        const log = logOf([
            [3000, 500, 'kill', 0],
            [-50, 900, 'stampede', 0],
        ]);
        const out = OUT();
        const { pose, color } = out;
        for (let i = 0; i < 10000; i++) {
            packPointers(log, { view: VIEW, zoom: 1 + (i % 3), nowMs: i % POINTER_MS }, out);
        }
        expect(out.pose).toBe(pose);
        expect(out.color).toBe(color);
        expect(pose.length).toBe(MOMENT_LOG_SIZE * 4);
    });
});

describe('the pointer layer', () => {
    it('draws an arrow for a recent moment off screen and none for one on screen', () => {
        const moments = createMomentLog();
        const layer = createFxPointersLayer({ moments });
        const camera = createCameraController({
            canvas: { width: 400, height: 300 },
            world: { width: 4000, height: 3000 },
        });
        layer.update?.(/** @type {any} */ ({ camera, nowMs: 0 }));
        expect(layer.object.children[0].geometry.instanceCount).toBe(0);
        layer.dispose();
        expect(MOMENT_LOG_SIZE).toBeGreaterThan(0);
        expect(POINTER_MS).toBeGreaterThan(0);
        expect(PALETTE.coolWhite).toBeDefined();
    });
});
