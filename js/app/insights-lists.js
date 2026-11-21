// The rows of the insights drawer's Families and Records tabs, from the stats message's `families` and `records` and the
// longest pursuit the frame saw. Pure; a row's `target` is what a click follows.

import { familyName } from './renderer/colors.js';
import { grouped } from './insights-data.js';

/** The families listed. */
export const FAMILY_ROWS = 12;
/** Ticks a second at speed x1, for the longest chase. */
const BASE_TICKS_PER_SECOND = 60;

/**
 * @param {number[]} bySpec alive members by specialisation index
 * @param {{index: number, name: string}[]} specs `ready.info.specs`
 * @returns {string} the mix as text, the most common first: `forager 9, predator 2`
 */
function mixText(bySpec, specs) {
    return specs
        .map((s) => ({ name: s.name, n: bySpec[s.index] ?? 0 }))
        .filter((s) => s.n > 0)
        .sort((a, b) => b.n - a.n)
        .map((s) => `${s.name} ${s.n}`)
        .join(', ');
}

/**
 * @param {number} ticks a span in ticks
 * @param {number} seasonLength ticks in a season
 * @returns {string} the span in seasons: `2.4 seasons`
 */
function seasonsText(ticks, seasonLength) {
    return `${(ticks / Math.max(seasonLength, 1)).toFixed(1)} seasons`;
}

/**
 * @param {{ready: Record<string, any> | null, stats: Record<string, any> | null}} data the insights data
 * @param {(lineageId: number) => string} colorOf a family's CSS colour
 * @returns {import('./ui/insights-table.js').TableRow[]} one row for each of the largest lineages: its name, size and
 *   share, its oldest member's age, its mix, its kills and its deepest generation; a click follows its oldest member
 */
export function familyTableRows({ ready, stats }, colorOf) {
    const families = (stats?.families ?? []).slice(0, FAMILY_ROWS);
    const info = ready?.info ?? {};
    const top = stats?.lineages?.top ?? [];
    return families.map((/** @type {Record<string, any>} */ f) => ({
        cells: [
            familyName(ready?.seed ?? 0, f.id, top),
            `${grouped(f.count)} (${Math.round(f.share * 100)}%)`,
            f.oldestGenomeId === 0 ? '-' : seasonsText(f.oldestAgeTicks, info.seasonLength),
            mixText(f.bySpec, info.specs ?? []),
            grouped(f.kills),
            String(f.deepest),
        ],
        color: colorOf(f.id),
        pick: f.oldestGenomeId !== 0,
        target: { kind: 'family', genomeId: f.oldestGenomeId },
    }));
}

/**
 * @param {string} label the record
 * @param {string} value its value as text
 * @param {{genomeId: number, alive: boolean}} holder who holds it
 * @returns {import('./ui/insights-table.js').TableRow} the row: the holder is named, and a click follows one that is alive
 */
function recordRow(label, value, { genomeId, alive }) {
    const held = genomeId !== 0;
    return {
        cells: [label, held ? value : '-', held ? `blob ${genomeId}${alive ? '' : ' (gone)'}` : '-'],
        pick: held && alive,
        muted: !held,
        target: { kind: 'record', genomeId },
    };
}

/**
 * @param {{ready: Record<string, any> | null, stats: Record<string, any> | null}} data the insights data
 * @param {{ticks: number, genome: number, alive: boolean}} chase the longest pursuit the frame saw, in sim ticks, its
 *   hunter, and whether it is alive
 * @returns {import('./ui/insights-table.js').TableRow[]} the world's records: the longest life, the most kills, the most
 *   children and the longest chase, with each holder
 */
export function recordTableRows({ ready, stats }, chase) {
    const records = stats?.records;
    if (records === undefined) {
        return [];
    }
    const length = ready?.info?.seasonLength ?? 1;
    return [
        recordRow('longest life', seasonsText(records.longestLife.value, length), records.longestLife),
        recordRow('most kills', grouped(records.mostKills.value), records.mostKills),
        recordRow('most children', grouped(records.mostChildren.value), records.mostChildren),
        recordRow('longest chase', `${Math.round(chase.ticks / BASE_TICKS_PER_SECOND)} s`, {
            genomeId: chase.ticks > 0 ? chase.genome : 0,
            alive: chase.alive,
        }),
    ];
}
