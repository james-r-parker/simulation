// The hover peek: a tag beside the cursor after it rests 150 ms over an agent, saying what it is (type, family) and what
// it is doing right now. `nowLine` reads the doing from the snapshot flags and speed; `peekView` is the tag's content;
// `createPeekTracker` times the rest; `mountPeek` is the tag's element. The peek never selects or sends a command.

import { familyName } from '../renderer/colors.js';
import { familyCss } from './css-color.js';

/** How long the pointer must rest over an agent before the tag shows, in ms. */
export const PEEK_REST_MS = 150;
/** Above this share of `maxVelocity` an agent is sprinting, below the other it is resting. */
export const SPRINT_SHARE = 0.7;
export const REST_SHARE = 0.05;

/**
 * The first line that holds: being bitten, biting, calling the pack, sounding an alarm, eating, pregnant, then by speed
 * sprinting, resting or wandering.
 * @param {number} flags the agent's snapshot flags
 * @param {number} speed its speed in world units a tick
 * @param {{maxVelocity: number, bits: Record<string, number>}} world `ready.info.maxVelocity` and `ready.layout.flags`
 * @returns {string} what it is doing
 */
export function nowLine(flags, speed, { maxVelocity, bits }) {
    if (((flags >> bits.BITTEN_SHIFT) & bits.TIMER_MASK) > 0) {
        return 'being bitten';
    }
    if ((flags & bits.JAW_OPEN) !== 0) {
        return 'biting';
    }
    if ((flags & bits.HUNT_CALLING) !== 0) {
        return 'calling the pack';
    }
    if ((flags & bits.ALARMING) !== 0) {
        return 'sounding an alarm';
    }
    if (((flags >> bits.ATE_SHIFT) & bits.TIMER_MASK) > 0) {
        return 'eating';
    }
    if ((flags & bits.PREGNANT) !== 0) {
        return 'pregnant';
    }
    if (speed > SPRINT_SHARE * maxVelocity) {
        return 'sprinting';
    }
    return speed < REST_SHARE * maxVelocity ? 'resting' : 'wandering';
}

/**
 * @typedef {object} PeekView
 * @property {string} type the specialisation name
 * @property {string} name the family's name
 * @property {string} color the family's CSS colour
 * @property {string} now what it is doing
 */

/**
 * @param {{agents: import('../interpolate.js').Interpolated, index: number}} target the blended agents and the one hit
 * @param {{info: Record<string, any>, layout: Record<string, any>, seed: number,
 *   slots: import('../family-slots.js').FamilySlots}} world `ready` pieces and the family slots
 * @returns {PeekView} the tag's content
 */
export function peekView({ agents, index }, { info, layout, seed, slots }) {
    const lineage = agents.lineageId[index];
    return {
        type: String(info.specs[agents.spec[index]]?.name ?? ''),
        name: familyName(seed, lineage, slots.top),
        color: familyCss(slots, lineage),
        now: nowLine(agents.flags[index], agents.speed[index], { maxVelocity: info.maxVelocity, bits: layout.flags }),
    };
}

/**
 * @param {{restMs?: number}} [options] the rest time, `PEEK_REST_MS` by default
 * @returns {{move: (x: number, y: number, nowMs: number) => void, rested: (nowMs: number) => boolean,
 *   position: () => {x: number, y: number}}} `move` records the pointer; `rested` is true once it has stayed put for
 *   the rest time (and stays true until it moves again); `position` is where it is
 */
export function createPeekTracker({ restMs = PEEK_REST_MS } = {}) {
    const at = { x: 0, y: 0 };
    let since = Infinity;
    return {
        position: () => at,
        move(x, y, nowMs) {
            at.x = x;
            at.y = y;
            since = nowMs;
        },
        rested: (nowMs) => nowMs - since >= restMs,
    };
}

/** The gap between the cursor and the tag, in CSS px. */
const OFFSET_PX = 14;

/**
 * @param {{createElement: (tag: string) => any}} doc the document
 * @param {{appendChild: (child: any) => void}} root where the tag goes
 * @returns {{show: (view: PeekView, at: {x: number, y: number}) => void, hide: () => void, visible: () => boolean}} the
 *   tag: `show` fills it and puts it beside a point; `hide` hides it
 */
export function mountPeek(doc, root) {
    const element = doc.createElement('div');
    element.className = 'peek';
    element.hidden = true;
    const chip = doc.createElement('span');
    chip.className = 'peek-chip';
    const text = doc.createElement('span');
    text.className = 'peek-text';
    element.appendChild(chip);
    element.appendChild(text);
    root.appendChild(element);
    return {
        visible: () => !element.hidden,
        hide() {
            element.hidden = true;
        },
        show(view, at) {
            const line = `${view.type}, ${view.name}: ${view.now}`;
            if (text.textContent !== line) {
                text.textContent = line;
                chip.style.background = view.color;
            }
            element.style.left = `${Math.round(at.x + OFFSET_PX)}px`;
            element.style.top = `${Math.round(at.y + OFFSET_PX)}px`;
            element.hidden = false;
        },
    };
}
