// The event ticker at the bottom edge: at most 4 lines, newest at the bottom, each shown for 8 s and fading over the
// last second and a half. `createTickerQueue` is the bounded queue, `formatTickerItem` the text, and `mountTicker`
// writes the lines into recycled nodes.

/** The most lines shown at once. */
export const TICKER_LINES = 4;
/** How long a line stays, in ms. */
export const TICKER_SHOW_MS = 8000;
/** The fade at the end of a line's life, in ms. */
export const TICKER_FADE_MS = 1500;
/** The longest line, in characters; longer text is cut with `...`. */
export const TICKER_MAX_CHARS = 120;

/**
 * @param {{text: string}} item a `ticker` message item
 * @returns {string} the line to show, cut to `TICKER_MAX_CHARS`
 */
export function formatTickerItem(item) {
    const text = String(item.text).trim();
    return text.length > TICKER_MAX_CHARS ? `${text.slice(0, TICKER_MAX_CHARS - 3)}...` : text;
}

/**
 * @typedef {object} TickerLine
 * @property {string} text the line
 * @property {string} kind the ticker kind, for styling
 * @property {number} shownAtMs when it arrived
 */

/**
 * @param {{lines?: number, showMs?: number}} [options] the line count and show time, `TICKER_LINES` and
 *   `TICKER_SHOW_MS` by default
 * @returns {{push: (items: {text: string, kind: string}[], nowMs: number) => void,
 *   current: (nowMs: number) => TickerLine[], clear: () => void}} the queue: `push` adds the items arriving at a time
 *   (the oldest go when more than `lines` are held); `current` drops the expired lines and returns the rest, oldest
 *   first, as an array it reuses
 */
export function createTickerQueue({ lines = TICKER_LINES, showMs = TICKER_SHOW_MS } = {}) {
    /** @type {TickerLine[]} */
    const held = [];
    return {
        push(items, nowMs) {
            for (const item of items) {
                held.push({ text: formatTickerItem(item), kind: item.kind, shownAtMs: nowMs });
                if (held.length > lines) {
                    held.shift();
                }
            }
        },
        current(nowMs) {
            while (held.length > 0 && nowMs - held[0].shownAtMs >= showMs) {
                held.shift();
            }
            return held;
        },
        clear() {
            held.length = 0;
        },
    };
}

/**
 * @param {number} ageMs how long a line has been up
 * @returns {number} its opacity: 1 until the fade starts, then falling to 0
 */
export function lineOpacity(ageMs) {
    const left = TICKER_SHOW_MS - ageMs;
    return left >= TICKER_FADE_MS ? 1 : Math.max(left / TICKER_FADE_MS, 0);
}

/**
 * @param {{createElement: (tag: string) => any}} doc the document
 * @param {{appendChild: (child: any) => void}} root the ticker element
 * @returns {(lines: TickerLine[], nowMs: number) => void} writes the lines into the recycled nodes: unused nodes are
 *   hidden, and text, class and opacity are written only when they changed
 */
export function mountTicker(doc, root) {
    const nodes = Array.from({ length: TICKER_LINES }, () => {
        const node = doc.createElement('div');
        node.className = 'ticker-line';
        node.hidden = true;
        root.appendChild(node);
        return node;
    });
    return (lines, nowMs) => {
        nodes.forEach((node, i) => {
            const line = lines[i];
            if (line === undefined) {
                if (!node.hidden) {
                    node.hidden = true;
                    node.textContent = '';
                }
                return;
            }
            node.hidden = false;
            if (node.textContent !== line.text) {
                node.textContent = line.text;
                node.className = `ticker-line ticker-${line.kind}`;
            }
            const opacity = String(Math.round(lineOpacity(nowMs - line.shownAtMs) * 20) / 20);
            if (node.style.opacity !== opacity) {
                node.style.opacity = opacity;
            }
        });
    };
}
