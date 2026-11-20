// The page's listeners: the keys, the pointer and the wheel, and the canvas size observer. A browser shell kept out of
// `main.js`; test/browser/app.spec.js covers it.

import { clipSupported } from './capture.js';
import { listenPointers } from './pointer-events.js';
import { canvasPixelSize } from './renderer/canvas-size.js';
import { actionForKey } from './ui/keymap.js';

/**
 * Wires the keys and the pointer.
 * @param {{canvas: HTMLCanvasElement, perform: (action: string) => void, input: ReturnType<typeof import('./pointer-input.js').createPointerInput>,
 *   iface: ReturnType<typeof import('./interface.js').createInterface>, toDevice: (e: {clientX: number, clientY: number}) => {x: number, y: number}}} wiring the canvas,
 *   the action runner, the pointer handlers, the interface that hears every input and the client-to-device mapper
 * @returns {void}
 */
export function listen({ canvas, perform, input, iface, toDevice }) {
    window.addEventListener('keydown', (e) => {
        iface.noteInput({ type: 'keydown' });
        const action = actionForKey(e, { clip: clipSupported(globalThis.MediaRecorder) });
        if (action !== null) {
            e.preventDefault();
            perform(action);
        }
    });
    listenPointers({ canvas, target: window, input, iface, toDevice });
    canvas.addEventListener(
        'wheel',
        (e) => {
            e.preventDefault();
            iface.noteInput({ type: 'wheel' });
            input.wheel(e.deltaY, toDevice(e).x, toDevice(e).y);
        },
        { passive: false },
    );
}

/**
 * @param {HTMLElement} container the canvas parent
 * @param {(size: {width: number, height: number}) => void} onSize called with the canvas size in device pixels
 * @returns {void}
 */
export function observeSize(container, onSize) {
    const observer = new ResizeObserver((entries) => onSize(canvasPixelSize(entries[0], container, devicePixelRatio)));
    try {
        observer.observe(container, { box: 'device-pixel-content-box' });
    } catch {
        observer.observe(container);
    }
}
