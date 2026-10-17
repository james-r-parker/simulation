import { describe, expect, it } from 'vitest';
import { mountLegend, mountTitleCard, TITLE_CARD_MS, titleCardView } from '../../../js/app/ui/title-card.js';
import { byClass, fakeDocument } from '../helpers/fake-dom.js';

const SPECS = [
    { name: 'predator' },
    { name: 'forager' },
    { name: 'reproducer' },
    { name: 'scout' },
    { name: 'defender' },
];

describe('titleCardView', () => {
    it('has the sentence, the five specialisations, the reading rule and the watch-for line', () => {
        const view = titleCardView(SPECS);
        expect(view.sentence).toBe('Tiny-brained blobs eat, hunt, flee and breed, and their genes evolve.');
        expect(view.legend.map((l) => l.name)).toEqual(SPECS.map((s) => s.name));
        expect(view.caption).toBe('shape = role, colour = family, brightness = energy');
        expect(view.watch).toBe('watch for: chases, bites, smoke');
    });
});

describe('mountLegend', () => {
    it('draws each silhouette with its name, and replaces what was there', () => {
        const doc = fakeDocument();
        const parent = doc.createElement('div');
        mountLegend(doc, parent, titleCardView(SPECS));
        mountLegend(doc, parent, titleCardView(SPECS));
        const items = byClass(parent, 'legend-item');
        expect(items).toHaveLength(5);
        expect(items[0].children[0].tagName).toBe('SVG');
        expect(items.map((i) => i.children[1].textContent)).toEqual(SPECS.map((s) => s.name));
        expect(byClass(parent, 'legend-caption')[0].textContent).toContain('shape = role');
        expect(byClass(parent, 'legend-watch')).toHaveLength(1);
    });
});

describe('mountTitleCard', () => {
    it('starts hidden, shows with the sentence and legend, and hides on demand reporting whether it was up', () => {
        const doc = fakeDocument();
        const root = doc.createElement('div');
        const card = mountTitleCard(doc, root);
        expect(card.visible()).toBe(false);
        expect(card.hide()).toBe(false);
        card.show(titleCardView(SPECS), 1000);
        expect(card.visible()).toBe(true);
        expect(byClass(card.element, 'title-card-sentence')[0].textContent).toMatch(/^Tiny-brained/);
        expect(byClass(card.element, 'legend-item')).toHaveLength(5);
        expect(card.hide()).toBe(true);
        expect(card.visible()).toBe(false);
    });

    it('expires 12 s after it was shown, and only while it is up', () => {
        const doc = fakeDocument();
        const card = mountTitleCard(doc, doc.createElement('div'));
        expect(card.expired(99999)).toBe(false);
        card.show(titleCardView(SPECS), 5000);
        expect(card.expired(5000 + TITLE_CARD_MS - 1)).toBe(false);
        expect(card.expired(5000 + TITLE_CARD_MS)).toBe(true);
        card.hide();
        expect(card.expired(99999)).toBe(false);
    });
});
