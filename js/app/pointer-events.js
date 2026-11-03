// Turns the canvas and window pointer events into `createPointerInput` calls: each pointer by its `pointerId`, a touch
// marked as one, the canvas capturing a pointer it saw go down, and `pointercancel` (a phone taking the gesture for
// itself) or a lost capture dropping the pointer instead of leaving it pressed.

/**
 * @typedef {{pointerId: number, pointerType?: string, clientX: number, clientY: number}} PointerLike
 */

/**
 * @param {{canvas: {addEventListener: (type: string, fn: (e: any) => void) => void,
 *   setPointerCapture?: (id: number) => void}, target: {addEventListener: (type: string, fn: (e: any) => void) => void},
 *   input: import('./pointer-input.js').PointerInput,
 *   iface: {noteInput: (event: import('./idle.js').InputEvent) => boolean, pointer: (x: number, y: number) => void},
 *   toDevice: (e: PointerLike) => {x: number, y: number}}} wiring the canvas, the window, the pointer handlers, the
 *   interface that hears every input and the client-to-device mapper
 * @returns {void}
 */
export function listenPointers({ canvas, target, input, iface, toDevice }) {
    canvas.addEventListener('pointerdown', (/** @type {PointerLike} */ e) => {
        iface.noteInput({ type: 'pointerdown' });
        canvas.setPointerCapture?.(e.pointerId);
        const at = toDevice(e);
        input.down(at.x, at.y, e.pointerId, e.pointerType === 'touch');
    });
    target.addEventListener('pointermove', (/** @type {PointerLike} */ e) => {
        iface.noteInput({ type: 'pointermove', x: e.clientX, y: e.clientY });
        iface.pointer(e.clientX, e.clientY);
        const at = toDevice(e);
        input.move(at.x, at.y, e.pointerId);
    });
    target.addEventListener('pointerup', (/** @type {PointerLike} */ e) => {
        const at = toDevice(e);
        input.up(at.x, at.y, e.pointerId);
    });
    target.addEventListener('pointercancel', (/** @type {PointerLike} */ e) => input.cancel(e.pointerId));
    canvas.addEventListener('lostpointercapture', (/** @type {PointerLike} */ e) => input.cancel(e.pointerId));
}
