// The top bar: the status sentence, the calendar (year, season with a progress ring, generation), speed, the population
// by type, the born-in-world share and a notice. `topBarInput` reads what it needs from the worker client, `topBarView`
// turns that into strings, and `mountTopBar` owns the nodes and rewrites one only when its text changed. The tick and
// the run time are in the help drawer's debug lines.

import { calendarOf, statusLine } from './status-line.js';
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
 * @property {string} status the plain-language status sentence
 * @property {{year: number, season: string, generation: number} | null} calendar null before any stats
 * @property {number} ticksPerSecond the rate actually sustained, 0 before any stats
 * @property {number} seasonProgress position within the season, 0 to 1
 * @property {{name: string, count: number}[]} types each specialisation with its count
 * @property {number | null} bornShare the share of births made in the world, null before any
 * @property {number | null} predators alive agents that can hunt, null before any stats
 * @property {number | null} callsPerKiloTick alarm and hunt calls per 1000 ticks lately, null before any stats
 * @property {{name: string, share: number} | null} largest the most common specialisation and its share of the alive
 *   agents, null before any stats or when none is alive
 */

/**
 * @param {{index: number, share: number} | undefined} largest `stats.largestSpec`
 * @param {{index: number, name: string}[]} specs `ready.info.specs`
 * @returns {{name: string, share: number} | null} the largest specialisation by name, null when unknown or none alive
 */
function largestOf(largest, specs) {
    const spec = specs.find((s) => s.index === largest?.index);
    return largest === undefined || spec === undefined || largest.share === 0
        ? null
        : { name: spec.name, share: largest.share };
}

/**
 * @param {Record<string, any>} shown the newest stats message, empty before one
 * @param {{index: number, name: string}[]} specs `ready.info.specs`
 * @returns {Pick<TopBarInput, 'ticksPerSecond' | 'seasonProgress' | 'bornShare' | 'predators' | 'callsPerKiloTick' |
 *   'largest'>} the plain numbers, with the live world numbers
 */
function liveFields(shown, specs) {
    return {
        ticksPerSecond: shown.ticksPerSecond ?? 0,
        seasonProgress: shown.seasonProgress ?? 0,
        bornShare: shown.bornShare ?? null,
        predators: shown.predators ?? null,
        callsPerKiloTick: shown.callsPerKiloTick ?? null,
        largest: largestOf(shown.largestSpec, specs),
    };
}

/**
 * @param {Record<string, any> | null} stats the newest stats message, null before one
 * @param {Record<string, any>} ready the `ready` message, empty before one
 * @param {'growing' | 'shrinking' | 'steady'} trend the population trend
 * @returns {Pick<TopBarInput, 'ticksPerSecond' | 'status' | 'calendar' | 'seasonProgress' | 'types' | 'bornShare' | 'predators' | 'callsPerKiloTick' | 'largest'>} the
 *   fields that come from the stats
 */
function statsFields(stats, ready, trend) {
    const info = ready.info ?? {};
    const world = ready.info === undefined ? null : { ...info, seed: ready.seed };
    const shown = stats ?? {};
    return {
        status: statusLine({ stats, trend, world }),
        calendar: stats === null || world === null ? null : calendarOf(stats, world),
        types: (info.specs ?? []).map((/** @type {{index: number, name: string}} */ spec) => ({
            name: spec.name,
            count: shown.bySpec?.[spec.index] ?? 0,
        })),
        ...liveFields(shown, info.specs ?? []),
    };
}

/**
 * What the bar shows comes from the newest snapshot where there is one (stats stop while the sim is paused, but each
 * step posts a snapshot), and from the newest stats for the rest.
 * @param {{latest: {tick: number, u32: Uint32Array} | null, stats: Record<string, any> | null,
 *   ready?: Record<string, any> | null} | null} client the worker client, null before the first start
 * @param {'growing' | 'shrinking' | 'steady'} [trend] the population trend, from the history
 * @returns {TopBarInput | null} what `topBarView` reads, null before any snapshot has arrived
 */
export function topBarInput(client, trend = 'steady') {
    if (client === null || client.latest === null) {
        return null;
    }
    return {
        ...statsFields(client.stats, client.ready ?? {}, trend),
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

/**
 * @param {TopBarInput} s what `topBarInput` read
 * @returns {{predators: string, calls: string, dominant: string}} the live world numbers: `pred 34`, `calls
 *   12/kt` (per 1000 ticks, so it does not move with the speed) and `scout 82%`, each `-` when unknown
 */
function liveNumbers(s) {
    const calls = s.callsPerKiloTick;
    return {
        predators: typeof s.predators !== 'number' ? 'pred -' : `pred ${grouped(s.predators)}`,
        calls: typeof calls !== 'number' ? 'calls -' : `calls ${calls < 10 ? calls.toFixed(1) : grouped(calls)}/kt`,
        dominant: !s.largest ? '-' : `${s.largest.name} ${Math.round(s.largest.share * 100)}%`,
    };
}

/** @type {TopBarInput} */
const EMPTY_INPUT = Object.freeze({
    tick: 0,
    population: 0,
    ticksPerSecond: 0,
    status: 'Starting a new world',
    calendar: null,
    seasonProgress: 0,
    types: [],
    bornShare: null,
    predators: null,
    callsPerKiloTick: null,
    largest: null,
});

/**
 * @typedef {object} TopBarView
 * @property {string} status the status sentence
 * @property {string} calendar `Year 3, Summer, Gen 41`, empty before any stats
 * @property {number} seasonProgress 0 to 1, drawn as the ring
 * @property {string} speed `x4`, with the sustained rate beside it when it differs, or `paused`
 * @property {{name: string, count: string}[]} types the counts by specialisation
 * @property {string} born `born 42%`, `born -` before any birth
 * @property {string} predators `pred 34`, `pred -` before any stats
 * @property {string} calls `calls 12/kt` (alarm and hunt calls per 1000 ticks), `calls -` before any stats
 * @property {string} dominant the largest specialisation with its share, `scout 82%`, `-` when unknown
 * @property {string} notice a short message, empty for none
 * @property {{tick: string, elapsed: string}} debug the tick and the run time, for the help drawer
 */

/**
 * @param {TopBarInput | null} stats what `topBarInput` read, null before one arrives
 * @param {{requestedTicksPerSecond: number, notice: string}} state the app state
 * @param {boolean} paused whether the sim is paused
 * @returns {TopBarView} the strings to show
 */
export function topBarView(stats, state, paused) {
    const s = stats ?? EMPTY_INPUT;
    const c = s.calendar;
    return {
        status: s.status,
        calendar: c === null ? '' : `Year ${c.year}, ${c.season}, Gen ${c.generation}`,
        seasonProgress: s.seasonProgress,
        speed: speedText(stats, state, paused),
        types: s.types.map((t) => ({ name: t.name, count: grouped(t.count) })),
        born: bornText(s.bornShare),
        ...liveNumbers(s),
        notice: state.notice,
        debug: { tick: `tick ${grouped(s.tick)}`, elapsed: elapsedLabel(s.tick) },
    };
}

const TEXT_FIELDS = ['status', 'calendar', 'speed', 'born', 'predators', 'calls', 'dominant', 'notice'];

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
    make('status');
    make('seasonBox');
    const ring = doc.createElement('span');
    ring.className = 'season-ring';
    nodes.seasonBox.appendChild(ring);
    nodes.calendar = doc.createElement('span');
    nodes.seasonBox.appendChild(nodes.calendar);
    make('speed');
    make('types');
    for (const key of ['born', 'predators', 'calls', 'dominant', 'notice']) {
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
