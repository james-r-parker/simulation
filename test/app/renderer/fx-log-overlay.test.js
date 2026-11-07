import { describe, expect, it } from 'vitest';
import { createCameraController } from '../../../js/app/camera.js';
import { createFxBudget } from '../../../js/app/renderer/fx-budget.js';
import {
    createFxLog,
    LABEL_MS,
    LABELS,
    noteFx,
    updateFxLog,
    windowCounts,
} from '../../../js/app/renderer/fx-log-overlay.js';
import { createFxNames } from '../../../js/app/renderer/fx-names.js';
import { fakeDocument } from '../helpers/fake-dom.js';

const fakeElement = () => fakeDocument().createElement('div');

const NAMES = createFxNames({ effectKinds: { BITE: 3, DIED: 2 }, deathCauses: { EATEN: 1 }, bornCauses: {} });

/** @returns {any} an overlay on a fake document */
function build() {
    return createFxLog({ doc: fakeDocument(), parent: fakeElement(), names: NAMES });
}

describe('fx log overlay', () => {
    it('labels each effect in a reused pool and counts it by name', () => {
        const log = build();
        expect(log.labels).toHaveLength(LABELS);
        for (let i = 0; i < LABELS + 2; i++) {
            noteFx(log, { kind: 3, x: i, y: 0, c: 0, d: 0 }, 1000);
        }
        expect(noteFx(log, { kind: 2, x: 0, y: 0, c: 1 << 8, d: 0 }, 1500)).toBe('EATEN');
        expect(log.next).toBe(3);
        expect(windowCounts(log)).toEqual([
            ['BITE', LABELS + 2],
            ['EATEN', 1],
        ]);
    });

    it('places a fresh label at its screen spot, fades it out by LABEL_MS, and writes the table', () => {
        const log = build();
        const camera = createCameraController({
            canvas: /** @type {any} */ ({ width: 200, height: 100 }),
            world: { width: 2000, height: 1000 },
        });
        camera.x = 100;
        camera.y = 50;
        camera.zoom = 1;
        noteFx(log, { kind: 3, x: 110, y: 50, c: 0, d: 0 }, 5000);
        updateFxLog(log, { camera, nowMs: 5000, cssScale: 0.5, budget: createFxBudget() });
        const el = log.labels[0].el;
        expect(el.style.opacity).toBe('1');
        expect(el.style.transform).toBe('translate(55px, 25px)');
        expect(log.table.textContent).toContain('BITE');
        expect(log.table.textContent).toContain('combat');
        updateFxLog(log, { camera, nowMs: 5000 + LABEL_MS, cssScale: 0.5 });
        expect(el.style.opacity).toBe('0');
    });

    it('forgets counts older than the window', () => {
        const log = build();
        noteFx(log, { kind: 3, x: 0, y: 0, c: 0, d: 0 }, 1000);
        const camera = createCameraController({
            canvas: /** @type {any} */ ({ width: 10, height: 10 }),
            world: { width: 10, height: 10 },
        });
        updateFxLog(log, { camera, nowMs: 1000, cssScale: 1 });
        updateFxLog(log, { camera, nowMs: 61500, cssScale: 1 });
        expect(windowCounts(log)).toEqual([['BITE', 0]]);
    });
});
