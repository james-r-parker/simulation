// Formats the chase envelope for `npm run audit:chase`: the body table, then per pair its catch grid, fair band and
// the energy a kill costs against what it returns.
import { BEARINGS, DISTANCE_SHARES, FAIR_BAND } from '../../js/evo/chase-envelope.js';
import { padTable } from './drill-report.mjs';

const fixed = (/** @type {number} */ v, /** @type {number} */ digits = 1) => v.toFixed(digits);

/**
 * @param {readonly import('../../js/evo/chase-body.js').BodyRow[]} bodies the body table
 * @returns {string} the table, one row per specialisation
 */
export function formatBodies(bodies) {
    const head = ['body', 'cruise', 'sprint', 'turn r', 'sprint turn r', 'stop', 'energy/100', 'sprint energy/100'];
    const rows = bodies.map((b) => [
        b.name,
        fixed(b.cruiseSpeed),
        fixed(b.sprintSpeed),
        fixed(b.turnRadius),
        fixed(b.sprintTurnRadius),
        fixed(b.stopDistance, 0),
        fixed(b.cruiseEnergy, 0),
        fixed(b.sprintEnergy, 0),
    ]);
    return padTable([head, ...rows]).join('\n');
}

/**
 * @param {import('../../js/evo/chase-envelope.js').PairResult} pair one pair's result
 * @returns {string} its catch grid (distance down, bearing across), the fair band and the energy per kill
 */
export function formatPair(pair) {
    const bearings = Array.from({ length: BEARINGS }, (_, b) => String(Math.round((360 * b) / BEARINGS - 180)));
    const head = ['view share', ...bearings, 'mean', 'spent/kill', 'returned/kill'];
    const rows = DISTANCE_SHARES.map((share, d) => [
        fixed(share, 1),
        ...pair.grid[d].map((c) => fixed(c.share, 2)),
        fixed(pair.byDistance[d], 2),
        pair.energy[d].spent === 0 ? '-' : fixed(pair.energy[d].spent, 0),
        pair.energy[d].returned === 0 ? '-' : fixed(pair.energy[d].returned, 0),
    ]);
    const band = pair.band.length === 0 ? 'none' : pair.band.map((s) => fixed(s, 1)).join(', ');
    return `${pair.pursuer} chases ${pair.evader}\n${padTable([head, ...rows]).join('\n')}\nfair band (${FAIR_BAND.low} to ${FAIR_BAND.high}): ${band}`;
}
