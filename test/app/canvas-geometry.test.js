import { describe, expect, it } from 'vitest';
import { clientToDevice, deviceToClient, devicePerCss } from '../../js/app/canvas-geometry.js';

/**
 * @param {boolean} scene whether the scene exists
 * @returns {any} a page whose 100 x 50 CSS canvas at (10, 20) is drawn at 300 x 150 device px
 */
function page(scene) {
    return {
        size: { width: 300, height: 150 },
        deps: {
            scene: scene
                ? { canvas: { getBoundingClientRect: () => ({ left: 10, top: 20, width: 100, height: 50 }) } }
                : null,
        },
    };
}

describe('canvas geometry', () => {
    it('maps client to device and back', () => {
        const app = page(true);
        expect(clientToDevice(app, { x: 60, y: 45 })).toEqual({ x: 150, y: 75 });
        expect(deviceToClient(app, { x: 150, y: 75 })).toEqual({ x: 60, y: 45 });
    });

    it('reports the device pixels per CSS pixel', () => {
        expect(devicePerCss(page(true))).toBe(3);
    });

    it('has safe answers before the scene exists', () => {
        const app = page(false);
        expect(clientToDevice(app, { x: 1, y: 2 })).toEqual({ x: -1, y: -1 });
        expect(deviceToClient(app, { x: 1, y: 2 })).toEqual({ x: 1, y: 2 });
        expect(devicePerCss(app)).toBe(1);
    });
});
