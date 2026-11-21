// The night dim's one element: a black layer over the page (the HUD included), as opaque as the dim is deep. Pure black
// mixed over the picture is the picture times the brightness, on either graphics backend and with no extra pass.

/**
 * @param {Document} doc the document
 * @param {HTMLElement} parent where the layer goes: the page body
 * @returns {{set: (level: number) => void, element: HTMLElement}} `set` takes the brightness, 1 for none; the
 *   element ignores the pointer and is hidden at 1
 */
export function mountNightDim(doc, parent) {
    const element = doc.createElement('div');
    element.id = 'night-dim';
    Object.assign(element.style, {
        position: 'fixed',
        inset: '0',
        background: '#000',
        pointerEvents: 'none',
        zIndex: '2147483000',
        display: 'none',
    });
    element.setAttribute('aria-hidden', 'true');
    parent.appendChild(element);
    return {
        element,
        set(level) {
            element.style.display = level >= 1 ? 'none' : 'block';
            element.style.opacity = String(1 - level);
        },
    };
}
