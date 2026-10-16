// The MAP-Elites archive: per specialisation a 10 x 10 grid (speedMean x crowdingMean) whose cells each hold an
// elite and a challenger, with Welford statistics of their fitnesses. Every row is preallocated by `createArchive`,
// so `offer` allocates nothing.
//
// A "place" is one genome slot: `(spec * 100 + cell) * 2 + which`, `which` being ELITE (0) or CHALLENGER (1).
// A clone's `archiveRef` is `spec * 100 + cell` (the doc's encoding); the policy also keeps the cloned genome's
// id (`refId`), and a clone's fitness is added only to the place in that cell that still holds `refId`.

import { GENOME_SPECS, rejectGenome } from './genome.js';
import { WELFORD_STRIDE, welfordAdd, welfordMean, welfordSd } from './welford.js';
import { nextInt } from '../sim/rng.js';

/** Cells per grid axis. */
export const CELLS_PER_AXIS = 10;
/** Cells per specialisation grid. */
export const CELLS = CELLS_PER_AXIS * CELLS_PER_AXIS;
/** The z of the lower bound (95% one-sided-ish band). */
export const Z = 1.96;
/** The `cv` used until `CV_MIN_GENOMES` genomes have `n >= 2`. */
export const CV_DEFAULT = 0.3;
/** Genomes with `n >= 2` needed before `cv` is measured. */
export const CV_MIN_GENOMES = 5;
/** Elites drawn (with replacement) by `selectParent`. */
export const NEIGHBOUR_DRAWS = 3;
/** Fitness evaluations a challenger gets from clones before the elites are re-tested instead. */
export const CLONE_CHALLENGER_N = 3;
/** The elite place of a cell. */
export const ELITE = 0;
/** The challenger place of a cell. */
export const CHALLENGER = 1;

const SPEC_COUNT = GENOME_SPECS.length;
const PLACES = SPEC_COUNT * CELLS * 2;

/**
 * @typedef {object} Archive
 * @property {Readonly<Record<string, any>>} layout the `brainLayout` result the rows fit
 * @property {Float32Array} rows `PLACES x weightCount` weights
 * @property {Float32Array} sigmas one per place
 * @property {Float64Array} ids genome id per place
 * @property {Uint8Array} occupied 1 where a place holds a genome
 * @property {Float64Array} stats Welford triple per place
 * @property {Int32Array} cursors `nextClone` cell cursor per specialisation
 * @property {Float64Array} scratch work array for the `cv` median
 * @property {Int32Array} near work array for `selectParent`
 */

/**
 * @param {Readonly<Record<string, any>>} layout a `brainLayout` result
 * @returns {Archive} an empty archive with every row allocated
 */
export function createArchive(layout) {
    return {
        layout,
        rows: new Float32Array(PLACES * layout.weightCount),
        sigmas: new Float32Array(PLACES),
        ids: new Float64Array(PLACES),
        occupied: new Uint8Array(PLACES),
        stats: new Float64Array(PLACES * WELFORD_STRIDE),
        cursors: new Int32Array(SPEC_COUNT),
        scratch: new Float64Array(PLACES),
        near: new Int32Array(9),
    };
}

/**
 * @param {number} spec specialisation index (`GENOME_SPECS`)
 * @param {number} cell cell 0 .. 99 (`y * 10 + x`)
 * @param {number} which `ELITE` or `CHALLENGER`
 * @returns {number} the place index
 */
export function placeOf(spec, cell, which) {
    return (spec * CELLS + cell) * 2 + which;
}

/**
 * @param {number} speed speedMean 0 .. 1
 * @param {number} crowding crowdingMean 0 .. 1
 * @returns {number} the cell, `y * 10 + x`, each axis `min(9, floor(v * 10))`
 */
export function cellOf(speed, crowding) {
    const bin = (/** @type {number} */ v) => Math.max(0, Math.min(CELLS_PER_AXIS - 1, Math.floor(v * CELLS_PER_AXIS)));
    return bin(crowding) * CELLS_PER_AXIS + bin(speed);
}

/**
 * @param {Archive} archive the archive
 * @param {number} [spec] one specialisation, or all when omitted
 * @returns {number} occupied cells (a cell is occupied by its elite)
 */
export function occupiedCount(archive, spec) {
    const [lo, hi] = spec === undefined ? [0, SPEC_COUNT] : [spec, spec + 1];
    let count = 0;
    for (let i = lo * CELLS; i < hi * CELLS; i++) {
        count += archive.occupied[i * 2];
    }
    return count;
}

/**
 * @param {Archive} archive the archive
 * @returns {number} `eval.coverage`: occupied cells over all cells
 */
export function coverage(archive) {
    return occupiedCount(archive) / (SPEC_COUNT * CELLS);
}

/**
 * @param {Archive} archive the archive
 * @returns {number} `eval.qd_score`: sum of elite means over occupied cells, over all cells
 */
export function qdScore(archive) {
    let sum = 0;
    for (let i = 0; i < SPEC_COUNT * CELLS; i++) {
        sum += archive.occupied[i * 2] === 1 ? welfordMean(archive.stats, i * 2 * WELFORD_STRIDE) : 0;
    }
    return sum / (SPEC_COUNT * CELLS);
}

/**
 * @param {Archive} archive the archive
 * @returns {number} the median of `sd / mean` over genomes with `n >= 2` and `mean > 0`; `CV_DEFAULT` until
 *   `CV_MIN_GENOMES` such genomes exist
 */
export function archiveCv(archive) {
    const { stats, scratch } = archive;
    let k = 0;
    for (let p = 0; p < PLACES; p++) {
        const o = p * WELFORD_STRIDE;
        if (archive.occupied[p] === 1 && stats[o] >= 2 && stats[o + 1] > 0) {
            scratch[k++] = welfordSd(stats, o) / stats[o + 1];
        }
    }
    if (k < CV_MIN_GENOMES) {
        return CV_DEFAULT;
    }
    scratch.fill(Infinity, k);
    scratch.sort();
    return k % 2 === 1 ? scratch[k >> 1] : (scratch[k / 2 - 1] + scratch[k / 2]) / 2;
}

/**
 * @param {Archive} archive the archive
 * @param {number} place an occupied place
 * @param {number} [cv] the `cv` to use when `n < 2` (measured when omitted)
 * @returns {number} `mean - Z x sd / sqrt(n)`, with `sd = |mean| x cv` while `n < 2`
 */
export function lowerBound(archive, place, cv) {
    const o = place * WELFORD_STRIDE;
    const n = archive.stats[o];
    const mean = welfordMean(archive.stats, o);
    const sd = n >= 2 ? welfordSd(archive.stats, o) : Math.abs(mean) * (cv ?? archiveCv(archive));
    return mean - (Z * sd) / Math.sqrt(n);
}

/**
 * @param {Archive} archive the archive
 * @param {number} place the place
 * @returns {number} fitnesses recorded for its genome
 */
export function placeCount(archive, place) {
    return archive.stats[place * WELFORD_STRIDE];
}

/**
 * @param {Archive} archive the archive
 * @param {number} place an occupied place
 * @returns {{ spec: number, cell: number, place: number, which: number, archiveRef: number, id: number, sigma: number, row: Float32Array, n: number, mean: number }}
 *   a reference to the genome; `row` is a view into the archive, copy it before it can be replaced
 */
export function refOf(archive, place) {
    const wc = archive.layout.weightCount;
    const cellIndex = place >> 1;
    return {
        spec: Math.floor(cellIndex / CELLS),
        cell: cellIndex % CELLS,
        place,
        which: place & 1,
        archiveRef: cellIndex,
        id: archive.ids[place],
        sigma: archive.sigmas[place],
        row: archive.rows.subarray(place * wc, (place + 1) * wc),
        n: archive.stats[place * WELFORD_STRIDE],
        mean: welfordMean(archive.stats, place * WELFORD_STRIDE),
    };
}

/**
 * Fills a place from a row.
 * @param {Archive} archive the archive
 * @param {number} place the place
 * @param {{ row: Float32Array, sigma: number, id: number }} genome the genome (row copied)
 * @returns {void}
 */
function fillPlace(archive, place, genome) {
    archive.rows.set(genome.row, place * archive.layout.weightCount);
    archive.sigmas[place] = genome.sigma;
    archive.ids[place] = genome.id;
    archive.occupied[place] = 1;
    archive.stats.fill(0, place * WELFORD_STRIDE, (place + 1) * WELFORD_STRIDE);
}

/**
 * Promotes the challenger of a cell to elite when its lower bound beats the elite's.
 * @param {Archive} archive the archive
 * @param {number} cellIndex `spec * 100 + cell`
 * @param {import('../sim/log.js').SimLog} [log] receives `ArchiveReplaced`
 * @returns {boolean} whether the elite was replaced
 */
function tryReplace(archive, cellIndex, log) {
    const elite = cellIndex * 2;
    const chal = elite + 1;
    if (archive.occupied[chal] === 0 || placeCount(archive, chal) < 2) {
        return false;
    }
    const oldLower = lowerBound(archive, elite);
    const newLower = lowerBound(archive, chal);
    if (newLower <= oldLower) {
        return false;
    }
    const { rows, stats } = archive;
    const wc = archive.layout.weightCount;
    const oldId = archive.ids[elite];
    rows.copyWithin(elite * wc, chal * wc, (chal + 1) * wc);
    archive.sigmas[elite] = archive.sigmas[chal];
    archive.ids[elite] = archive.ids[chal];
    stats.copyWithin(elite * WELFORD_STRIDE, chal * WELFORD_STRIDE, (chal + 1) * WELFORD_STRIDE);
    archive.occupied[chal] = 0;
    log?.log('info', 'ArchiveReplaced', {
        spec: Math.floor(cellIndex / CELLS),
        cell: cellIndex % CELLS,
        oldId,
        newId: archive.ids[elite],
        oldLower,
        newLower,
        n: stats[elite * WELFORD_STRIDE],
    });
    return true;
}

/**
 * @typedef {object} Offer
 * @property {number} spec specialisation index
 * @property {number} [cell] cell 0 .. 99; derived from `speed` and `crowding` when omitted (not needed for a clone)
 * @property {number} [speed] speedMean 0 .. 1
 * @property {number} [crowding] crowdingMean 0 .. 1
 * @property {Float32Array} row the dying agent's weights (copied if kept)
 * @property {number} sigma its sigma
 * @property {number} id its genome id
 * @property {number} fitness its fitness
 * @property {boolean} [isClone] whether it was an unmutated clone of an archive genome
 * @property {number} [archiveRef] `spec * 100 + cell` of the genome it cloned
 * @property {number} [refId] the id of the genome it cloned
 */

/**
 * @param {Archive} archive the archive
 * @param {number} cellIndex `spec * 100 + cell`
 * @param {Offer} item a non-clone offer
 * @param {import('../sim/log.js').SimLog} [log] receives `ChallengerSet`
 * @returns {string} the outcome
 */
function offerGenome(archive, cellIndex, item, log) {
    const elite = cellIndex * 2;
    const chal = elite + 1;
    if (archive.occupied[elite] === 0) {
        fillPlace(archive, elite, item);
        welfordAdd(archive.stats, elite * WELFORD_STRIDE, item.fitness);
        return 'elite';
    }
    const takes =
        item.fitness >= welfordMean(archive.stats, elite * WELFORD_STRIDE) &&
        (archive.occupied[chal] === 0 ||
            (placeCount(archive, chal) === 1 && item.fitness > welfordMean(archive.stats, chal * WELFORD_STRIDE)));
    if (!takes) {
        return 'dropped';
    }
    fillPlace(archive, chal, item);
    welfordAdd(archive.stats, chal * WELFORD_STRIDE, item.fitness);
    log?.log('debug', 'ChallengerSet', {
        spec: item.spec,
        cell: cellIndex % CELLS,
        id: item.id,
        fitness: item.fitness,
    });
    return 'challenger';
}

/**
 * Offers a scored genome. A clone adds its fitness to the genome it cloned; anything else may become the elite or
 * the challenger of its cell. Afterwards a challenger that is clearly better replaces the elite.
 * @param {Archive} archive the archive
 * @param {Offer} item the offer (the row is copied, nothing is retained)
 * @param {import('../sim/log.js').SimLog} [log] receives `ArchiveReplaced` and `ChallengerSet`
 * @returns {'elite' | 'challenger' | 'dropped' | 'clone' | 'replaced' | 'lost'} what happened; `lost` is a clone
 *   whose genome is no longer in its cell
 */
export function offer(archive, item, log) {
    let cellIndex;
    let outcome;
    if (item.isClone) {
        cellIndex = /** @type {number} */ (item.archiveRef);
        const elite = cellIndex * 2;
        const place = archive.occupied[elite] === 1 && archive.ids[elite] === item.refId ? elite : elite + 1;
        const held = archive.occupied[place] === 1 && archive.ids[place] === item.refId;
        if (!held) {
            return 'lost';
        }
        welfordAdd(archive.stats, place * WELFORD_STRIDE, item.fitness);
        outcome = 'clone';
    } else {
        cellIndex = item.spec * CELLS + (item.cell ?? cellOf(item.speed ?? 0, item.crowding ?? 0));
        outcome = offerGenome(archive, cellIndex, item, log);
    }
    return tryReplace(archive, cellIndex, log) ? 'replaced' : /** @type {any} */ (outcome);
}

/**
 * Places a champion as the elite of its cell with `n = 1` and mean 0, so the first tested challenger can replace it.
 * @param {Archive} archive the archive
 * @param {{ spec?: number, specialisation?: string, cell: number, id: number, sigma: number, weights: Float32Array }} champion
 *   `spec` is the index; `specialisation` (a decoded genome's name) is used when `spec` is absent
 * @param {import('../sim/log.js').SimLog} [log] receives `GenomeRejected` when the champion is refused
 * @returns {void}
 * @throws {Error} naming the field when the cell or the row length does not fit
 */
export function seedArchive(archive, champion, log) {
    const spec = champion.spec ?? GENOME_SPECS.indexOf(/** @type {string} */ (champion.specialisation));
    if (
        spec < 0 ||
        spec >= SPEC_COUNT ||
        !Number.isInteger(champion.cell) ||
        champion.cell < 0 ||
        champion.cell >= CELLS
    ) {
        rejectGenome(log, {
            field: 'spec/cell',
            expected: `spec < ${SPEC_COUNT}, cell < ${CELLS}`,
            actual: `${spec}/${champion.cell}`,
            message: `seedArchive: bad spec ${spec} or cell ${champion.cell}`,
        });
    }
    if (champion.weights.length !== archive.layout.weightCount) {
        rejectGenome(log, {
            field: 'weights.length',
            expected: archive.layout.weightCount,
            actual: champion.weights.length,
        });
    }
    const elite = placeOf(spec, champion.cell, ELITE);
    fillPlace(archive, elite, { row: champion.weights, sigma: champion.sigma, id: champion.id });
    welfordAdd(archive.stats, elite * WELFORD_STRIDE, 0);
    archive.occupied[elite + 1] = 0;
}

/**
 * @param {Archive} archive the archive
 * @param {number} spec specialisation index
 * @param {number} cell the centre cell
 * @returns {number} how many occupied elites of the 3 x 3 block around `cell` were written to `archive.near`
 */
function collectNear(archive, spec, cell) {
    let k = 0;
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            const x = (cell % CELLS_PER_AXIS) + dx;
            const y = Math.floor(cell / CELLS_PER_AXIS) + dy;
            const inGrid = x >= 0 && x < CELLS_PER_AXIS && y >= 0 && y < CELLS_PER_AXIS;
            const p = placeOf(spec, y * CELLS_PER_AXIS + x, ELITE);
            if (inGrid && archive.occupied[p] === 1) {
                archive.near[k++] = p;
            }
        }
    }
    return k;
}

/**
 * @param {Archive} archive the archive
 * @param {number} spec specialisation index
 * @param {number} pick the index among the specialisation's occupied cells
 * @returns {number} that occupied cell
 */
function uniformCell(archive, spec, pick) {
    let left = pick;
    let cell = 0;
    while (archive.occupied[placeOf(spec, cell, ELITE)] === 0 || left-- > 0) {
        cell++;
    }
    return cell;
}

/**
 * Picks a parent: the occupied cell of the specialisation whose elite has the best mean among `cellDraws` uniform
 * draws (one draw is a uniform cell), then the best mean of `NEIGHBOUR_DRAWS` elites drawn with replacement from that
 * cell and its occupied 8-neighbours.
 * @param {Archive} archive the archive
 * @param {number} spec specialisation index
 * @param {import('../sim/rng.js').Rng} rng the stream to draw from
 * @param {number} [cellDraws] uniform cell draws in the cell tournament; 1 picks a uniform cell
 * @returns {ReturnType<typeof refOf> | null} the chosen elite, or null when the specialisation has no genome
 */
export function selectParent(archive, spec, rng, cellDraws = 1) {
    const total = occupiedCount(archive, spec);
    if (total === 0) {
        return null;
    }
    let cell = uniformCell(archive, spec, nextInt(rng, total));
    for (let i = 1; i < cellDraws; i++) {
        const other = uniformCell(archive, spec, nextInt(rng, total));
        const eliteMean = (/** @type {number} */ c) =>
            welfordMean(archive.stats, placeOf(spec, c, ELITE) * WELFORD_STRIDE);
        cell = eliteMean(other) > eliteMean(cell) ? other : cell;
    }
    const k = collectNear(archive, spec, cell);
    const mean = (/** @type {number} */ p) => welfordMean(archive.stats, p * WELFORD_STRIDE);
    let best = archive.near[nextInt(rng, k)];
    for (let i = 1; i < NEIGHBOUR_DRAWS; i++) {
        const p = archive.near[nextInt(rng, k)];
        best = mean(p) > mean(best) ? p : best;
    }
    return refOf(archive, best);
}

/**
 * Cycles over the specialisation's cells from its cursor and returns the first challenger with `n < 3`; with none,
 * the elite with the smallest `n` (the first in cycle order on ties). The cursor moves past the returned cell.
 * @param {import('./archive.js').Archive} archive the archive
 * @param {number} spec specialisation index
 * @returns {ReturnType<typeof refOf> | null} the genome to clone, or null when the specialisation is empty
 */
export function nextClone(archive, spec) {
    const start = archive.cursors[spec];
    let best = -1;
    let bestN = Infinity;
    let found = -1;
    for (let i = 0; i < CELLS; i++) {
        const cell = (start + i) % CELLS;
        const chal = placeOf(spec, cell, CHALLENGER);
        if (archive.occupied[chal] === 1 && placeCount(archive, chal) < CLONE_CHALLENGER_N) {
            found = chal;
            break;
        }
        const elite = placeOf(spec, cell, ELITE);
        if (archive.occupied[elite] === 1 && placeCount(archive, elite) < bestN) {
            best = elite;
            bestN = placeCount(archive, elite);
        }
    }
    const place = found >= 0 ? found : best;
    if (place < 0) {
        return null;
    }
    archive.cursors[spec] = ((place >> 1) - spec * CELLS + 1) % CELLS;
    return refOf(archive, place);
}
