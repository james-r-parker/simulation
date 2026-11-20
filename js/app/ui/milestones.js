// The milestones list at the foot of the charts drawer: the notable events of the world (a family's last stand, a first
// pack kill, a record hunt streak, the oldest blob yet, a lineage dying out), newest first, with the simulated time of
// each. Over an injected document; it rewrites the list only when a milestone was added.

/** The most lines shown. */
export const MILESTONE_LINES = 12;

/**
 * @param {number} tick a tick
 * @param {number} [ticksPerSecond] ticks in a simulated second
 * @returns {string} the simulated time `m:ss` or `h:mm:ss`
 */
export function clockLabel(tick, ticksPerSecond = 60) {
    const s = Math.floor(tick / ticksPerSecond);
    const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
    const h = Math.floor(s / 3600);
    return h > 0 ? `${h}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}` : `${Math.floor(s / 60)}:${pad(s % 60)}`;
}

/**
 * @param {{createElement: (tag: string) => any}} doc the document
 * @param {{appendChild: (child: any) => void}} root the drawer body
 * @returns {{update: (milestones: readonly {tick: number, text: string}[]) => boolean}} `update` shows the newest
 *   `MILESTONE_LINES`, newest first, and returns whether it rewrote the list
 */
export function mountMilestones(doc, root) {
    const box = doc.createElement('section');
    box.className = 'chart chart-milestones';
    const title = doc.createElement('h3');
    title.textContent = 'Milestones';
    const list = doc.createElement('ul');
    list.className = 'milestones';
    box.appendChild(title);
    box.appendChild(list);
    root.appendChild(box);
    let shown = -1;
    let newest = -1;
    return {
        update(milestones) {
            const last = milestones.length === 0 ? -1 : milestones[milestones.length - 1].tick;
            if (milestones.length === shown && last === newest) {
                return false;
            }
            shown = milestones.length;
            newest = last;
            list.replaceChildren();
            for (const m of milestones.slice(-MILESTONE_LINES).reverse()) {
                const item = doc.createElement('li');
                item.textContent = `${clockLabel(m.tick)}  ${m.text}`;
                list.appendChild(item);
            }
            return true;
        },
    };
}
