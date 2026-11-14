// The message shown when the GPU renderer cannot start or keeps losing its device.

/** The message text. */
export const RENDER_FAILURE_TEXT = 'This browser could not start the GPU renderer (WebGPU or WebGL2).';

/**
 * Shows the message once over the canvas container.
 * @param {HTMLElement} container the canvas container
 * @returns {HTMLElement} the message element (the existing one when shown before)
 */
export function showRenderFailure(container) {
    const existing = container.querySelector('.render-failure');
    if (existing !== null) {
        return /** @type {HTMLElement} */ (existing);
    }
    const box = container.ownerDocument.createElement('div');
    box.className = 'render-failure';
    box.setAttribute('role', 'alert');
    box.textContent = RENDER_FAILURE_TEXT;
    box.style.cssText =
        'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;background:#000;font:16px system-ui,sans-serif;text-align:center;padding:16px';
    container.appendChild(box);
    return box;
}
