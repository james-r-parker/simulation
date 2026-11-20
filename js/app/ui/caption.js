// The director's caption: one line naming the shot on screen, bottom centre, in its own node outside the HUD so it
// shows in TV mode while the HUD is hidden. `mountCaption` writes text and the `caption-on` class only when they change;
// the fade is a CSS transition on that class. It is a persistent node, so it takes the pixel shift.

/**
 * The era card: a title and up to three lines, shown for a few seconds every ten simulated minutes in TV mode. A
 * persistent node, so it takes the pixel shift.
 * @param {{createElement: (tag: string) => any}} doc the document
 * @param {{appendChild: (child: any) => void}} parent where the node goes
 * @returns {{element: any, show: (lines: readonly string[]) => void, hide: () => void}} the node; `show` writes the
 *   lines and fades it in, `hide` fades it out
 */
export function mountEraCard(doc, parent) {
    const element = doc.createElement('div');
    element.id = 'era-card';
    element.className = 'era-card';
    const title = doc.createElement('div');
    title.className = 'era-title';
    title.textContent = 'Ten minutes on';
    const body = doc.createElement('div');
    body.className = 'era-lines';
    element.appendChild(title);
    element.appendChild(body);
    parent.appendChild(element);
    return {
        element,
        show(lines) {
            body.textContent = lines.join('\n');
            element.classList.add('era-on');
        },
        hide() {
            element.classList.remove('era-on');
        },
    };
}

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
