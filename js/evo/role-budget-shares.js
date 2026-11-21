// The catch share of the cross-check (docs/designs/role-budget.md, "Tolerances": a catch share against the audit, sign and
// rank per bearing only). The share of a bearing is the share of its start distances at which a kill lands. The formula is
// read against the scripted scene of `audit:chase` in the sim (the same arena and oracle brains, no start jitter), whose
// shares are 0 or 1 per distance; the audit's own noisy shares are tested against the margins in
// test/evo/role-budget-chase.slow.test.js.

/**
 * @typedef {object} BearingShare one bearing's share of kills, formula and sim
 * @property {number} bearing the bearing
 * @property {number} formula the share of start distances at which the formula kills
 * @property {number} sim the share at which the sim kills
 * @property {boolean} signDrift whether one share is above 0 and the other is not
 */

/**
 * @typedef {object} CatchShares
 * @property {BearingShare[]} bearings each bearing in order of first appearance
 * @property {number} rankDrift the pairs of bearings the formula orders against the sim (a strictly higher share on one
 *   side and a strictly lower on the other; ties are not read)
 * @property {number} drift the bearings with a sign drift plus the pairs with a rank drift
 */

/**
 * @param {{bearing: number, formula: number | null, sim: number | null, edge: boolean}[]} cells the cells of one pair and
 *   bound; the cells at the hunter's view (`edge`) are not read, as the cross-check does not read them
 * @returns {CatchShares} the shares per bearing, and the sign and rank drift between formula and sim
 */
export function catchShares(cells) {
    /** @type {Map<number, {n: number, formula: number, sim: number}>} */
    const tally = new Map();
    for (const c of cells.filter((cell) => !cell.edge)) {
        const t = tally.get(c.bearing) ?? { n: 0, formula: 0, sim: 0 };
        t.n += 1;
        t.formula += c.formula === null ? 0 : 1;
        t.sim += c.sim === null ? 0 : 1;
        tally.set(c.bearing, t);
    }
    const bearings = [...tally].map(([bearing, t]) => ({
        bearing,
        formula: t.formula / t.n,
        sim: t.sim / t.n,
        signDrift: t.formula > 0 !== t.sim > 0,
    }));
    let rankDrift = 0;
    for (let i = 0; i < bearings.length; i++) {
        for (let j = i + 1; j < bearings.length; j++) {
            const against = (bearings[i].formula - bearings[j].formula) * (bearings[i].sim - bearings[j].sim) < 0;
            rankDrift += against ? 1 : 0;
        }
    }
    return { bearings, rankDrift, drift: bearings.filter((b) => b.signDrift).length + rankDrift };
}
