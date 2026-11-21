// The subject plate: a small plate beside a followed body naming it (family colour and name, specialisation), how long it
// has lived, its children alive and its kills, and what state it is in (hunted, starving, pregnant, cold). It fades
// after `PLATE_FADE_MS` and returns when what it says changes. A persistent node, so it takes the pixel shift. Pure
// views over injected data; the DOM is `mountSubjectPlate`.

import { familyName } from '../renderer/colors.js';
import { familyCss } from './css-color.js';
import { temperatureBand } from './inspector-data.js';

/** How long the plate stays after the last change, in ms. */
export const PLATE_FADE_MS = 6000;
/** The share of full energy under which a body is starving (the renderer's `FAILING_FROM`). */
export const STARVING_BELOW = 0.15;

/**
 * @typedef {object} PlateView
 * @property {number} id the subject's genome id
 * @property {string} family its family's name
 * @property {string} color the family's CSS colour
 * @property {string} spec its specialisation
 * @property {string} age how long it has lived, `''` when not known
 * @property {number} children its children alive
 * @property {string} kills its kills, `''` when not known
 * @property {string} condition `hunted`, `starving`, `pregnant`, `cold` or `''`
 */

/**
 * @param {{energy: number, temperature: number, flags: number}} body the subject's displayed state
 * @param {{info: Record<string, any>, bits: Record<string, number>, hunted: boolean}} world the world's constants, the
 *   flag bits and whether a hunter is running it down
 * @returns {string} the condition worth showing, the most urgent first
 */
export function conditionOf(body, { info, bits, hunted }) {
    if (hunted) {
        return 'hunted';
    }
    if (body.energy < STARVING_BELOW) {
        return 'starving';
    }
    if ((body.flags & bits.PREGNANT) !== 0) {
        return 'pregnant';
    }
    return temperatureBand(body.temperature, info) === 'cold stress' ? 'cold' : '';
}

/**
 * @param {{agents: import('../interpolate.js').Interpolated, i: number, ready: Record<string, any>,
 *   slots: import('../family-slots.js').FamilySlots, hunted: boolean, children: number,
 *   stats: {ageSeasons: number, kills: number} | null}} source the subject's row, the world, the family slots, whether it
 *   is hunted, its children alive and its counters when the inspector has them
 * @returns {PlateView} what the plate says
 */
export function plateView({ agents, i, ready, slots, hunted, children, stats }) {
    const { info, layout } = ready;
    const lineage = agents.lineageId[i];
    const body = { energy: agents.energy[i], temperature: agents.temperature[i], flags: agents.flags[i] };
    return {
        id: agents.genomeId[i],
        family: familyName(ready.seed, lineage, slots.top),
        color: familyCss(slots, lineage),
        spec: String(info.specs[agents.spec[i]]?.name ?? ''),
        age: stats === null ? '' : `${stats.ageSeasons.toFixed(1)} seasons`,
        children,
        kills: stats === null ? '' : String(Math.round(stats.kills)),
        condition: conditionOf(body, { info, bits: layout.flags, hunted }),
    };
}

/**
 * @param {PlateView} view what the plate says
 * @returns {string} a key that changes when the plate should return: not with the age, which always moves
 */
export function plateSignature(view) {
    return `${view.id}|${view.condition}|${view.children}|${view.kills}`;
}

/**
 * @param {number} [fadeMs] how long the plate stays after a change
 * @returns {{step: (signature: string, nowMs: number) => boolean}} the fade: `step` takes the plate's signature (empty
 *   when there is no subject) and the wall time, and returns whether the plate shows
 */
export function createPlateFade(fadeMs = PLATE_FADE_MS) {
    let last = '';
    let changedAt = 0;
    return {
        step(signature, nowMs) {
            if (signature !== last) {
                last = signature;
                changedAt = nowMs;
            }
            return signature !== '' && nowMs - changedAt < fadeMs;
        },
    };
}

/**
 * @param {PlateView} view what the plate says
 * @returns {{title: string, detail: string}} the plate's two lines: who, and its numbers and condition
 */
export function plateText(view) {
    const numbers = [view.age, `children ${view.children}`, view.kills === '' ? '' : `kills ${view.kills}`];
    const detail = [...numbers, view.condition].filter((part) => part !== '');
    return { title: `${view.family} - ${view.spec}`, detail: detail.join(' - ') };
}

/**
 * @param {{createElement: (tag: string) => any}} doc the document
 * @param {{appendChild: (child: any) => void}} parent where the node goes
 * @returns {{element: any, update: (view: PlateView | null, nowMs: number) => void}} the node; `update` shows the plate
 *   for a subject (null for none) and fades it with the clock
 */
export function mountSubjectPlate(doc, parent) {
    const element = doc.createElement('div');
    element.id = 'subject-plate';
    element.className = 'subject-plate';
    const title = doc.createElement('div');
    title.className = 'plate-title';
    const detail = doc.createElement('div');
    detail.className = 'plate-detail';
    element.appendChild(title);
    element.appendChild(detail);
    parent.appendChild(element);
    const fade = createPlateFade();
    const written = { title: '', detail: '', color: '' };
    return {
        element,
        update(view, nowMs) {
            const on = fade.step(view === null ? '' : plateSignature(view), nowMs);
            if (view !== null) {
                const text = plateText(view);
                if (text.title !== written.title || view.color !== written.color) {
                    written.title = text.title;
                    written.color = view.color;
                    title.textContent = text.title;
                    title.style.color = view.color;
                }
                if (text.detail !== written.detail) {
                    written.detail = text.detail;
                    detail.textContent = text.detail;
                }
            }
            element.classList.toggle('plate-on', on);
        },
    };
}
