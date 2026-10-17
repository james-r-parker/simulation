// The help drawer body: every shortcut from `KEYMAP`, one row each, so the help can never disagree with the keys.

import { KEYMAP, shortcutLabel } from './keymap.js';

/**
 * @param {{createElement: (tag: string) => any}} doc the document
 * @param {{appendChild: (child: any) => void}} root the help drawer body
 * @returns {number} the rows written
 */
export function mountHelp(doc, root) {
    const heading = doc.createElement('h3');
    heading.textContent = 'Keyboard';
    root.appendChild(heading);
    const list = doc.createElement('dl');
    list.className = 'help-keys';
    root.appendChild(list);
    for (const binding of KEYMAP) {
        const keys = doc.createElement('dt');
        keys.textContent = shortcutLabel(binding);
        const what = doc.createElement('dd');
        what.textContent = binding.title;
        list.appendChild(keys);
        list.appendChild(what);
    }
    return KEYMAP.length;
}
