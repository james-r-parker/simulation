// The developer overlay (`?fxlog=1`): names each effect as it fires, at its world position, in a pooled label that
// fades over 2 s, and keeps a corner table of counts per name over the last 60 s and the budget's drops. It is a
// development tool, so it writes DOM text and styles; it is off unless asked for.

import { FX_FAMILIES } from './fx-budget.js';
import { nameOf } from './fx-names.js';

/** Labels in the pool. */
export const LABELS = 48;
/** How long a label shows, ms. */
export const LABEL_MS = 2000;
/** The table's window, in seconds. */
export const WINDOW_S = 60;

/**
 * @typedef {object} FxLog
 * @property {HTMLElement} root
 * @property {{el: HTMLElement, x: number, y: number, bornMs: number}[]} labels
 * @property {number} next the label the next effect takes
 * @property {Map<string, Uint16Array>} counts per name, a ring of per-second counts
 * @property {HTMLElement} table
 * @property {number} lastSecond the second the rings were last advanced to
 * @property {import('./fx-names.js').FxNames} names
 */

/**
 * @param {{doc: Document, parent: HTMLElement, names: import('./fx-names.js').FxNames}} options where to mount and the
 *   effect names
 * @returns {FxLog} the overlay
 */
export function createFxLog({ doc, parent, names }) {
    const root = doc.createElement('div');
    root.className = 'fx-log';
    root.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;font:11px monospace;';
    const table = doc.createElement('pre');
    table.style.cssText = 'position:absolute;right:8px;bottom:8px;margin:0;color:#cfd8e3;background:#000a;padding:6px;';
    root.appendChild(table);
    const labels = [];
    for (let i = 0; i < LABELS; i++) {
        const el = doc.createElement('span');
        el.style.cssText = 'position:absolute;left:0;top:0;color:#fff;opacity:0;white-space:nowrap;';
        root.appendChild(el);
        labels.push({ el, x: 0, y: 0, bornMs: -Infinity });
    }
    parent.appendChild(root);
    return { root, labels, next: 0, counts: new Map(), table, lastSecond: 0, names };
}

/**
 * Records one effect: a label at its position, and a count in this second's bucket.
 * @param {FxLog} log the overlay
 * @param {{kind: number, x: number, y: number, c: number, d: number}} effect the effect record
 * @param {number} nowMs wall time
 * @returns {string} the name it was logged under
 */
export function noteFx(log, effect, nowMs) {
    const name = nameOf(log.names, effect);
    const label = log.labels[log.next];
    log.next = (log.next + 1) % LABELS;
    label.el.textContent = name;
    label.x = effect.x;
    label.y = effect.y;
    label.bornMs = nowMs;
    let ring = log.counts.get(name);
    if (ring === undefined) {
        ring = new Uint16Array(WINDOW_S);
        log.counts.set(name, ring);
    }
    ring[Math.floor(nowMs / 1000) % WINDOW_S] += 1;
    return name;
}

/**
 * Clears the per-second buckets the clock has passed since the last call.
 * @param {FxLog} log the overlay
 * @param {number} second the current second
 * @returns {void}
 */
function advance(log, second) {
    const from = Math.max(log.lastSecond + 1, second - WINDOW_S + 1);
    for (let s = from; s <= second; s++) {
        for (const ring of log.counts.values()) {
            ring[s % WINDOW_S] = 0;
        }
    }
    log.lastSecond = second;
}

/**
 * @param {FxLog} log the overlay
 * @returns {[string, number][]} each name's count over the window, most frequent first
 */
export function windowCounts(log) {
    /** @type {[string, number][]} */
    const rows = [];
    for (const [name, ring] of log.counts) {
        rows.push([name, ring.reduce((a, b) => a + b, 0)]);
    }
    return rows.sort((a, b) => b[1] - a[1]);
}

/**
 * Moves and fades the labels, and rewrites the table once a second.
 * @param {FxLog} log the overlay
 * @param {{camera: import('../camera.js').CameraController, nowMs: number, cssScale: number,
 *   budget?: import('./fx-budget.js').FxBudget}} at the view, the time, CSS px per device px and the budget
 * @returns {void}
 */
export function updateFxLog(log, { camera, nowMs, cssScale, budget }) {
    const halfW = camera.canvas.width / 2;
    const halfH = camera.canvas.height / 2;
    for (const label of log.labels) {
        const age = (nowMs - label.bornMs) / LABEL_MS;
        label.el.style.opacity = age >= 0 && age < 1 ? String(1 - age) : '0';
        if (age >= 0 && age < 1) {
            const sx = ((label.x - camera.x) * camera.zoom + halfW) * cssScale;
            const sy = ((camera.y - label.y) * camera.zoom + halfH) * cssScale - 18 * age;
            label.el.style.transform = `translate(${sx.toFixed(0)}px, ${sy.toFixed(0)}px)`;
        }
    }
    const second = Math.floor(nowMs / 1000);
    if (second !== log.lastSecond) {
        advance(log, second);
        const lines = windowCounts(log).map(([name, n]) => `${name.padEnd(12)} ${n}`);
        if (budget) {
            lines.push('', 'dropped by family:', ...FX_FAMILIES.map((f, i) => `${f.padEnd(12)} ${budget.dropped[i]}`));
        }
        log.table.textContent = `effects, last ${WINDOW_S} s\n${lines.join('\n')}`;
    }
}
