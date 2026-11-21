// The insights drawer's Export tab: a button to download the tables as CSV, a button to copy the replay command, and the
// command itself with the config file it reads, shown for reading and copying by hand.

import { mountNote } from './insights-table.js';

/** What the Export tab shows before a world is ready. */
export const NO_REPLAY = 'There is no world to replay yet.';

/**
 * @param {{createElement: (tag: string) => any}} doc the document
 * @param {any} panel the tab's element
 * @param {import('./insights.js').InsightsHooks} hooks `onExport` hears each button, as `csv` or `command`
 * @returns {{update: (view: {command: string, configFile: string, configJson: string} | null) => void}} `update` shows
 *   the replay command and its config
 */
export function mountExportTab(doc, panel, hooks) {
    for (const [what, label] of [
        ['csv', 'Download the tables (CSV)'],
        ['command', 'Copy the replay command'],
    ]) {
        const button = doc.createElement('button');
        button.className = `control insights-export insights-export-${what}`;
        button.textContent = label;
        button.addEventListener('click', () => hooks.onExport?.(what));
        panel.appendChild(button);
    }
    const note = mountNote(doc, panel, '');
    const command = doc.createElement('pre');
    command.className = 'insights-command';
    panel.appendChild(command);
    const config = doc.createElement('pre');
    config.className = 'insights-config';
    panel.appendChild(config);
    return {
        update(view) {
            const text = view === null ? NO_REPLAY : view.command;
            const side =
                view === null ? '' : `Save this as ${view.configFile}, then run the command from the repo root:`;
            const json = view === null ? '' : view.configJson;
            for (const [node, value] of [
                [command, text],
                [note, side],
                [config, json],
            ]) {
                if (node.textContent !== value) {
                    node.textContent = value;
                }
            }
        },
    };
}
