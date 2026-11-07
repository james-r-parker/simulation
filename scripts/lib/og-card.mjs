// The 1200 x 630 share card as an HTML page, for scripts/build-icons.mjs to screenshot. Pure and seeded: the same
// seed places the same motes.

import { createPrng } from '../../js/app/prng.js';

const MOTE_COLOURS = Object.freeze(['#5ee6a8', '#5ee6a8', '#6cc6ff', '#ffbe3c', '#b48cff']);

/**
 * Glowing motes scattered over the card, fainter where the text sits.
 * @param {{ seed: number, count: number, width: number, height: number }} options The field.
 * @returns {{ x: number, y: number, r: number, colour: string, alpha: number }[]} One entry per mote.
 */
export function motes({ seed, count, width, height }) {
    const { next } = createPrng(seed);
    return Array.from({ length: count }, () => {
        const x = Math.round(next() * width);
        const y = Math.round(next() * height);
        const r = Math.round((1.2 + next() ** 3 * 4.8) * 10) / 10;
        const colour = MOTE_COLOURS[Math.floor(next() * MOTE_COLOURS.length)];
        const behindText = x > width * 0.42;
        const alpha = Math.round((behindText ? 0.15 + next() * 0.3 : 0.3 + next() * 0.6) * 100) / 100;
        return { x, y, r, colour, alpha };
    });
}

/**
 * The card page: background, motes, the mark on the left, the name, tagline and address on the right.
 * @param {{ mark: string, width: number, height: number }} options The mark as SVG text (sized by the page) and the card size.
 * @returns {string} The HTML document.
 */
export function ogCardHtml({ mark, width, height }) {
    const dots = motes({ seed: 20261107, count: 90, width, height })
        .map(
            (m) =>
                `<circle cx="${m.x}" cy="${m.y}" r="${m.r}" fill="${m.colour}" fill-opacity="${m.alpha}" filter="url(#glow)"/>`,
        )
        .join('');
    return `<!doctype html><html><head><meta charset="utf-8"><style>
html, body { margin: 0; width: ${width}px; height: ${height}px; overflow: hidden; }
body { position: relative; background: radial-gradient(ellipse at 28% 50%, #10233a 0%, #070c14 55%, #03050a 100%);
  font-family: Lato, 'DejaVu Sans', sans-serif; color: #e8f4ff; }
.field { position: absolute; inset: 0; }
.mark { position: absolute; left: 60px; top: 95px; width: 440px; height: 440px; }
.mark svg { width: 100%; height: 100%; display: block; }
.mark .tile { display: none; }
.text { position: absolute; left: 540px; right: 60px; top: 0; bottom: 0; display: flex; flex-direction: column;
  justify-content: center; }
h1 { margin: 0; font-size: 96px; font-weight: 900; line-height: 1; letter-spacing: -1px; }
h1 span { color: #5ee6a8; }
p { margin: 26px 0 0; font-size: 38px; line-height: 1.25; color: #b9c9da; }
.facts { margin-top: 30px; font-size: 26px; color: #7f97ad; }
.url { position: absolute; left: 540px; bottom: 54px; font-size: 26px; color: #5ee6a8; letter-spacing: 0.5px; }
</style></head><body>
<svg class="field" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
<defs><filter id="glow" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="2.5" result="b"/>
<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>${dots}</svg>
<div class="mark">${mark}</div>
<div class="text"><h1>Blob <span>Evolution</span></h1>
<p>Artificial life that<br>evolves while you watch</p>
<div class="facts">Neural-network brains - eat, hunt, flee, mate</div></div>
<div class="url">matrix.dotnethelp.co.uk</div>
</body></html>`;
}
