// The insights drawer's Families tab: the largest lineages, each row with its family colour. A click on a row reports
// its target (the family's oldest member) and the page follows it.

import { mountNote, mountTable } from './insights-table.js';

/**
 * @param {{createElement: (tag: string) => any}} doc the document
 * @param {any} panel the tab's element
 * @param {import('./insights.js').InsightsHooks} hooks `onPick` hears a click on a family
 * @returns {{update: (rows: readonly import('./insights-table.js').TableRow[]) => void}} `update` shows the family rows
 */
export function mountFamiliesTab(doc, panel, hooks) {
    const table = mountTable(doc, panel, {
        title: 'The 12 largest families',
        columns: ['family', 'size', 'oldest', 'mix', 'kills', 'deepest'],
        onPick: hooks.onPick,
    });
    mountNote(doc, panel, 'Click a family to follow its oldest member.');
    return { update: (rows) => table.update(rows) };
}
