import { describe, expect, it } from 'vitest';
import { mountHelp } from '../../../js/app/ui/help.js';
import { KEYMAP, shortcutLabel } from '../../../js/app/ui/keymap.js';
import { byClass, fakeDocument } from '../helpers/fake-dom.js';

describe('mountHelp', () => {
    it('lists every binding with its keys and what it does', () => {
        const doc = fakeDocument();
        const root = doc.createElement('div');
        expect(mountHelp(doc, root)).toBe(KEYMAP.length);
        const [list] = byClass(root, 'help-keys');
        expect(list.children).toHaveLength(KEYMAP.length * 2);
        expect(list.children[0].textContent).toBe(shortcutLabel(KEYMAP[0]));
        expect(list.children[1].textContent).toBe(KEYMAP[0].title);
    });
});
