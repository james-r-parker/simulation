// Director captions (`docs/designs/worker-and-renderer.md`): `captionFor(moment, world)` formats the human-readable
// caption shown during a shot's `glide` and `linger` phases.

import { familyName } from '../renderer/colors.js';
import { MOMENT_KIND } from './scoring.js';

/** The season names, in `season` order. */
const SEASON_NAMES = Object.freeze(['Spring', 'Summer', 'Autumn', 'Winter']);

/** @type {Readonly<Record<string, string>>} */
const FIRST_CAPTIONS = Object.freeze({
    'first-pack-kill': 'First pack kill',
    'record-streak': 'Record hunt streak',
    'record-age': 'Oldest blob yet',
});

/**
 * Resolves the family name for a lineage-based moment (`family-lead`, `extinct`, `last-stand`).
 * @param {{family?: string, lineageId?: number}} moment the moment
 * @param {{seed?: number, top?: readonly {id: number}[]}} [world] world seed and top lineages
 * @returns {string} the family name
 */
function resolveFamily(moment, world) {
    if (moment.family) {
        return moment.family;
    }
    return familyName(world?.seed ?? 0, moment.lineageId ?? 0, world?.top ?? []);
}

/**
 * @typedef {object} CaptionMoment
 * @property {string} kind
 * @property {string} [hunterSpec]
 * @property {string} [preySpec]
 * @property {number} [count]
 * @property {string} [family]
 * @property {number} [lineageId]
 * @property {string} [tickerKind]
 */

/** @type {Readonly<Record<string, (m: CaptionMoment, w?: {seed?: number, top?: readonly {id: number}[]}) => string>>} */
const CAPTION_BUILDERS = Object.freeze({
    [MOMENT_KIND.CHASE]: (m) => `Chase - ${m.hunterSpec ?? 'predator'} after ${m.preySpec ?? 'forager'}`,
    [MOMENT_KIND.PACK_KILL]: () => 'Pack kill',
    [MOMENT_KIND.KILL]: () => 'Kill',
    [MOMENT_KIND.ESCAPE]: () => 'Escape',
    [MOMENT_KIND.SMOKE_ESCAPE]: () => 'Smoke escape',
    [MOMENT_KIND.SMOKE_SCREEN]: () => 'Smoke screen',
    [MOMENT_KIND.ALARM_CHORUS]: () => 'Alarm chorus',
    [MOMENT_KIND.BIRTH_CLUSTER]: (m) => `Birth cluster of ${m.count ?? 6}`,
    [MOMENT_KIND.FAMILY_LEAD]: (m, w) => `${resolveFamily(m, w)} takes the lead`,
    [MOMENT_KIND.EXTINCT]: (m, w) => `${resolveFamily(m, w)} has died out`,
    [MOMENT_KIND.LAST_STAND]: (m, w) => `Last stand of ${resolveFamily(m, w)}`,
    [MOMENT_KIND.FIRST]: (m) => FIRST_CAPTIONS[m.tickerKind ?? ''] ?? 'First pack kill',
    [MOMENT_KIND.OUTBREAK]: (m) => `Outbreak - ${m.count ?? 3} infected`,
    [MOMENT_KIND.STAMPEDE]: () => 'Stampede',
    [MOMENT_KIND.FIRST_KILL]: () => 'A first kill',
    [MOMENT_KIND.SEASON_TURN]: (m) => `${SEASON_NAMES[m.count ?? 0]} comes`,
    [MOMENT_KIND.FLOOR_ARRIVAL]: (m) => `${m.count ?? 4} newcomers arrive`,
    [MOMENT_KIND.TRAMPLE]: () => 'Trampled',
});

/**
 * Formats the caption text for a director moment.
 * @param {CaptionMoment} moment the moment to caption
 * @param {{seed?: number, top?: readonly {id: number}[]}} [world] world seed and top lineages for family names
 * @returns {string} the caption text
 */
export function captionFor(moment, world) {
    const build = CAPTION_BUILDERS[moment.kind];
    return build === undefined ? '' : build(moment, world);
}
