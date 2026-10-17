// The pure half of the v6 browser perf run: the viewport and refresh checks, the GC pause sum over a Chromium trace,
// the budgets, and the per-viewport baseline entry.

/** The refresh rate under which a recording is refused unless `--allow-low-refresh` is given. */
export const MIN_REFRESH_HZ = 120;

/** Long tasks before this page time (ms) are warm-up and not counted. */
export const WARMUP_MS = 5000;

/**
 * The trace event names that are one whole GC pause on `CrRendererMain`. Their children (`V8.GC_SCAVENGER`,
 * `V8.GCCompactor` and the phase events) sit inside them, so summing only these counts each pause once. Verified
 * against a Chromium 1xx trace in docs/designs/sim-notes.md.
 */
export const GC_PAUSE_EVENTS = Object.freeze(['MinorGC', 'MajorGC']);

/** The trace categories that carry them (`MinorGC` and `MajorGC` are in `v8`; the doc names the GC detail category). */
export const GC_TRACE_CATEGORIES = Object.freeze(['v8', 'disabled-by-default-v8.gc']);

/** Renderer names that mean software rendering, not the GPU. */
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|software|softpipe/i;

/**
 * The Phase 2 and 3 budgets on the dev machine (3840x2160 and 2560x1440, 500 agents, quality 0, 60 s). A metric with a
 * `null` value is reported but is not a done criterion.
 * @type {Readonly<Record<string, {max: number, criterion: boolean}>>}
 */
export const BUDGETS = Object.freeze({
    'browser.frame_p50_ms': { max: 4.5, criterion: true },
    'browser.frame_p95_ms': { max: 8.4, criterion: true },
    'browser.frame_p99_ms': { max: 12.5, criterion: true },
    'browser.draw_cpu_p95_ms': { max: 2.0, criterion: true },
    'browser.gpu_frame_p95_ms': { max: 4.0, criterion: false },
    'browser.main_long_tasks': { max: 0, criterion: true },
    'browser.gc_pause_ms': { max: 30, criterion: true },
});

/**
 * @param {string} text `WIDTHxHEIGHT`
 * @returns {{width: number, height: number}} the viewport
 * @throws {Error} when the text is not two positive integers joined by `x`
 */
export function parseViewport(text) {
    const match = /^(\d{2,5})x(\d{2,5})$/.exec(text);
    if (match === null) {
        throw new Error(`--viewport must be WIDTHxHEIGHT such as 3840x2160, got "${text}"`);
    }
    return { width: Number(match[1]), height: Number(match[2]) };
}

/**
 * @param {number} refreshHz the display's measured refresh rate from `__perf`
 * @param {boolean} allowLow record a slower display anyway
 * @returns {void}
 * @throws {Error} when the display is under `MIN_REFRESH_HZ` and `allowLow` is false
 */
export function checkRefresh(refreshHz, allowLow) {
    if (!(refreshHz >= MIN_REFRESH_HZ) && !allowLow) {
        throw new Error(
            `the display refreshes at ${refreshHz} Hz, under ${MIN_REFRESH_HZ} Hz: the budgets are for the 240 Hz display; pass --allow-low-refresh to record it anyway`,
        );
    }
}

/**
 * Sums the durations of the GC events on the renderer main thread.
 * @param {{ph: string, name: string, pid: number, tid: number, dur?: number, args?: Record<string, any>}[]} events a
 *   Chromium trace's `traceEvents`
 * @param {readonly string[]} [gcNames] the event names that are a whole GC pause; `GC_PAUSE_EVENTS` by default
 * @returns {number} milliseconds, to 2 decimals; 0 when there is no `CrRendererMain` thread or no GC event
 */
export function sumGcPauseMs(events, gcNames = GC_PAUSE_EVENTS) {
    const mains = new Set(
        events
            .filter((e) => e.ph === 'M' && e.name === 'thread_name' && e.args?.name === 'CrRendererMain')
            .map((e) => `${e.pid}:${e.tid}`),
    );
    let micros = 0;
    for (const e of events) {
        if (e.ph === 'X' && gcNames.includes(e.name) && mains.has(`${e.pid}:${e.tid}`)) {
            micros += e.dur ?? 0;
        }
    }
    return Math.round(micros / 10) / 100;
}

/**
 * @param {number[]} times page times in ms of the long tasks seen
 * @returns {number} how many started after the warm-up
 */
export function longTasksAfterWarmup(times) {
    return times.filter((t) => t >= WARMUP_MS).length;
}

/**
 * @param {Record<string, number | null>} metrics the measured metrics
 * @returns {{metric: string, value: number, max: number, criterion: boolean}[]} each metric over its budget; a null
 *   metric is absent from the list
 */
export function overBudget(metrics) {
    return Object.entries(BUDGETS).flatMap(([metric, { max, criterion }]) => {
        const value = metrics[metric];
        return typeof value === 'number' && value > max ? [{ metric, value, max, criterion }] : [];
    });
}

/**
 * @param {number | null | undefined} value a reading
 * @param {string} name what it is, for the error
 * @returns {number} the value
 * @throws {Error} when it is not a finite number
 */
function finite(value, name) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`${name} must be a finite number, got ${JSON.stringify(value)}`);
    }
    return value;
}

/**
 * @param {{p95?: number} | null | undefined} spread a percentile summary, absent when the timer query is
 * @param {string} name what it is, for the error
 * @returns {number | null} its p95, null when it is absent
 */
function optionalP95(spread, name) {
    return spread === null || spread === undefined ? null : finite(spread.p95, name);
}

/**
 * @param {any} perf the `__perf()` payload
 * @returns {{refreshHz: number, frames: number, agents: number | null}} what was measured besides the metrics
 */
function facts(perf) {
    return {
        refreshHz: finite(perf.refreshHz, 'refreshHz'),
        frames: finite(perf.frames, 'frames'),
        agents: perf.agents ?? null,
    };
}

/**
 * Builds one viewport's baseline entry from a `__perf()` payload and the script's own readings.
 * @param {{perf: any, longTaskTimes: number[], gcPauseMs: number, run: Record<string, any>}} input the readings and
 *   run facts (browser, gpuAdapter, viewport, agents, seconds, commit, recordedAt)
 * @returns {{metrics: Record<string, number | null>, [key: string]: any}} the entry
 * @throws {Error} when the payload is not from the v6 app or a time is not finite
 */
export function buildV6Entry({ perf, longTaskTimes, gcPauseMs, run }) {
    if (!perf || perf.app !== 'v6') {
        throw new Error(`window.__perf().app must be "v6", got ${JSON.stringify(perf?.app)}`);
    }
    const metrics = {
        'browser.frame_p50_ms': finite(perf.frameMs?.p50, 'frameMs.p50'),
        'browser.frame_p95_ms': finite(perf.frameMs?.p95, 'frameMs.p95'),
        'browser.frame_p99_ms': finite(perf.frameMs?.p99, 'frameMs.p99'),
        'browser.draw_cpu_p95_ms': finite(perf.drawMs?.p95, 'drawMs.p95'),
        'browser.gpu_frame_p95_ms': optionalP95(perf.gpuMs, 'gpuMs.p95'),
        'browser.main_long_tasks': longTasksAfterWarmup(longTaskTimes),
        'browser.gc_pause_ms': finite(gcPauseMs, 'gcPauseMs'),
    };
    return { metrics, ...facts(perf), ...run };
}

/**
 * @param {Record<string, any> | null} existing the parsed baseline file, null when there is none
 * @param {string} viewport `WIDTHxHEIGHT`, the key
 * @param {Record<string, any>} entry the new entry
 * @returns {Record<string, any>} the file contents: the other viewports kept, this one replaced
 */
export function mergeBaseline(existing, viewport, entry) {
    return { ...(existing ?? {}), [viewport]: entry };
}

/**
 * @param {string} renderer the WebGL `UNMASKED_RENDERER_WEBGL` string
 * @param {boolean} allowSoftware record a software renderer anyway
 * @returns {void}
 * @throws {Error} when the renderer is software and `allowSoftware` is false
 */
export function checkRenderer(renderer, allowSoftware) {
    if (SOFTWARE_RENDERER.test(renderer) && !allowSoftware) {
        throw new Error(
            `WebGL renderer "${renderer}" is software rendering, not the GPU; pass --allow-fallback to record it anyway`,
        );
    }
}

/**
 * @param {{viewport: string, entry: Record<string, any>}} result the measured entry
 * @returns {string[]} the report lines: the run, each metric, each metric over its budget and the verdict
 */
export function formatReport({ viewport, entry }) {
    const lines = [
        `Viewport ${viewport}: ${entry.frames} frames, ${entry.agents} agents, ${entry.refreshHz} Hz, ${entry.gpuAdapter}`,
        ...Object.entries(entry.metrics).map(([name, value]) => `${name}: ${value}`),
    ];
    const over = overBudget(entry.metrics);
    for (const { metric, value, max, criterion } of over) {
        lines.push(`${criterion ? 'OVER BUDGET' : 'over (reported only)'}: ${metric} ${value} > ${max}`);
    }
    lines.push(over.some((o) => o.criterion) ? 'Budgets: not met' : 'Budgets: met');
    return lines;
}
