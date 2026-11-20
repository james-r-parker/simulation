// What the director reads that the snapshot does not carry: the effects the worker posted and the ticker items, kept in
// small preallocated rings for the last `WINDOW_S` simulated seconds. The page notes each effect as the player plays it
// and each ticker message as it arrives; the driver asks for the recent ones twice a second.

/** Effects kept. */
export const FEED_EFFECTS = 512;
/** Ticker items kept. */
export const FEED_TICKER = 64;
/** How far back the director looks, simulated seconds. */
export const WINDOW_S = 10;

/**
 * @typedef {object} DirectorFeed
 * @property {(effect: {kind: number, tick: number, x: number, y: number, a: number, b: number, c: number, d: number}) => void} noteEffect
 *   keeps an effect (copied; the caller reuses its record)
 * @property {(items: readonly {tick: number, kind: string, lineageId?: number, x?: number, y?: number}[]) => void} noteTicker
 *   keeps ticker items
 * @property {(tick: number, ticksPerSecond: number) => {effects: any[], ticker: any[]}} recent the records of the last
 *   `WINDOW_S` seconds before `tick`, oldest first, in new arrays
 * @property {() => void} clear forgets everything, for a new world
 */

/**
 * @param {number} size ring capacity
 * @param {() => any} make makes one record
 * @returns {{items: any[], next: number, count: number}} an empty ring
 */
function ring(size, make) {
    return { items: Array.from({ length: size }, make), next: 0, count: 0 };
}

/**
 * @param {{items: any[], next: number, count: number}} r the ring
 * @returns {any} the record to overwrite, advancing the ring
 */
function take(r) {
    const record = r.items[r.next];
    r.next = (r.next + 1) % r.items.length;
    r.count = Math.min(r.count + 1, r.items.length);
    return record;
}

/**
 * @param {{items: any[], next: number, count: number}} r the ring
 * @param {number} from the oldest tick wanted
 * @returns {any[]} the records at or after `from`, oldest first
 */
function since(r, from) {
    const out = [];
    const n = r.items.length;
    for (let i = 0; i < r.count; i++) {
        const record = r.items[(r.next - r.count + i + n * 2) % n];
        if (record.tick >= from) {
            out.push(record);
        }
    }
    return out;
}

/** @returns {DirectorFeed} an empty feed */
export function createDirectorFeed() {
    const effects = ring(FEED_EFFECTS, () => ({ kind: 0, tick: 0, x: 0, y: 0, a: 0, b: 0, c: 0, d: 0 }));
    const ticker = ring(FEED_TICKER, () => ({ tick: 0, kind: '', lineageId: undefined, x: undefined, y: undefined }));
    return {
        noteEffect(e) {
            Object.assign(take(effects), {
                kind: e.kind,
                tick: e.tick,
                x: e.x,
                y: e.y,
                a: e.a,
                b: e.b,
                c: e.c,
                d: e.d,
            });
        },
        noteTicker(items) {
            for (const item of items) {
                Object.assign(take(ticker), {
                    tick: item.tick,
                    kind: item.kind,
                    lineageId: item.lineageId,
                    x: item.x,
                    y: item.y,
                });
            }
        },
        recent(tick, ticksPerSecond) {
            const from = tick - WINDOW_S * ticksPerSecond;
            return { effects: since(effects, from), ticker: since(ticker, from) };
        },
        clear() {
            effects.count = 0;
            ticker.count = 0;
        },
    };
}
