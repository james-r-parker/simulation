// The top bar: tick and run time, speed, the season with a progress ring, the population by type, the born-in-world
// share and a notice. `topBarInput` reads what it needs from the worker client, `topBarView` turns that into strings,
// and `mountTopBar` owns the nodes and rewrites one only when its text changed.

import { createIcon } from './silhouette-icons.js';

/** Ticks a second at speed x1. */
const BASE_TICKS_PER_SECOND = 60;

/**
 * @param {number} n a count
 * @returns {string} the count with thousands separators
 */
function grouped(n) {
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * @param {number} multiple a speed multiple such as 0.25 or 4
 * @returns {string} `x4`, `x0.25`
 */
function speedLabel(multiple) {
    return `x${multiple}`;
}

/**
 * @param {number} ticks ticks run
 * @returns {string} the simulated time they make at x1: `0:42`, `1:05:09`
 */
export function elapsedLabel(ticks) {
    const total = Math.floor(ticks / BASE_TICKS_PER_SECOND);
    const s = String(total % 60).padStart(2, '0');
    const m = Math.floor(total / 60) % 60;
    const h = Math.floor(total / 3600);
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/**
 * @typedef {object} TopBarInput
 * @property {number} tick the newest snapshot's tick
 * @property {number} population agents alive
 * @property {number} ticksPerSecond the rate actually sustained, 0 before any stats
 * @property {string} season the season's name, empty before any stats
 * @property {number} seasonProgress position within the season, 0 to 1
 * @property {{name: string, count: number}[]} types each specialisation with its count
 * @property {number | null} bornShare the share of births made in the world, null before any
 */

/**
 * @param {Record<string, any>} stats the newest stats message, empty before one
 * @param {Record<string, any>} info `ready.info`, empty before one
 * @returns {Omit<TopBarInput, 'tick' | 'population'>} the fields that come from the stats
 */
function statsFields(stats, info) {
    const specs = /** @type {{index: number, name: string}[]} */ (info.specs ?? []);
    return {
        ticksPerSecond: stats.ticksPerSecond ?? 0,
        season: String(info.seasonNames?.[stats.season] ?? ''),
        seasonProgress: stats.seasonProgress ?? 0,
        types: specs.map((spec) => ({ name: spec.name, count: stats.bySpec?.[spec.index] ?? 0 })),
        bornShare: stats.bornShare ?? null,
    };
}

/**
 * What the bar shows comes from the newest snapshot where there is one (stats stop while the sim is paused, but each
 * step posts a snapshot), and from the newest stats for the rest.
 * @param {{latest: {tick: number, u32: Uint32Array} | null, stats: Record<string, any> | null,
 *   ready?: Record<string, any> | null} | null} client the worker client, null before the first start
 * @returns {TopBarInput | null} what `topBarView` reads, null before any snapshot has arrived
 */
export function topBarInput(client) {
    if (client === null || client.latest === null) {
        return null;
    }
    return {
        ...statsFields(client.stats ?? {}, client.ready?.info ?? {}),
        tick: client.latest.tick,
        population: client.latest.u32[1],
    };
}

/**
 * @param {TopBarInput | null} stats what `topBarInput` read
 * @param {{requestedTicksPerSecond: number}} state the app state
 * @param {boolean} paused whether the sim is paused
 * @returns {string} `x4`, with the sustained rate beside it when it differs, or `paused`
 */
function speedText(stats, { requestedTicksPerSecond }, paused) {
    if (paused) {
        return 'paused';
    }
    const requested = speedLabel(requestedTicksPerSecond / BASE_TICKS_PER_SECOND);
    if (stats === null || Math.abs(stats.ticksPerSecond - requestedTicksPerSecond) < 0.5) {
        return requested;
    }
    return `${requested} (${speedLabel(Math.round((stats.ticksPerSecond / BASE_TICKS_PER_SECOND) * 100) / 100)})`;
}

/**
 * @param {number | null | undefined} share the born-in-world share, 0 to 1
 * @returns {string} `born 42%`, `born -` when there is none yet
 */
function bornText(share) {
    return typeof share === 'number' ? `born ${Math.round(share * 100)}%` : 'born -';
}

/** @type {TopBarInput} */
const EMPTY_INPUT = Object.freeze({
    tick: 0,
    population: 0,
    ticksPerSecond: 0,
    season: '',
    seasonProgress: 0,
    types: [],
    bornShare: null,
});

/**
 * @typedef {object} TopBarView
 * @property {string} tick `tick 1,234`
 * @property {string} elapsed the run time, `1:05`
 * @property {string} speed `x4`, with the sustained rate beside it when it differs, or `paused`
 * @property {string} season the season name
 * @property {number} seasonProgress 0 to 1, drawn as the ring
 * @property {{name: string, count: string}[]} types the counts by specialisation
 * @property {string} born `born 42%`, `born -` before any birth
 * @property {string} population `pop 250`
 * @property {string} notice a short message, empty for none
 */

/**
 * @param {TopBarInput | null} stats what `topBarInput` read, null before one arrives
 * @param {{requestedTicksPerSecond: number, notice: string}} state the app state
 * @param {boolean} paused whether the sim is paused
 * @returns {TopBarView} the strings to show; the speed shows the requested multiple, with the rate actually sustained
 *   beside it when it differs
 */
export function topBarView(stats, state, paused) {
    const s = stats ?? EMPTY_INPUT;
    return {
        tick: `tick ${grouped(s.tick)}`,
        elapsed: elapsedLabel(s.tick),
        speed: speedText(stats, state, paused),
        season: s.season,
        seasonProgress: s.seasonProgress,
        types: s.types.map((t) => ({ name: t.name, count: grouped(t.count) })),
        born: bornText(s.bornShare),
        population: `pop ${grouped(s.population)}`,
        notice: state.notice,
    };
}

const TEXT_FIELDS = ['tick', 'elapsed', 'speed', 'season', 'born', 'population', 'notice'];

/**
 * @param {any} node an element
 * @param {string} text the text it should show
 * @returns {void}
 */
function setText(node, text) {
    if (node.textContent !== text) {
        node.textContent = text;
    }
}

/**
 * @param {{createElement: (tag: string) => any, createElementNS: (ns: string, tag: string) => any}} doc the document
 * @param {{appendChild: (child: any) => void}} root the bar element
 * @returns {(view: TopBarView) => void} writes a view into the bar, touching only changed text
 */
export function mountTopBar(doc, root) {
    /** @type {Record<string, any>} */
    const nodes = {};
    const make = (/** @type {string} */ key) => {
        nodes[key] = doc.createElement('span');
        nodes[key].className = `top-bar-${key}`;
        root.appendChild(nodes[key]);
    };
    for (const key of ['tick', 'elapsed', 'speed']) {
        make(key);
    }
    make('seasonBox');
    const ring = doc.createElement('span');
    ring.className = 'season-ring';
    nodes.seasonBox.appendChild(ring);
    nodes.season = doc.createElement('span');
    nodes.seasonBox.appendChild(nodes.season);
    make('types');
    for (const key of ['born', 'population', 'notice']) {
        make(key);
    }
    /** @type {{box: any, count: any, name: string}[]} */
    const typeNodes = [];
    let progress = -1;
    return (view) => {
        for (const key of TEXT_FIELDS) {
            setText(nodes[key], /** @type {Record<string, any>} */ (view)[key]);
        }
        const rounded = Math.round(view.seasonProgress * 100);
        if (rounded !== progress) {
            progress = rounded;
            ring.style.setProperty('--p', `${rounded}%`);
        }
        view.types.forEach((type, i) => {
            if (typeNodes[i] === undefined || typeNodes[i].name !== type.name) {
                typeNodes[i]?.box.remove();
                const box = doc.createElement('span');
                box.className = 'top-bar-type';
                box.setAttribute('title', type.name);
                box.appendChild(createIcon(doc, { name: type.name }));
                const count = doc.createElement('span');
                box.appendChild(count);
                nodes.types.appendChild(box);
                typeNodes[i] = { box, count, name: type.name };
            }
            setText(typeNodes[i].count, type.count);
        });
    };
}
