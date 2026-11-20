import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../js/app/pointer-events.js', () => ({ listenPointers: vi.fn() }));

const { listen, observeSize } = await import('../../js/app/page-listen.js');

/** @returns {any} a fake window and canvas that keep their listeners */
function setup() {
    const handlers = /** @type {Record<string, Function>} */ ({});
    const canvasHandlers = /** @type {Record<string, Function>} */ ({});
    vi.stubGlobal('window', {
        addEventListener: (/** @type {string} */ t, /** @type {Function} */ f) => (handlers[t] = f),
    });
    const canvas = {
        addEventListener: (/** @type {string} */ t, /** @type {Function} */ f) => (canvasHandlers[t] = f),
    };
    const calls = /** @type {any[]} */ ([]);
    listen({
        canvas: /** @type {any} */ (canvas),
        perform: (a) => calls.push(['perform', a]),
        input: /** @type {any} */ ({ wheel: (/** @type {number} */ dy) => calls.push(['wheel', dy]) }),
        iface: /** @type {any} */ ({ noteInput: (/** @type {any} */ e) => calls.push(['input', e.type]) }),
        toDevice: () => ({ x: 1, y: 2 }),
    });
    return { handlers, canvasHandlers, calls };
}

afterEach(() => vi.unstubAllGlobals());

describe('listen', () => {
    it('tells the interface about a key and runs the action it is bound to', () => {
        const { handlers, calls } = setup();
        const e = { code: 'KeyF', preventDefault: () => calls.push(['prevent']) };
        handlers.keydown(e);
        expect(calls).toEqual([['input', 'keydown'], ['prevent'], ['perform', 'follow']]);
    });

    it('notes an unbound key as input and runs nothing', () => {
        const { handlers, calls } = setup();
        handlers.keydown({ code: 'KeyZ', preventDefault: () => calls.push(['prevent']) });
        expect(calls).toEqual([['input', 'keydown']]);
    });

    it('sends the wheel to the pointer input as input', () => {
        const { canvasHandlers, calls } = setup();
        canvasHandlers.wheel({ deltaY: 3, clientX: 0, clientY: 0, preventDefault() {} });
        expect(calls).toEqual([
            ['input', 'wheel'],
            ['wheel', 3],
        ]);
    });
});

describe('observeSize', () => {
    it('falls back to the plain content box where the device pixel box is refused', () => {
        const observed = /** @type {any[]} */ ([]);
        class Refusing {
            observe(/** @type {any} */ target, /** @type {any} */ options) {
                observed.push(options);
                if (options !== undefined) {
                    throw new Error('unsupported box');
                }
            }
        }
        vi.stubGlobal('ResizeObserver', Refusing);
        observeSize(/** @type {any} */ ({}), () => {});
        expect(observed).toEqual([{ box: 'device-pixel-content-box' }, undefined]);
    });

    it('reports the canvas size when the observer fires', () => {
        const seen = /** @type {any[]} */ ([]);
        class FakeObserver {
            /** @param {Function} cb */
            constructor(cb) {
                this.cb = cb;
                seen.push(this);
            }
            observe() {}
        }
        vi.stubGlobal('ResizeObserver', FakeObserver);
        vi.stubGlobal('devicePixelRatio', 1);
        const sizes = /** @type {any[]} */ ([]);
        observeSize(/** @type {any} */ ({ clientWidth: 100, clientHeight: 50 }), (size) => sizes.push(size));
        seen[0].cb([
            {
                contentRect: { width: 100, height: 50 },
                devicePixelContentBoxSize: [{ inlineSize: 200, blockSize: 100 }],
            },
        ]);
        expect(sizes).toHaveLength(1);
        expect(sizes[0]).toMatchObject({ width: expect.any(Number), height: expect.any(Number) });
    });
});
