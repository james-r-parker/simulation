// The story of a follow (docs/designs/ambient-display.md, "Follow as a story"): what the camera remembers of a death so
// it can hold through the clip and hand off with a reason. A small ring of deaths (killer, lineage, place, clip length)
// and a larger one of births (child and mother) are fed by the played effects; `chooseHandoff` reads them when the
// subject has been gone long enough. The order is the killer when the death was `EATEN`, a living child, the nearest
// living kin of the lineage, then `pickFollowAgent`. Typed rings, no allocation after `createStory`.

import { pickFollowAgent } from './follow-target.js';
import { animFor } from './renderer/death-anim.js';
import { findAgent } from './renderer/overlays.js';

/** How long the camera stays after a death clip ends, ms. */
export const HOLD_AFTER_CLIP_MS = 600;
/** How long the relation caption stays, ms. */
export const RELATION_CAPTION_MS = 3000;
/** The deaths remembered, and the births. */
const DEATH_CAPACITY = 16;
const BIRTH_CAPACITY = 256;
/** The cause a pending body is given when its `DIED` never plays (`dying.js`). */
const UNKNOWN_CAUSE = 'STARVED';
const CAUSE_SHIFT = 8;
const CAUSE_MASK = 0xff;

/** How a new subject relates to the one that died. */
export const RELATION = Object.freeze({ KILLER: 'killer', CHILD: 'child', KIN: 'kin', PICK: 'pick' });

/** The caption of each relation; the pick has none. */
export const RELATION_CAPTIONS = Object.freeze({
    [RELATION.KILLER]: 'its killer',
    [RELATION.CHILD]: 'its daughter',
    [RELATION.KIN]: 'its kin',
    [RELATION.PICK]: '',
});

/**
 * @typedef {object} Story
 * @property {Uint32Array} deathGenome the dead genome
 * @property {Uint32Array} deathKiller its killer, 0 for none
 * @property {Uint32Array} deathLineage its lineage
 * @property {Float32Array} deathX where it died
 * @property {Float32Array} deathY where it died
 * @property {Float32Array} deathClipMs the length of its death clip, ms
 * @property {Uint8Array} deathEaten 1 when the cause was `EATEN`
 * @property {number} deaths the next death slot
 * @property {number} deathCount deaths held
 * @property {Uint32Array} birthChild a newborn
 * @property {Uint32Array} birthMother its mother
 * @property {number} births the next birth slot
 * @property {number} birthCount births held
 */

/** @returns {Story} an empty story */
export function createStory() {
    return {
        deathGenome: new Uint32Array(DEATH_CAPACITY),
        deathKiller: new Uint32Array(DEATH_CAPACITY),
        deathLineage: new Uint32Array(DEATH_CAPACITY),
        deathX: new Float32Array(DEATH_CAPACITY),
        deathY: new Float32Array(DEATH_CAPACITY),
        deathClipMs: new Float32Array(DEATH_CAPACITY),
        deathEaten: new Uint8Array(DEATH_CAPACITY),
        deaths: 0,
        deathCount: 0,
        birthChild: new Uint32Array(BIRTH_CAPACITY),
        birthMother: new Uint32Array(BIRTH_CAPACITY),
        births: 0,
        birthCount: 0,
    };
}

/**
 * Remembers a played `DIED` (with its killer and clip length) or a `BORN` that names its mother.
 * @param {Story} story the story
 * @param {{kind: number, x: number, y: number, a: number, b: number, c: number, d: number}} effect the played effect
 * @param {{kinds: Record<string, number>, eatenCause: number, causeNames: readonly string[]}} ctx the layout codes
 * @returns {void}
 */
export function noteStory(story, effect, ctx) {
    if (effect.kind === ctx.kinds.DIED) {
        const i = story.deaths;
        const cause = (effect.c >>> CAUSE_SHIFT) & CAUSE_MASK;
        story.deathGenome[i] = effect.a;
        story.deathKiller[i] = effect.b;
        story.deathLineage[i] = effect.d;
        story.deathX[i] = effect.x;
        story.deathY[i] = effect.y;
        story.deathClipMs[i] = animFor(ctx.causeNames[cause]).ms;
        story.deathEaten[i] = cause === ctx.eatenCause ? 1 : 0;
        story.deaths = (i + 1) % DEATH_CAPACITY;
        story.deathCount = Math.min(story.deathCount + 1, DEATH_CAPACITY);
    } else if (effect.kind === ctx.kinds.BORN && effect.c !== 0) {
        const i = story.births;
        story.birthChild[i] = effect.a;
        story.birthMother[i] = effect.c;
        story.births = (i + 1) % BIRTH_CAPACITY;
        story.birthCount = Math.min(story.birthCount + 1, BIRTH_CAPACITY);
    }
}

/**
 * @param {Story} story the story
 * @param {number} genome a genome id
 * @returns {number} the slot of its newest remembered death, -1 when none
 */
function deathSlot(story, genome) {
    for (let k = 1; k <= story.deathCount; k++) {
        const i = (story.deaths - k + DEATH_CAPACITY) % DEATH_CAPACITY;
        if (story.deathGenome[i] === genome) {
            return i;
        }
    }
    return -1;
}

/**
 * @param {Story | null} story the story, null when there is no effects player
 * @param {number} genome the subject that is gone
 * @returns {number} how long to hold on its place, ms: its death clip (a starvation's when its `DIED` has not played)
 *   plus `HOLD_AFTER_CLIP_MS`
 */
export function holdMsFor(story, genome) {
    const i = story === null ? -1 : deathSlot(story, genome);
    const clipMs = story !== null && i >= 0 ? story.deathClipMs[i] : animFor(UNKNOWN_CAUSE).ms;
    return clipMs + HOLD_AFTER_CLIP_MS;
}

/**
 * @param {Story} story the story
 * @param {import('./interpolate.js').Interpolated} agents the living agents
 * @param {number} mother a genome id
 * @returns {number} the newest living child of the mother, 0 when none
 */
function livingChild(story, agents, mother) {
    for (let k = 1; k <= story.birthCount; k++) {
        const i = (story.births - k + BIRTH_CAPACITY) % BIRTH_CAPACITY;
        if (story.birthMother[i] === mother && findAgent(agents, story.birthChild[i]) >= 0) {
            return story.birthChild[i];
        }
    }
    return 0;
}

/**
 * @param {Story} story the story
 * @param {import('./interpolate.js').Interpolated} agents the living agents
 * @param {number} mother a genome id
 * @returns {number} how many of its remembered children are alive
 */
export function childrenAlive(story, agents, mother) {
    let n = 0;
    for (let k = 0; k < story.birthCount; k++) {
        if (story.birthMother[k] === mother && findAgent(agents, story.birthChild[k]) >= 0) {
            n += 1;
        }
    }
    return n;
}

/**
 * @param {Story} story the story
 * @param {import('./interpolate.js').Interpolated} agents the living agents
 * @param {number} slot the death slot
 * @returns {number} the nearest living agent of the dead one's lineage to where it died, 0 when none
 */
function nearestKin(story, agents, slot) {
    const lineage = story.deathLineage[slot];
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; lineage !== 0 && i < agents.count; i++) {
        const d = Math.hypot(agents.x[i] - story.deathX[slot], agents.y[i] - story.deathY[slot]);
        if (agents.lineageId[i] === lineage && (d < bestD || (d === bestD && agents.genomeId[i] < best))) {
            best = agents.genomeId[i];
            bestD = d;
        }
    }
    return best;
}

/**
 * @param {{id: number, relation: string}} out receives the choice
 * @param {number} id the new subject
 * @param {string} relation how it relates
 * @returns {boolean} whether there is a subject
 */
function found(out, id, relation) {
    out.id = id;
    out.relation = relation;
    return id !== 0;
}

/**
 * Picks the next subject after a death: the killer when the death was `EATEN` and it lives, a living child, the nearest
 * living kin, else `pickFollowAgent`.
 * @param {Story | null} story the story, null when there is none
 * @param {import('./interpolate.js').Interpolated} agents the living agents
 * @param {{from: number, pick: Parameters<typeof pickFollowAgent>[1]}} at the subject that is gone and the pick's context
 * @param {{id: number, relation: string}} out receives the id and its relation
 * @returns {{id: number, relation: string}} `out`
 */
export function chooseHandoff(story, agents, at, out) {
    const slot = story === null ? -1 : deathSlot(story, at.from);
    if (story !== null && slot >= 0) {
        const killer = story.deathEaten[slot] === 1 ? story.deathKiller[slot] : 0;
        if (findAgent(agents, killer) >= 0 && found(out, killer, RELATION.KILLER)) {
            return out;
        }
        if (found(out, livingChild(story, agents, at.from), RELATION.CHILD)) {
            return out;
        }
        if (found(out, nearestKin(story, agents, slot), RELATION.KIN)) {
            return out;
        }
    }
    found(out, pickFollowAgent(agents, at.pick), RELATION.PICK);
    return out;
}
