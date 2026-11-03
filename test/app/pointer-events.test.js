import { describe, expect, it } from 'vitest';
import { listenPointers } from '../../js/app/pointer-events.js';

/**
 * @returns {{calls: any[][], captured: number[], fire: (on: 'canvas' | 'target', type: string, e: any) => void}} the
 *   wiring over fake canvas and window targets, recording every handler call
 */
function setup() {
    /** @type {Record<string, (e: any) => void>} */
    const handlers = {};
    const on = (/** @type {string} */ name) => ({
        addEventListener: (/** @type {string} */ type, /** @type {(e: any) => void} */ fn) => {
            handlers[`${name}:${type}`] = fn;
        },
    });
    /** @type {any[][]} */
    const calls = [];
    /** @type {number[]} */
    const captured = [];
    const record =
        (/** @type {string} */ name) =>
        (/** @type {any[]} */ ...args) =>
            calls.push([name, ...args]);
    const canvas = { ...on('canvas'), setPointerCapture: (/** @type {number} */ id) => captured.push(id) };
    listenPointers({
        canvas,
        target: on('target'),
        input: {
            down: record('down'),
            move: record('move'),
            up: record('up'),
            cancel: record('cancel'),
            wheel: record('wheel'),
        },
        iface: { noteInput: () => true, pointer: () => {} },
        toDevice: (e) => ({ x: e.clientX * 2, y: e.clientY * 2 }),
    });
    return { calls, captured, fire: (target, type, e) => handlers[`${target}:${type}`](e) };
}

describe('listenPointers', () => {
    it('passes each pointer id through, marks a touch and captures the pointer on the canvas', () => {
        const { calls, captured, fire } = setup();
        fire('canvas', 'pointerdown', { pointerId: 7, pointerType: 'touch', clientX: 1, clientY: 2 });
        fire('canvas', 'pointerdown', { pointerId: 1, pointerType: 'mouse', clientX: 3, clientY: 4 });
        fire('target', 'pointermove', { pointerId: 7, clientX: 5, clientY: 6 });
        fire('target', 'pointerup', { pointerId: 7, clientX: 5, clientY: 6 });
        expect(captured).toEqual([7, 1]);
        expect(calls).toEqual([
            ['down', 2, 4, 7, true],
            ['down', 6, 8, 1, false],
            ['move', 10, 12, 7],
            ['up', 10, 12, 7],
        ]);
    });

    it('turns a pointercancel or a lost capture into a cancel of that pointer', () => {
        const { calls, fire } = setup();
        fire('target', 'pointercancel', { pointerId: 9, clientX: 0, clientY: 0 });
        fire('canvas', 'lostpointercapture', { pointerId: 4, clientX: 0, clientY: 0 });
        expect(calls).toEqual([
            ['cancel', 9],
            ['cancel', 4],
        ]);
    });
});
