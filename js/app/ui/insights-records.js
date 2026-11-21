// The insights drawer's Records tab: this world's longest life, most kills, most children and longest chase, each with
// its holder. A click on a record whose holder is alive reports the row's target and the page follows it.

import { mountNote, mountTable } from './insights-table.js';

/** The columns of the Records tab's table. */
export const RECORD_COLUMNS = Object.freeze(['record', 'value', 'holder']);

/**
 * @param {{createElement: (tag: string) => any}} doc the document
 * @param {any} panel the tab's element
 * @param {import('./insights.js').InsightsHooks} hooks `onPick` hears a click on a record whose holder is alive
 * @returns {{update: (rows: readonly import('./insights-table.js').TableRow[]) => void}} `update` shows the record rows
 */
export function mountRecordsTab(doc, panel, hooks) {
    const table = mountTable(doc, panel, {
        title: "This world's records",
        columns: RECORD_COLUMNS,
        onPick: hooks.onPick,
    });
    mountNote(doc, panel, 'Click a record to follow its holder, while the holder is alive.');
    return { update: (rows) => table.update(rows) };
}
