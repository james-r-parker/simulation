// Moment scoring for the Phase 4 director (`docs/designs/worker-and-renderer.md`): scores chases, combat/escape/smoke
// effects, alarm/birth clusters and ticker milestones, and applies the 30 s repeat penalty (x 0.6).

/** Every moment kind the director scores. */
export const MOMENT_KIND = Object.freeze({
    CHASE: 'chase',
    PACK_KILL: 'pack-kill',
    KILL: 'kill',
    ESCAPE: 'escape',
    SMOKE_ESCAPE: 'smoke-escape',
    SMOKE_SCREEN: 'smoke-screen',
    ALARM_CHORUS: 'alarm-chorus',
    BIRTH_CLUSTER: 'birth-cluster',
    FAMILY_LEAD: 'family-lead',
    EXTINCT: 'extinct',
    LAST_STAND: 'last-stand',
    FIRST: 'first',
});

/** Maximum hunter-to-prey distance for a `chase` moment, in world units. */
export const CHASE_MAX_DISTANCE = 400;
/** Minimum share of the earlier distance a chase gap must be at or below after 1.5 s (20% shrink). */
export const CHASE_GAP_RATIO = 0.8;
/** Speed multiple of `maxVelocity` above which an agent counts as sprinting in a chase. */
export const CHASE_SPRINT_FACTOR = 1.05;
/** Minimum score (after repeat penalty and random draw) the director acts on. */
export const MOMENT_THRESHOLD = 45;
/** Multiplier applied when the same moment kind was shown within the last 30 s. */
export const REPEAT_PENALTY = 0.6;
/** Window in simulated seconds during which repeating a moment kind is penalised. */
export const REPEAT_WINDOW_S = 30;

/** Effect word `c` bit layout from the Snapshot table. */
export const EFFECT_BITS = Object.freeze({
    CAUSE_SHIFT: 8,
    CAUSE_MASK: 0xff,
    DIED_PACK: 65536,
    DIED_DELIBERATE: 131072,
    BITE_DELIBERATE: 65536,
    SMOKE_BITTEN: 256,
    ESCAPED_RESPONDED: 256,
    ESCAPED_SMOKE: 65536,
});

/** Default `ESCAPED` effect kind code when `ready.layout.effectKinds.ESCAPED` is not yet populated. */
export const DEFAULT_ESCAPED_KIND = 7;

/**
 * Scores a validated chase pair: `40 + 30 x sprinting hunter + 20 x sprinting prey + 10 x (1 - distance / 400)`.
 * @param {{distance: number, hunterSpeed: number, preySpeed: number, maxVelocity: number}} chase pair measurements
 * @returns {number} the chase score, 0 when outside `CHASE_MAX_DISTANCE`
 */
export function scoreChase({ distance, hunterSpeed, preySpeed, maxVelocity }) {
    if (distance <= 0 || distance > CHASE_MAX_DISTANCE) {
        return 0;
    }
    const sprintSpeed = CHASE_SPRINT_FACTOR * maxVelocity;
    const hunterSprint = hunterSpeed > sprintSpeed ? 1 : 0;
    const preySprint = preySpeed > sprintSpeed ? 1 : 0;
    return 40 + 30 * hunterSprint + 20 * preySprint + 10 * (1 - distance / CHASE_MAX_DISTANCE);
}

/**
 * Scores a `DIED` effect of cause `eaten` within the last 4 s.
 * @param {number} c word `c` of the `DIED` record
 * @param {number} ageS age of the effect in simulated seconds
 * @param {number} eatenCause `ready.layout.deathCauses.EATEN`
 * @returns {{kind: string, score: number} | null} `pack-kill` or `kill`, or null when not an eaten death in window
 */
function scoreDiedEffect(c, ageS, eatenCause) {
    const cause = (c >>> EFFECT_BITS.CAUSE_SHIFT) & EFFECT_BITS.CAUSE_MASK;
    if (ageS >= 4 || cause !== eatenCause) {
        return null;
    }
    const decay = 1 - ageS / 4;
    const deliberate = (c & EFFECT_BITS.DIED_DELIBERATE) !== 0;
    const pack = (c & EFFECT_BITS.DIED_PACK) !== 0;
    if (pack && deliberate) {
        return { kind: MOMENT_KIND.PACK_KILL, score: 90 * decay };
    }
    return { kind: MOMENT_KIND.KILL, score: (deliberate ? 80 : 30) * decay };
}

/**
 * Scores an `ESCAPED` effect with the `responded` bit within the last 5 s.
 * @param {number} c word `c` of the `ESCAPED` record
 * @param {number} ageS age of the effect in simulated seconds
 * @returns {{kind: string, score: number} | null} `smoke-escape` or `escape`, or null when unresponded or expired
 */
function scoreEscapedEffect(c, ageS) {
    if (ageS >= 5 || (c & EFFECT_BITS.ESCAPED_RESPONDED) === 0) {
        return null;
    }
    const decay = 1 - ageS / 5;
    const inSmoke = (c & EFFECT_BITS.ESCAPED_SMOKE) !== 0;
    return {
        kind: inSmoke ? MOMENT_KIND.SMOKE_ESCAPE : MOMENT_KIND.ESCAPE,
        score: (inSmoke ? 85 : 65) * decay,
    };
}

/**
 * Scores a single-record effect (`DIED`, `ESCAPED`, `SMOKE`).
 * @param {{kind: number, c: number}} effect the effect record
 * @param {{ageS: number, kinds: Record<string, number>, eatenCause: number}} context age in seconds and layout codes
 * @returns {{kind: string, score: number} | null} the moment kind and score, or null when not a moment
 */
export function scoreEffect(effect, { ageS, kinds, eatenCause }) {
    if (ageS < 0) {
        return null;
    }
    if (effect.kind === kinds.DIED) {
        return scoreDiedEffect(effect.c, ageS, eatenCause);
    }
    const escapedKind = kinds.ESCAPED ?? DEFAULT_ESCAPED_KIND;
    if (effect.kind === escapedKind) {
        return scoreEscapedEffect(effect.c, ageS);
    }
    if (effect.kind === kinds.SMOKE && ageS < 5 && (effect.c & EFFECT_BITS.SMOKE_BITTEN) !== 0) {
        return { kind: MOMENT_KIND.SMOKE_SCREEN, score: 55 * (1 - ageS / 5) };
    }
    return null;
}

/**
 * @param {number} calls number of `ALARM` effects in the cluster within 3 s
 * @returns {number} `50 + 5 x calls` capped at 70, or 0 below 3 calls
 */
export function scoreAlarmChorus(calls) {
    return calls < 3 ? 0 : Math.min(70, 50 + 5 * calls);
}

/**
 * @param {number} births number of `BORN` effects in the cluster within 4 s
 * @returns {number} `35 + 5 x births` capped at 55, or 0 below 6 births
 */
export function scoreBirthCluster(births) {
    return births < 6 ? 0 : Math.min(55, 35 + 5 * births);
}

/** @type {Readonly<Record<string, {kind: string, score: number}>>} */
const TICKER_SCORES = Object.freeze({
    'new-leader': { kind: MOMENT_KIND.FAMILY_LEAD, score: 60 },
    extinct: { kind: MOMENT_KIND.EXTINCT, score: 75 },
    'last-stand': { kind: MOMENT_KIND.LAST_STAND, score: 70 },
    'first-pack-kill': { kind: MOMENT_KIND.FIRST, score: 90 },
    'record-streak': { kind: MOMENT_KIND.FIRST, score: 90 },
    'record-age': { kind: MOMENT_KIND.FIRST, score: 90 },
});

/**
 * Scores a ticker item within the last 10 s.
 * @param {{kind: string}} item the ticker item
 * @param {number} ageS age of the item in simulated seconds
 * @returns {{kind: string, score: number} | null} the moment kind and score, or null when outside 10 s or unscored
 */
export function scoreTickerItem(item, ageS) {
    if (ageS < 0 || ageS > 10) {
        return null;
    }
    return TICKER_SCORES[item.kind] ?? null;
}

/**
 * Multiplies `score` by 0.6 when `kind` was shown within the last 30 s.
 * @param {number} score raw moment score
 * @param {string} kind moment kind
 * @param {Readonly<Record<string, number>> | undefined} lastShownS map of kind to simulated time (s) last shown
 * @param {number} nowS current simulated time (s)
 * @returns {number} adjusted score
 */
export function applyRepeatPenalty(score, kind, lastShownS, nowS) {
    const shownAt = lastShownS?.[kind];
    if (shownAt !== undefined && nowS >= shownAt && nowS - shownAt <= REPEAT_WINDOW_S) {
        return score * REPEAT_PENALTY;
    }
    return score;
}
