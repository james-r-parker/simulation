// The inspector drawer body: the header, the ray radar, the grouped input bars, the hidden-layer heatmap, the output
// bars and the counters. `mountInspector` builds the nodes once and `update(view)` rewrites only what changed; the two
// canvases are drawn by `drawRadar` and `drawHeatmap`, which take a 2D context so tests can record them.

import { HEATMAP_COLUMNS } from './inspector-data.js';
import { lineageCss, specCss } from './css-color.js';
import { createIcon } from './silhouette-icons.js';

/** The canvas side, in CSS px. */
export const CANVAS_SIZE = 150;
/** The share of the way each displayed heatmap cell moves towards its activation per update. */
export const HEAT_SMOOTHING = 0.25;

/** Spoke colours by class channel: food, bigger, smaller, similar, kin, wall, obstacle, smoke. */
const CHANNEL_CSS = Object.freeze([
    '#5ee6a8',
    '#ff5d73',
    '#ffb454',
    '#8a9bb0',
    '#6cc6ff',
    '#e6edf5',
    '#7f8da0',
    '#b48cff',
]);
const NO_HIT_CSS = 'rgba(255,255,255,0.12)';

/**
 * @param {number} v an activation, -1 to 1
 * @returns {string} a diverging colour: blue below zero, near black at zero, orange above
 */
export function heatColor(v) {
    const t = Math.min(Math.abs(v), 1);
    const [r, g, b] = v < 0 ? [60, 120, 255] : [255, 150, 40];
    return `rgb(${Math.round(18 + (r - 18) * t)},${Math.round(18 + (g - 18) * t)},${Math.round(22 + (b - 22) * t)})`;
}

/**
 * Moves the displayed cells part of the way to the activations.
 * @param {Float32Array} shown the displayed values, changed in place
 * @param {Float32Array} target the activations
 * @returns {void}
 */
export function smoothHidden(shown, target) {
    for (let i = 0; i < shown.length; i++) {
        shown[i] += (target[i] - shown[i]) * HEAT_SMOOTHING;
    }
}

/**
 * Draws the spokes, nose up: ray `k` points `2 PI k / n` clockwise from the nose and is as long as its proximity.
 * @param {any} ctx a 2D context
 * @param {{lengths: Float32Array, channels: Int8Array}} radar the spokes
 * @param {number} size the canvas side
 * @returns {void}
 */
export function drawRadar(ctx, radar, size) {
    const c = size / 2;
    const reach = c - 6;
    ctx.clearRect(0, 0, size, size);
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.beginPath();
    ctx.arc(c, c, reach, 0, 2 * Math.PI);
    ctx.stroke();
    const n = radar.lengths.length;
    for (let k = 0; k < n; k++) {
        const angle = -Math.PI / 2 + (2 * Math.PI * k) / n;
        const length = reach * radar.lengths[k];
        ctx.strokeStyle = radar.channels[k] < 0 ? NO_HIT_CSS : CHANNEL_CSS[radar.channels[k]];
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(c, c);
        ctx.lineTo(c + Math.cos(angle) * length, c + Math.sin(angle) * length);
        ctx.stroke();
    }
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(c, c, 3, 0, 2 * Math.PI);
    ctx.fill();
}

/**
 * Draws the hidden layer as a grid of `HEATMAP_COLUMNS` columns.
 * @param {any} ctx a 2D context
 * @param {Float32Array} values the displayed activations
 * @param {number} size the canvas side
 * @returns {void}
 */
export function drawHeatmap(ctx, values, size) {
    const rows = Math.ceil(values.length / HEATMAP_COLUMNS);
    const cell = size / HEATMAP_COLUMNS;
    ctx.clearRect(0, 0, size, rows * cell);
    for (let i = 0; i < values.length; i++) {
        ctx.fillStyle = heatColor(values[i]);
        ctx.fillRect((i % HEATMAP_COLUMNS) * cell + 1, Math.floor(i / HEATMAP_COLUMNS) * cell + 1, cell - 2, cell - 2);
    }
}

/**
 * @param {{createElement: (tag: string) => any}} doc the document
 * @param {any} parent where it goes
 * @param {string} tag the element
 * @param {string} className its class
 * @returns {any} the new element, already appended
 */
function add(doc, parent, tag, className) {
    const node = doc.createElement(tag);
    node.className = className;
    parent.appendChild(node);
    return node;
}

/**
 * A labelled bar that grows from the middle: right and warm above zero, left and cool below.
 * @param {{createElement: (tag: string) => any}} doc the document
 * @param {any} parent where it goes
 * @param {string} label what it shows
 * @returns {(value: number, firing?: boolean) => void} sets the bar, writing only when it changed
 */
function createBar(doc, parent, label) {
    const row = add(doc, parent, 'div', 'bar-row');
    add(doc, row, 'span', 'bar-label').textContent = label;
    const track = add(doc, row, 'span', 'bar-track');
    const fill = add(doc, track, 'span', 'bar-fill');
    let last = NaN;
    let lit = false;
    return (value, firing = false) => {
        const pct = Math.round(Math.abs(value) * 50);
        if (pct !== last || value < 0 !== fill.classList.contains('neg')) {
            last = pct;
            fill.style.left = `${value < 0 ? 50 - pct : 50}%`;
            fill.style.width = `${pct}%`;
            fill.classList.toggle('neg', value < 0);
        }
        if (firing !== lit) {
            lit = firing;
            row.classList.toggle('firing', firing);
        }
    };
}

/**
 * @typedef {{createElement: (tag: string) => any, createElementNS: (ns: string, tag: string) => any}} Doc
 */

/**
 * @param {Doc} doc the document
 * @param {any} root the drawer body
 * @returns {Record<string, any>} the fixed nodes: the empty message and the body with its parts
 */
function buildFrame(doc, root) {
    const empty = add(doc, root, 'p', 'inspector-empty');
    empty.textContent = 'Click an agent to inspect it.';
    const body = add(doc, root, 'div', 'inspector-body');
    body.hidden = true;
    const nodes = { empty, body, header: add(doc, body, 'div', 'inspector-header') };
    const radar = add(doc, body, 'canvas', 'inspector-radar');
    const groups = add(doc, body, 'div', 'inspector-groups');
    const heat = add(doc, body, 'canvas', 'inspector-heatmap');
    for (const canvas of [radar, heat]) {
        canvas.width = CANVAS_SIZE;
        canvas.height = CANVAS_SIZE;
    }
    return {
        ...nodes,
        radar,
        groups,
        heat,
        outputs: add(doc, body, 'div', 'inspector-outputs'),
        counters: add(doc, body, 'dl', 'inspector-counters'),
    };
}

/**
 * @typedef {object} Rows
 * @property {((value: number, firing?: boolean) => void)[]} inputBars the input bars in view order
 * @property {((value: number, firing?: boolean) => void)[]} outputBars the output bars
 * @property {any[]} counterNodes the counter value nodes
 * @property {Float32Array} shown the displayed (smoothed) hidden activations
 */

/**
 * Builds the bars and counter rows the first valid view describes.
 * @param {Doc} doc the document
 * @param {Record<string, any>} nodes the frame
 * @param {import('./inspector-data.js').InspectorView} view the view
 * @returns {Rows} the rows
 */
function buildRows(doc, nodes, view) {
    const inputBars = [];
    for (const g of view.groups) {
        add(doc, nodes.groups, 'h4', 'bar-group').textContent = g.name;
        for (const bar of g.bars) {
            inputBars.push(createBar(doc, nodes.groups, bar.label));
        }
    }
    return {
        inputBars,
        outputBars: view.outputs.map((o) => createBar(doc, nodes.outputs, o.label)),
        shown: new Float32Array(view.hidden.length),
        counterNodes: view.counters.map((c) => {
            add(doc, nodes.counters, 'dt', 'counter-label').textContent = c.label;
            return add(doc, nodes.counters, 'dd', 'counter-value');
        }),
    };
}

/**
 * @param {Doc} doc the document
 * @param {any} header the header node
 * @param {import('./inspector-data.js').InspectorView['header']} who the agent
 * @returns {void}
 */
function showHeader(doc, header, who) {
    header.replaceChildren();
    header.appendChild(createIcon(doc, { name: who.spec, color: lineageCss(who.lineageId), size: 22 }));
    const text = add(doc, header, 'span', 'inspector-title');
    text.textContent = `${who.spec} - ${who.familyName} - #${who.genomeId}`;
    text.style.color = specCss(who.spec);
}

/**
 * @param {Rows} rows the rows
 * @param {import('./inspector-data.js').InspectorView} view the view to show
 * @returns {void}
 */
function writeRows(rows, view) {
    view.groups.flatMap((g) => g.bars).forEach((bar, i) => rows.inputBars[i](bar.value));
    view.outputs.forEach((o, i) => rows.outputBars[i](o.value, o.firing));
    view.counters.forEach((c, i) => {
        if (rows.counterNodes[i].textContent !== c.text) {
            rows.counterNodes[i].textContent = c.text;
        }
    });
    smoothHidden(rows.shown, view.hidden);
}

/**
 * @param {Doc} doc the document
 * @param {any} root the inspector drawer body
 * @returns {{update: (view: import('./inspector-data.js').InspectorView) => void}} `update` draws a view; an invalid
 *   view shows the "click an agent" message and hides the rest
 */
export function mountInspector(doc, root) {
    const nodes = buildFrame(doc, root);
    const radarCtx = nodes.radar.getContext('2d');
    const heatCtx = nodes.heat.getContext('2d');
    /** @type {Rows | null} */
    let rows = null;
    let who = -1;
    return {
        update(view) {
            nodes.empty.hidden = view.valid;
            nodes.body.hidden = !view.valid;
            if (!view.valid) {
                who = -1;
                return;
            }
            const selectionChanged = who !== view.header.genomeId;
            if (selectionChanged) {
                who = view.header.genomeId;
                showHeader(doc, nodes.header, view.header);
            }
            const fresh = rows === null;
            rows ??= buildRows(doc, nodes, view);
            if (!fresh && selectionChanged) {
                rows.shown.set(view.hidden);
            }
            writeRows(rows, view);
            if (radarCtx !== null && heatCtx !== null) {
                drawRadar(radarCtx, view.radar, CANVAS_SIZE);
                drawHeatmap(heatCtx, rows.shown, CANVAS_SIZE);
            }
        },
    };
}
