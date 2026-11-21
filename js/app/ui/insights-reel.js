// The insights drawer's Reel tab: one tile per scene of docs/principles.md with the best clip of it this world (a
// video that loops), the tick it happened, and a button that jumps the world's follow to a live instance. A scene with
// no clip reads `not seen yet`, and one with no on-screen signature `no live signal`. A tile's video is given its source
// only when the clip changes, so a refresh never restarts a clip that is playing.

/** What a scene with no clip and no instance reads. */
export const NOT_SEEN = 'not seen yet';

/**
 * @typedef {object} ReelTile
 * @property {string} id the scene's id
 * @property {string} name the scene's name
 * @property {string} status what the tile says: the tick and score of the clip, or why there is none
 * @property {string | null} url the clip's object URL, null for none
 * @property {{kind: string, name: string, genomeId: number, x: number, y: number} | null} live where a live instance is,
 *   null when the scene has had none (the button is off)
 */

/**
 * @typedef {{root: any, name: any, status: any, video: any, button: any, live: ReelTile['live']}} TileParts
 */

/**
 * @param {{createElement: (tag: string) => any}} doc the document
 * @param {(live: ReelTile['live']) => void} jump what the jump button does with the tile's live target
 * @returns {TileParts} a tile's elements, not yet in the page
 */
function buildTile(doc, jump) {
    /** @type {TileParts} */
    const parts = {
        root: doc.createElement('section'),
        name: doc.createElement('h3'),
        status: doc.createElement('p'),
        video: doc.createElement('video'),
        button: doc.createElement('button'),
        live: null,
    };
    parts.root.className = 'insights-reel-tile';
    parts.name.className = 'insights-heading';
    parts.status.className = 'insights-note';
    parts.video.className = 'insights-reel-video';
    Object.assign(parts.video, { controls: true, loop: true, muted: true, preload: 'metadata', src: '' });
    parts.button.className = 'control insights-reel-live';
    parts.button.textContent = 'Jump to live';
    parts.button.addEventListener('click', () => jump(parts.live));
    for (const part of [parts.name, parts.status, parts.video, parts.button]) {
        parts.root.appendChild(part);
    }
    return parts;
}

/**
 * @param {TileParts} parts a tile's elements
 * @param {ReelTile | undefined} tile what it shows, undefined to hide it
 * @returns {void}
 */
function paintTile(parts, tile) {
    parts.root.hidden = tile === undefined;
    if (tile === undefined) {
        return;
    }
    parts.live = tile.live;
    for (const [node, text] of [
        [parts.name, tile.name],
        [parts.status, tile.status],
    ]) {
        if (node.textContent !== text) {
            node.textContent = text;
        }
    }
    parts.video.hidden = tile.url === null;
    const source = tile.url ?? '';
    if (parts.video.src !== source) {
        parts.video.src = source;
    }
    parts.button.disabled = tile.live === null;
}

/**
 * @param {{createElement: (tag: string) => any}} doc the document
 * @param {any} panel the tab's element
 * @param {{onPick?: (target: any) => void}} hooks `onPick` hears the jump-to-live button's target
 * @returns {{update: (tiles: readonly ReelTile[]) => void}} `update` shows the tiles
 */
export function mountReelTab(doc, panel, hooks) {
    const grid = doc.createElement('div');
    grid.className = 'insights-reel-grid';
    panel.appendChild(grid);
    /** @type {TileParts[]} */
    const pool = [];
    const jump = (/** @type {ReelTile['live']} */ live) => live !== null && hooks.onPick?.(live);
    return {
        update(tiles) {
            while (pool.length < tiles.length) {
                const parts = buildTile(doc, jump);
                grid.appendChild(parts.root);
                pool.push(parts);
            }
            pool.forEach((parts, i) => paintTile(parts, tiles[i]));
        },
    };
}
