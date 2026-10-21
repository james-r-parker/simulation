// The five silhouettes as small white SVG icons, nose up, for the top bar and the inspector header. Path data in a
// 24 x 24 box; `createIcon` builds one element over an injected document.

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Path data by specialisation name, matching `SILHOUETTES` in the renderer. */
export const ICON_PATHS = Object.freeze({
    predator: 'M12 2 L19.5 21 L12 16.5 L4.5 21 Z',
    forager: 'M12 4 A8 8 0 1 0 12.01 4 Z',
    reproducer: 'M12 3 L19.8 7.5 L19.8 16.5 L12 21 L4.2 16.5 L4.2 7.5 Z',
    scout: 'M12 2 C16.5 2 16.5 12 12 22 C7.5 12 7.5 2 12 2 Z',
    defender: 'M7 4 H17 A3 3 0 0 1 20 7 V17 A3 3 0 0 1 17 20 H7 A3 3 0 0 1 4 17 V7 A3 3 0 0 1 7 4 Z',
});

/** Drawn for a specialisation with no icon of its own: a plain disc. */
const FALLBACK = 'forager';

/**
 * @param {string} name a specialisation name
 * @returns {string} its path data, a disc's for a name with none
 */
export function iconPath(name) {
    return /** @type {Record<string, string>} */ (ICON_PATHS)[name] ?? ICON_PATHS[FALLBACK];
}

/**
 * @param {{createElementNS: (ns: string, tag: string) => any}} doc the document
 * @param {{name: string, color?: string, size?: number}} icon the specialisation and an optional CSS colour (white
 *   when absent) and pixel size (14 when absent)
 * @returns {any} an `svg` element holding the silhouette
 */
export function createIcon(doc, { name, color = '#fff', size = 14 }) {
    const svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    svg.setAttribute('aria-hidden', 'true');
    const path = doc.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', iconPath(name));
    path.setAttribute('fill', color);
    svg.appendChild(path);
    return svg;
}
