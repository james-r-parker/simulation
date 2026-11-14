// The effect developer tools, wired only when the URL asks: `?fxlog=1` names each effect as it fires
// (renderer/fx-log-overlay.js); `?fxdemo=<family|all>` (with `&fxhold=<ticks>`) and `?fxstress=1` play the recipes
// (renderer/fx-demo.js). `window.__fxdemo` lists the demo's cells in CSS px for the legibility test.

import { createFxDemo, DEMO_CELL } from './renderer/fx-demo.js';
import { FX_FAMILIES, fxStats } from './renderer/fx-budget.js';
import { createFxLog, noteFx, updateFxLog } from './renderer/fx-log-overlay.js';
import { createFxNames } from './renderer/fx-names.js';
import { FX_SWITCH } from './renderer/fx-draw.js';
import { occupancy } from './renderer/fx-ring.js';

/**
 * @typedef {object} FxParams
 * @property {boolean} fxlog name effects as they fire
 * @property {string | null} fxdemo a family name or `all` to demo, null for none
 * @property {number | 'peak' | null} fxhold freeze the demo this many ticks after each replay, or each cell at its
 *   recipe's brightest keyframe (`peak`)
 * @property {boolean} fxstress play recipes at 60 a second through the budget
 * @property {boolean} fxoff hide the particle and flash layers (the legibility test's effects-off frame)
 */

/**
 * @param {string} search the query string
 * @returns {FxParams} the effect tool parameters; an unknown family or a bad hold is ignored
 */
export function readFxParams(search) {
    const query = new URLSearchParams(search);
    const demo = query.get('fxdemo');
    const hold = query.get('fxhold');
    return {
        fxlog: query.get('fxlog') === '1',
        fxdemo: demo !== null && (demo === 'all' || FX_FAMILIES.includes(demo)) ? demo : null,
        fxhold: hold === 'peak' ? 'peak' : hold !== null && /^\d{1,4}$/.test(hold) ? Number(hold) : null,
        fxstress: query.get('fxstress') === '1',
        fxoff: query.get('fxoff') === '1',
    };
}

/**
 * @typedef {object} FxDevContext
 * @property {any} player the effects player (`refs.player`), null before a world
 * @property {any} camera the view
 * @property {any} client the worker client
 * @property {Record<string, any> | null} ready the world's `ready` message
 * @property {number} cssScale CSS px per device px
 */

/**
 * @param {{params: FxParams, doc: Document, parent: HTMLElement, target: Record<string, any>}} options the parameters,
 *   the document, where the overlay mounts and the window `__fxdemo` goes on
 * @returns {{onEffect: (effect: any, nowMs: number) => void, afterDraw: (frame: any, ctx: FxDevContext) => void} | null}
 *   the tools, null when none is asked for
 */
export function createFxDev({ params, doc, parent, target }) {
    FX_SWITCH.on = !params.fxoff;
    const demo = createFxDemo({ family: params.fxdemo, hold: params.fxhold, stress: params.fxstress });
    if (!params.fxlog && demo === null) {
        return null;
    }
    /** @type {import('./renderer/fx-log-overlay.js').FxLog | null} */
    let log = null;
    /** @type {Record<string, any> | null} */
    let world = null;
    const ensureLog = (/** @type {Record<string, any> | null} */ ready) => {
        if (params.fxlog && ready !== null && ready !== world) {
            log?.root.remove();
            world = ready;
            log = createFxLog({ doc, parent, names: createFxNames(ready.layout) });
        }
    };
    return {
        onEffect(effect, nowMs) {
            if (log !== null) {
                noteFx(log, effect, nowMs);
            }
        },
        afterDraw(frame, ctx) {
            ensureLog(ctx.ready);
            demo?.update(frame, ctx);
            if (demo !== null) {
                target.__fxdemo = demoCells(demo.cells, ctx, demo.frozen());
            }
            if (log !== null) {
                updateFxLog(log, {
                    camera: ctx.camera,
                    nowMs: frame.nowMs,
                    cssScale: ctx.cssScale,
                    budget: ctx.player?.fx.budget,
                });
            }
        },
    };
}

/**
 * @param {{name: string, x: number, y: number}[]} cells the demo cells in world units
 * @param {FxDevContext} ctx the view
 * @param {boolean} frozen whether the demo clock is held
 * @returns {{cells: {name: string, x: number, y: number, size: number}[], frozen: boolean}} each cell's centre and side
 *   in CSS px, and whether the clock is held
 */
function demoCells(cells, { camera, cssScale }, frozen) {
    const halfW = camera.canvas.width / 2;
    const halfH = camera.canvas.height / 2;
    const side = DEMO_CELL * camera.zoom * cssScale;
    return {
        cells: cells.map((c) => ({
            name: c.name,
            x: ((c.x - camera.x) * camera.zoom + halfW) * cssScale,
            y: ((camera.y - c.y) * camera.zoom + halfH) * cssScale,
            size: side,
        })),
        frozen,
    };
}

/**
 * The effect sink: the interface (audio cues) hears every played effect, then the developer overlay when it is on.
 * @param {Record<string, any>} app the page (`main.js`)
 * @param {any} effect the effect record
 * @returns {void}
 */
export function fxSink(app, effect) {
    app.iface.onEffect(effect);
    app.fxDev?.onEffect(effect, performance.now());
}

/**
 * After a draw: the interface's hook (screenshots), then the effect developer tools when the URL asked for them.
 * @param {Record<string, any>} app the page (`main.js`)
 * @param {any} frame the frame just drawn
 * @returns {void}
 */
export function fxAfterDraw(app, frame) {
    app.iface.afterDraw(frame);
    if (app.fxDev === null) {
        return;
    }
    app.fxDev.afterDraw(frame, {
        player: app.deps.refs.player,
        camera: app.camera,
        client: app.supervisor.client(),
        ready: app.ready,
        cssScale: app.container.clientWidth / Math.max(app.camera.canvas.width, 1),
    });
}

/**
 * @param {Record<string, any>} app the page (`main.js`)
 * @returns {{fx: Record<string, any> | null, drawCalls: number | null}} the effect budget's counts by family with the
 *   pool's live instances (`occupancy`), and the last frame's draw calls, for `__perf`
 */
export function fxPerf(app) {
    const player = app.deps.refs.player;
    return {
        fx: player === null ? null : { ...fxStats(player.fx.budget), occupancy: occupancy(player.fx.pool) },
        drawCalls: app.deps.scene?.renderer.info.render?.calls ?? null,
    };
}
