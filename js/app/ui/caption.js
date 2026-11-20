// The director's caption: one line naming the shot on screen, bottom centre, in its own node outside the HUD so it
// shows in TV mode while the HUD is hidden. `mountCaption` writes text and the `caption-on` class only when they change;
// the fade is a CSS transition on that class. It is a persistent node, so it takes the pixel shift.

/**
 * @param {{createElement: (tag: string) => any}} doc the document
 * @param {{appendChild: (child: any) => void}} parent where the node goes
 * @returns {{element: any, set: (text: string) => boolean}} the node and `set`, which shows the text (empty hides the
 *   caption) and returns whether anything changed
 */
export function mountCaption(doc, parent) {
    const element = doc.createElement('div');
    element.id = 'caption';
    element.className = 'caption';
    element.setAttribute('aria-live', 'polite');
    parent.appendChild(element);
    let shown = '';
    return {
        element,
        set(text) {
            if (text === shown) {
                return false;
            }
            shown = text;
            if (text !== '') {
                element.textContent = text;
            }
            element.classList.toggle('caption-on', text !== '');
            return true;
        },
    };
}
