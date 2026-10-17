import { describe, expect, it } from 'vitest';
import { createIcon, ICON_PATHS, iconPath } from '../../../js/app/ui/silhouette-icons.js';
import { SILHOUETTES } from '../../../js/app/renderer/agents-layer.js';
import { fakeDocument } from '../helpers/fake-dom.js';

describe('silhouette icons', () => {
    it('has a path for every specialisation the renderer draws', () => {
        expect(Object.keys(ICON_PATHS).sort()).toEqual(Object.keys(SILHOUETTES).sort());
    });

    it('falls back to the disc for an unknown name', () => {
        expect(iconPath('mystery')).toBe(ICON_PATHS.forager);
    });

    it('builds an svg with one filled path', () => {
        const svg = createIcon(fakeDocument(), { name: 'predator', color: 'red', size: 20 });
        expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
        expect(svg.getAttribute('width')).toBe('20');
        expect(svg.children[0].getAttribute('d')).toBe(ICON_PATHS.predator);
        expect(svg.children[0].getAttribute('fill')).toBe('red');
    });
});
