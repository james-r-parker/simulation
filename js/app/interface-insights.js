// The insights drawer's part of the interface: the drawer over the data it reads (the stats messages and the app's own
// history), its tab, and the charts of its World tab. It works at the stats rate while open and costs nothing while
// closed, except the scene counters, which count effects and frames so a reading is there when the drawer opens. Reads;
// never reaches the sim.

import { appLog } from './app-log.js';
import { createChartsLifecycle } from './interface-charts.js';
import { performExport, replayView } from './insights-export.js';
import { familyTableRows, recordTableRows } from './insights-lists.js';
import { createInsightsData, noteInsightStats, readyInsights, worldView } from './insights-data.js';
import {
    advanceSeason,
    createSceneCounters,
    noteFrame,
    noteSceneEffect,
    resetSceneCounters,
    sceneRows,
} from './scene-counters.js';
import { createReelPart, reelTiles } from './interface-reel.js';
import { familyCss } from './ui/css-color.js';
import { mountInsights } from './ui/insights.js';

/** The class on the page's root while the board is up: the world shrinks to a corner (`css/app.css`). */
export const BOARD_CLASS = 'insights-board-on';

/** The drawer's name in `drawer.js`. */
export const INSIGHTS_DRAWER = 'insights';

/**
 * The World tab's charts: built when the drawer is open on the World tab (or the board), destroyed otherwise.
 * @param {Record<string, any>} ctx the interface's shared parts
 * @param {() => ReturnType<typeof mountInsights>} getUi the drawer, which is mounted after this
 * @returns {{sync: () => void, close: () => void, update: () => void}} `sync` builds or destroys them to match the
 *   drawer; `update` pushes the history in
 */
function createWorldCharts(ctx, getUi) {
    const { deps } = ctx;
    const shown = () => ctx.drawers.state() === INSIGHTS_DRAWER && (getUi().tab() === 'world' || getUi().board());
    const charts = createChartsLifecycle({
        doc: deps.doc,
        drawers: { state: () => (shown() ? 'charts' : null), body: () => getUi().chartsRoot() },
        loadUPlot: deps.loadUPlot,
        toast: ctx.toast,
        getData: ctx.chartData.data,
        colorOf: (/** @type {number} */ id) => familyCss(deps.slots, id),
    });
    return {
        sync: () => (shown() ? charts.open() : charts.close()),
        close: charts.close,
        update: charts.update,
    };
}

/**
 * @param {Record<string, any>} deps the interface's deps: `getAgents`
 * @param {ReturnType<typeof createSceneCounters>} scenes the counters
 * @returns {{ticks: number, genome: number, alive: boolean}} the longest pursuit the frame saw, and whether its hunter is
 *   in the frame now
 */
function longestChase(deps, scenes) {
    const { ticks, genome } = scenes.frame.longest;
    const agents = deps.getAgents?.();
    let alive = false;
    for (let i = 0; agents !== undefined && !alive && i < agents.count; i++) {
        alive = agents.genomeId[i] === genome;
    }
    return { ticks, genome, alive: ticks > 0 && alive };
}

/**
 * @param {Record<string, any>} deps the interface's deps: `getAgents` and `getPursuits`
 * @param {ReturnType<typeof createSceneCounters>} scenes the counters
 * @returns {(nowMs: number) => void} reads the frame into the counters; does nothing before the page has agents
 */
function createFrameFeed(deps, scenes) {
    const frame = { agents: /** @type {any} */ (null), pursuits: /** @type {any} */ (null), nowMs: 0, tick: 0 };
    return (nowMs) => {
        const agents = deps.getAgents?.();
        if (agents !== undefined) {
            frame.agents = agents;
            frame.pursuits = deps.getPursuits?.() ?? null;
            frame.nowMs = nowMs;
            frame.tick = scenes.tick;
            noteFrame(scenes, frame);
        }
    };
}

/**
 * @param {Record<string, any>} ctx the interface's shared parts
 * @param {ReturnType<typeof mountInsights>} ui the drawer
 * @param {() => void} refresh fills the drawer and builds or destroys the charts to match it
 * @returns {{set: (on: boolean) => void, toggle: () => void}} `set` marks the board on or off (the drawer's layout and
 *   the page's class that shrinks the world to a corner); `toggle` opens the drawer as the board, turns the open
 *   drawer into it, or closes it when it is the board
 */
function createBoard(ctx, ui, refresh) {
    const set = (/** @type {boolean} */ on) => {
        ui.setBoard(on);
        ctx.deps.doc.documentElement.classList.toggle(BOARD_CLASS, on);
    };
    return {
        set,
        toggle() {
            const open = ctx.drawers.state() === INSIGHTS_DRAWER;
            if (open && ui.board()) {
                ctx.drawers.dispatch({ type: 'close', drawer: INSIGHTS_DRAWER });
                return;
            }
            set(true);
            if (open) {
                refresh();
            } else {
                ctx.drawers.dispatch({ type: 'open', drawer: INSIGHTS_DRAWER });
            }
        },
    };
}

/**
 * @param {{deps: Record<string, any>, data: ReturnType<typeof createInsightsData>,
 *   scenes: ReturnType<typeof createSceneCounters>, reel: ReturnType<typeof createReelPart>}} source the page's deps and
 *   what the drawer reads
 * @returns {() => Record<string, any>} builds the drawer's view: each tab's part, from the data as it is now
 */
function createView({ deps, data, scenes, reel }) {
    return () => {
        const rows = sceneRows(scenes, data.stats?.tick ?? scenes.tick);
        return {
            ...tabsView({ deps, data, scenes }),
            scenes: rows,
            reel: reelTiles(rows, reel.reel.clipOf),
        };
    };
}

/**
 * @param {{deps: Record<string, any>, data: ReturnType<typeof createInsightsData>,
 *   scenes: ReturnType<typeof createSceneCounters>}} source the page's deps and what the drawer reads
 * @returns {Record<string, any>} the tabs other than Scenes and Reel, from the data as it is now
 */
function tabsView({ deps, data, scenes }) {
    return {
        world: worldView(data),
        families: familyTableRows(data, (id) => familyCss(deps.slots, id)),
        records: recordTableRows(data, longestChase(deps, scenes)),
        export: replayView({ ready: deps.getReady(), stats: data.stats, overrides: deps.overrides }),
    };
}

/**
 * @param {Record<string, any>} ctx the interface's shared parts
 * @param {() => Record<string, any>} view the drawer's view
 * @param {ReturnType<typeof createInsightsData>} data what the drawer reads
 * @returns {Parameters<typeof performExport>[1]} what an export button needs of the page
 */
function exportParts({ deps, toast }, view, data) {
    return {
        view,
        ready: deps.getReady(),
        stats: data.stats,
        download: deps.download,
        copyText: deps.copyText,
        toast,
    };
}

/**
 * @param {Record<string, any>} ctx the interface's shared parts
 * @param {{data: ReturnType<typeof createInsightsData>, view: () => Record<string, any>,
 *   charts: () => {sync: () => void}}} later what is built after the drawer, read when a click comes
 * @returns {NonNullable<Parameters<typeof mountInsights>[2]>} the drawer's options: the tab it opens on, what a tab
 *   change saves, and what a click on a row or an export button does
 */
function drawerOptions(ctx, later) {
    const { deps } = ctx;
    return {
        tab: ctx.prefs.insightsTab,
        hooks: {
            onPick: (target) => deps.followTarget?.(target),
            onExport: (what) => performExport(what, exportParts(ctx, later.view, later.data)),
        },
        onTab(id) {
            ctx.prefs.insightsTab = id;
            ctx.persist();
            later.charts().sync();
        },
    };
}

/**
 * @param {Record<string, any>} ctx the interface's shared parts: `deps`, `prefs`, `drawers`, `toast`, `chartData` and
 *   `persist`
 * @returns {{open: () => void, close: () => void, update: () => void, noteReady: (ready: Record<string, any>) => void,
 *   noteStats: (stats: Record<string, any>) => void, noteEffect: (effect: any) => void,
 *   noteFrame: (nowMs: number) => void, toggleBoard: () => void, ui: ReturnType<typeof mountInsights>,
 *   view: () => Record<string, any>, reel: ReturnType<typeof createReelPart>}} `open` and `close` follow the drawer; `toggleBoard` opens it as the full-screen board,
 *   or closes it when it is one; `update` refreshes the shown tab; the `note` functions feed it what the app hears
 */
export function mountInsightsPart(ctx) {
    const { deps } = ctx;
    const data = createInsightsData();
    const scenes = createSceneCounters();
    const reel = createReelPart(deps, scenes);
    const later = { data, view: () => view(), charts: () => charts };
    const ui = mountInsights(deps.doc, ctx.drawers.body(INSIGHTS_DRAWER), drawerOptions(ctx, later));
    const charts = createWorldCharts(ctx, () => ui);
    const view = createView({ deps, data, scenes, reel });
    const refresh = () => {
        ui.update(view());
        charts.sync();
    };
    const board = createBoard(ctx, ui, refresh);
    const feed = createFrameFeed(deps, scenes);
    return {
        ui,
        view,
        reel,
        open() {
            appLog('info', 'InsightsOpened', { tab: ui.tab(), board: ui.board() });
            refresh();
        },
        close() {
            board.set(false);
            charts.close();
        },
        toggleBoard: board.toggle,
        update() {
            ui.update(view());
            charts.update();
        },
        noteReady(ready) {
            readyInsights(data, ready);
            resetSceneCounters(scenes, ready);
            reel.reset();
            charts.close();
            charts.sync();
        },
        noteStats(stats) {
            noteInsightStats(data, stats);
            advanceSeason(scenes, stats.tick);
        },
        noteEffect: (effect) => noteSceneEffect(scenes, effect),
        noteFrame(nowMs) {
            feed(nowMs);
            reel.tick(nowMs);
        },
    };
}
