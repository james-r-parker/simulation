import { describe, expect, it } from 'vitest';
import { RENDER_FAILURE_TEXT, showRenderFailure } from '../../../js/app/ui/render-failure.js';

/** @returns {any} a container whose document makes plain elements */
function fakeContainer() {
    const children = /** @type {any[]} */ ([]);
    const container = {
        children,
        ownerDocument: {
            createElement: () =>
                /** @type {any} */ ({
                    style: {},
                    attributes: {},
                    setAttribute(/** @type {string} */ k, /** @type {string} */ v) {
                        this.attributes[k] = v;
                    },
                }),
        },
        appendChild: (/** @type {any} */ c) => children.push(c),
        querySelector: (/** @type {string} */ sel) => children.find((c) => `.${c.className}` === sel) ?? null,
    };
    return container;
}

describe('showRenderFailure', () => {
    it('shows the message once as an alert', () => {
        const container = fakeContainer();
        const box = /** @type {any} */ (showRenderFailure(container));
        expect(box.textContent).toBe(RENDER_FAILURE_TEXT);
        expect(box.attributes.role).toBe('alert');
        expect(showRenderFailure(container)).toBe(box);
        expect(container.children).toHaveLength(1);
        expect(RENDER_FAILURE_TEXT).toMatch(/WebGPU or WebGL2/);
    });
});
