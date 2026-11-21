// The insights drawer's Export tab, as data: the drawer's tables as CSV, and the command that replays the world on
// screen (`npm run replay`), from the same debug bundle the `B` key downloads. Pure.

import { appLog } from './app-log.js';
import { buildDebugBundle } from './debug-bundle.js';
import { FAMILY_COLUMNS } from './ui/insights-families.js';
import { RECORD_COLUMNS } from './ui/insights-records.js';
import { sceneTableRows, SCENE_COLUMNS } from './ui/insights-scenes.js';
import { NO_REPLAY } from './ui/insights-export.js';
import { FLOW_COLUMNS, POPULATION_COLUMNS, READING_COLUMNS } from './ui/insights-world.js';

/**
 * @typedef {object} ExportTable
 * @property {string} title the table's name
 * @property {readonly string[]} header its column headings
 * @property {readonly (readonly string[])[]} rows its rows as text
 */

/**
 * @param {Record<string, any>} view the drawer's view (`world`, `scenes`, `families`, `records`)
 * @returns {ExportTable[]} every table the drawer shows, in tab order; a tab with nothing yet gives an empty table
 */
export function exportTables(view) {
    const cells = (/** @type {{cells: string[]}[]} */ rows) => rows.map((r) => r.cells);
    return [
        { title: 'world readings', header: READING_COLUMNS, rows: view.world.readings },
        { title: 'population by type', header: POPULATION_COLUMNS, rows: cells(view.world.population) },
        { title: 'births per season', header: FLOW_COLUMNS, rows: cells(view.world.births) },
        { title: 'deaths per season', header: FLOW_COLUMNS, rows: cells(view.world.deaths) },
        { title: 'scenes', header: SCENE_COLUMNS, rows: cells(sceneTableRows(view.scenes)) },
        { title: 'families', header: FAMILY_COLUMNS, rows: cells(view.families) },
        { title: 'records', header: RECORD_COLUMNS, rows: cells(view.records) },
    ];
}

/**
 * @param {string} field a cell's text
 * @returns {string} the field as CSV: quoted, with its quotes doubled, when it holds a comma, a quote or a line break
 */
function csvField(field) {
    return /[",\n\r]/.test(field) ? `"${field.replace(/"/g, '""')}"` : field;
}

/**
 * @param {readonly ExportTable[]} tables the tables
 * @returns {string} one CSV text: for each table a `# title` line, its header and its rows, then a blank line
 */
export function toCsv(tables) {
    return tables
        .map(({ title, header, rows }) =>
            [`# ${title}`, header.join(','), ...rows.map((row) => row.map(csvField).join(','))].join('\n'),
        )
        .join('\n\n')
        .concat('\n');
}

/**
 * @param {{ready: Record<string, any> | null, stats: Record<string, any> | null,
 *   overrides: Record<string, number | boolean>}} source the world's `ready`, the newest stats and the config
 *   overrides it started with
 * @returns {{command: string, configFile: string, configJson: string, seed: number, tick: number} | null} the replay
 *   command for the world at its newest tick, the file name the config is saved as and its JSON; null before a world
 */
export function replayView({ ready, stats, overrides }) {
    if (ready === null) {
        return null;
    }
    const tick = stats?.tick ?? 0;
    const bundle = buildDebugBundle({ ready, overrides, tick });
    return {
        command: bundle.replay,
        configFile: bundle.configFile,
        configJson: JSON.stringify(bundle.config, null, 2),
        seed: bundle.seed,
        tick,
    };
}

/**
 * Does one of the Export tab's two buttons.
 * @param {'csv' | 'command' | string} what `csv` downloads the tables; `command` copies the replay command
 * @param {{view: () => Record<string, any>, ready: Record<string, any> | null, stats: Record<string, any> | null,
 *   download: (file: {name: string, text: string, type: string}) => void,
 *   copyText?: (text: string) => Promise<unknown> | unknown, toast: (text: string) => void}} parts the drawer's view,
 *   the world and its stats, and the page's download, clipboard and toast
 * @returns {void}
 */
export function performExport(what, { view, ready, stats, download, copyText, toast }) {
    appLog('info', 'InsightsExport', { what });
    const shown = view();
    if (what === 'csv') {
        download({
            name: `blob-insights-${ready?.seed ?? 0}-${stats?.tick ?? 0}.csv`,
            text: toCsv(exportTables(shown)),
            type: 'text/csv',
        });
        toast('Tables saved');
    } else if (shown.export === null || copyText === undefined) {
        toast(shown.export === null ? NO_REPLAY : 'Copying is not available here');
    } else {
        Promise.resolve(copyText(shown.export.command)).then(
            () => toast('Replay command copied'),
            () => toast('Copying was refused'),
        );
    }
}
