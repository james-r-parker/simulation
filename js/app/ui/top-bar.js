// The minimal top bar: the tick, the speed and the population. `topBarView` turns the newest stats into the strings to
// show; `mountTopBar` owns three text nodes and rewrites one only when its text changed.

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
 * What the bar shows comes from the newest snapshot where there is one (stats stop while the sim is paused, but each step
 * posts a snapshot), and from the newest stats for the rate.
 * @param {{latest: {tick: number, u32: Uint32Array} | null, stats: {ticksPerSecond: number} | null} | null} client the
 *   worker client, null before the first start
 * @returns {{tick: number, population: number, ticksPerSecond: number} | null} what `topBarView` reads, null before any
 *   snapshot has arrived
 */
export function topBarInput(client) {
    if (client === null || client.latest === null) {
        return null;
    }
    return {
        tick: client.latest.tick,
        population: client.latest.u32[1],
        ticksPerSecond: client.stats?.ticksPerSecond ?? 0,
    };
}

/**
 * @param {{tick: number, population: number, ticksPerSecond: number} | null} stats what `topBarInput` read, null before one arrives
 * @param {{requestedTicksPerSecond: number, notice: string}} state the app state
 * @param {boolean} paused whether the sim is paused
 * @returns {{tick: string, speed: string, population: string, notice: string}} the strings to show; the speed shows the
 *   requested multiple, with the rate actually sustained beside it when it differs
 */
export function topBarView(stats, state, paused) {
    const requested = state.requestedTicksPerSecond / BASE_TICKS_PER_SECOND;
    let speed = paused ? 'paused' : speedLabel(requested);
    if (!paused && stats !== null && Math.abs(stats.ticksPerSecond - state.requestedTicksPerSecond) >= 0.5) {
        speed += ` (${speedLabel(Math.round((stats.ticksPerSecond / BASE_TICKS_PER_SECOND) * 100) / 100)})`;
    }
    return {
        tick: stats === null ? 'tick 0' : `tick ${grouped(stats.tick)}`,
        speed,
        population: stats === null ? 'pop 0' : `pop ${grouped(stats.population)}`,
        notice: state.notice,
    };
}

/**
 * @param {{createElement: (tag: string) => any}} doc the document
 * @param {{appendChild: (child: any) => void}} root the bar element
 * @returns {(view: ReturnType<typeof topBarView>) => void} writes a view into the bar, touching only changed text
 */
export function mountTopBar(doc, root) {
    /** @type {Record<string, any>} */
    const nodes = {};
    for (const key of ['tick', 'speed', 'population', 'notice']) {
        nodes[key] = doc.createElement('span');
        nodes[key].className = `top-bar-${key}`;
        root.appendChild(nodes[key]);
    }
    return (view) => {
        for (const key of Object.keys(nodes)) {
            const text = /** @type {Record<string, string>} */ (view)[key];
            if (nodes[key].textContent !== text) {
                nodes[key].textContent = text;
            }
        }
    };
}
