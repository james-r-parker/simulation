// The first-visit title card and the legend it shares with the help drawer: one sentence about the world, the five
// silhouettes captioned with their specialisation names, the rule for reading the picture and what to watch for.

import { createIcon } from './silhouette-icons.js';

/** The card dismisses itself after this long, in ms. */
export const TITLE_CARD_MS = 12000;

/**
 * @typedef {object} TitleCardView
 * @property {string} sentence what the world is
 * @property {{name: string}[]} legend the specialisations, each drawn as its silhouette
 * @property {string} caption how to read a blob
 * @property {string} watch what to look for
 */

/**
 * @param {{name: string}[]} specs `ready.info.specs`
 * @returns {TitleCardView} the card's content
 */
export function titleCardView(specs) {
    return {
        sentence: 'Tiny-brained blobs eat, hunt, flee and breed, and their genes evolve.',
        legend: specs.map((spec) => ({ name: spec.name })),
        caption: 'shape = role, colour = family, brightness = energy',
        watch: 'watch for: chases, bites, smoke',
    };
}

/**
 * Writes the legend (the silhouettes with their names, the caption and the watch-for line) into a node.
 * @param {{createElement: (tag: string) => any, createElementNS: (ns: string, tag: string) => any}} doc the document
 * @param {any} parent the node to fill; its children are replaced
 * @param {TitleCardView} view the content
 * @returns {void}
 */
export function mountLegend(doc, parent, view) {
    parent.replaceChildren();
    const row = doc.createElement('div');
    row.className = 'legend-row';
    for (const item of view.legend) {
        const cell = doc.createElement('span');
        cell.className = 'legend-item';
        cell.appendChild(createIcon(doc, { name: item.name, size: 20 }));
        const name = doc.createElement('span');
        name.textContent = item.name;
        cell.appendChild(name);
        row.appendChild(cell);
    }
    parent.appendChild(row);
    for (const [className, text] of [
        ['legend-caption', view.caption],
        ['legend-watch', view.watch],
    ]) {
        const line = doc.createElement('p');
        line.className = className;
        line.textContent = text;
        parent.appendChild(line);
    }
}

/**
 * @param {{createElement: (tag: string) => any, createElementNS: (ns: string, tag: string) => any}} doc the document
 * @param {{appendChild: (child: any) => void}} root where the card goes
 * @returns {{element: any, show: (view: TitleCardView, nowMs: number) => void, hide: () => boolean,
 *   visible: () => boolean, expired: (nowMs: number) => boolean}} the card: `show` fills and shows it; `hide` hides it
 *   and says whether it was showing; `expired` is true once it has been up for `TITLE_CARD_MS`
 */
export function mountTitleCard(doc, root) {
    const element = doc.createElement('div');
    element.className = 'title-card';
    element.hidden = true;
    root.appendChild(element);
    let shownAt = 0;
    return {
        element,
        visible: () => !element.hidden,
        expired: (nowMs) => !element.hidden && nowMs - shownAt >= TITLE_CARD_MS,
        show(view, nowMs) {
            element.replaceChildren();
            const sentence = doc.createElement('p');
            sentence.className = 'title-card-sentence';
            sentence.textContent = view.sentence;
            element.appendChild(sentence);
            const legend = doc.createElement('div');
            legend.className = 'legend';
            mountLegend(doc, legend, view);
            element.appendChild(legend);
            element.hidden = false;
            shownAt = nowMs;
        },
        hide() {
            const was = !element.hidden;
            element.hidden = true;
            return was;
        },
    };
}
