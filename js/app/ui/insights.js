// The insights drawer: a strip of tabs over one panel each, and `update(view)` that fills the panel being shown (every
// panel on the board). It owns no data: the view comes from `insights-data.js`, `scene-counters.js` and the lists, and
// a click on a row reports its target. Over an injected document.

import { mountExportTab } from './insights-export.js';
import { mountFamiliesTab } from './insights-families.js';
import { mountRecordsTab } from './insights-records.js';
import { mountScenesTab } from './insights-scenes.js';
import { mountWorldTab } from './insights-world.js';

/**
 * @typedef {object} InsightsHooks
 * @property {(target: any) => void} [onPick] a clickable row was clicked, with its target
 * @property {(what: string) => void} [onExport] an export button was pressed (`csv` or `command`)
 */

/**
 * The tabs, in order: each one's id, its label and how its panel is built. A tab's `mount` returns `update(view)`, given its
 * own part of the view (`view[id]`), and may return more.
 * @type {readonly {id: string, label: string, mount: (doc: any, panel: any, hooks: InsightsHooks) => any}[]}
 */
export const TABS = Object.freeze([
    { id: 'world', label: 'World', mount: mountWorldTab },
    { id: 'scenes', label: 'Scenes', mount: mountScenesTab },
    { id: 'families', label: 'Families', mount: mountFamiliesTab },
    { id: 'records', label: 'Records', mount: mountRecordsTab },
    { id: 'export', label: 'Export', mount: mountExportTab },
]);

/** The tab shown when none is chosen. */
export const DEFAULT_TAB = 'world';

/**
 * @param {string} id a tab id, or anything a preference held
 * @returns {string} the id when it names a tab, else the default
 */
export function tabOrDefault(id) {
    return TABS.some((t) => t.id === id) ? id : DEFAULT_TAB;
}

/**
 * @param {{createElement: (tag: string) => any}} doc the document
 * @param {{strip: any, root: any, def: (typeof TABS)[number], hooks: InsightsHooks, show: (id: string) => void}} parts
 *   the tab strip, the drawer body, the tab, the panels' hooks and what a click on the tab's button does
 * @returns {{id: string, button: any, panel: any, part: any}} the tab's button, its panel and what its module returned
 */
function buildTab(doc, { strip, root, def, hooks, show }) {
    const button = doc.createElement('button');
    button.className = 'control insights-tab';
    button.textContent = def.label;
    button.setAttribute('role', 'tab');
    button.addEventListener('click', () => {
        show(def.id);
        button.blur?.();
    });
    strip.appendChild(button);
    const panel = doc.createElement('div');
    panel.className = `insights-panel insights-${def.id}`;
    root.appendChild(panel);
    return { id: def.id, button, panel, part: def.mount(doc, panel, hooks) };
}

/**
 * @param {{createElement: (tag: string) => any}} doc the document
 * @param {any} root the drawer body
 * @param {{tab?: string, onTab?: (id: string) => void, hooks?: InsightsHooks}} [options] the tab to show first, what a
 *   tab change reports, and what the panels' clicks do
 * @returns {{tab: () => string, setTab: (id: string) => void, update: (view: Record<string, any>) => void,
 *   setBoard: (on: boolean) => void, board: () => boolean, chartsRoot: () => any}} `setTab` shows a tab (an unknown id
 *   is ignored); `update` fills the shown panel, or all of them on the board; `chartsRoot` is where the World tab's
 *   charts go
 */
export function mountInsights(doc, root, { tab = DEFAULT_TAB, onTab, hooks = {} } = {}) {
    const strip = doc.createElement('div');
    strip.className = 'insights-tabs';
    strip.setAttribute('role', 'tablist');
    root.appendChild(strip);
    let current = tabOrDefault(tab);
    let board = false;
    const parts = TABS.map((def) => buildTab(doc, { strip, root, def, hooks, show: (id) => show(id) }));
    /** @type {Record<string, any> | null} */
    let last = null;
    const paint = () => {
        for (const p of parts) {
            const shown = board || p.id === current;
            p.panel.hidden = !shown;
            p.button.classList.toggle('on', p.id === current);
            p.button.setAttribute('aria-selected', String(p.id === current));
            if (shown && last?.[p.id] !== undefined) {
                p.part.update(last[p.id]);
            }
        }
    };
    /** @param {string} id */
    function show(id) {
        if (id !== current && TABS.some((t) => t.id === id)) {
            current = id;
            paint();
            onTab?.(id);
        }
    }
    paint();
    return {
        tab: () => current,
        setTab: show,
        board: () => board,
        chartsRoot: () => parts[0].part.chartsRoot,
        setBoard(on) {
            board = on;
            root.classList.toggle('insights-board', on);
            paint();
        },
        update(view) {
            last = view;
            paint();
        },
    };
}
