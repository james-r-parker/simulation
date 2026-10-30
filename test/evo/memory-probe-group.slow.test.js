import { describe, expect, it } from 'vitest';
import { GROUP_CONTROL, TRIO, huntScore } from '../../js/evo/memory-probe-group.js';
import { raySees } from '../../js/evo/memory-probe-controls.js';
import { CH_KIN } from '../../js/evo/scripted-parts.js';

/**
 * A subject that does nothing but note, on the first tick, how many agents are alive and whether hunter 0 sees kin.
 * @param {{alive: number, kin: boolean}[]} notes receives one note per trial
 * @returns {import('../../js/evo/memory-probe-run.js').Subject} the subject
 */
function watcher(notes) {
    return {
        name: 'watcher',
        id: 0,
        spec: 1,
        weights: null,
        act: (/** @type {any} */ world) => {
            if (world.tick === 0) {
                notes.push({
                    alive: world.alive.reduce((/** @type {number} */ a, /** @type {number} */ b) => a + b, 0),
                    kin: raySees(world, 0, CH_KIN),
                });
            }
        },
    };
}

/**
 * @param {string} control a `GROUP_CONTROL` value
 * @returns {{alive: number, kin: boolean}[]} the first-tick notes of two trials
 */
function notesFor(control) {
    /** @type {{alive: number, kin: boolean}[]} */
    const notes = [];
    huntScore(control, watcher(notes), { config: {}, view: 350, seed: 1, trials: 2 });
    return notes;
}

describe('huntScore', () => {
    it('stages a trio and a prey, or one hunter and a prey for the solo control', () => {
        expect(notesFor(GROUP_CONTROL.SENSES).map((n) => n.alive)).toEqual([TRIO + 1, TRIO + 1]);
        expect(notesFor(GROUP_CONTROL.SOLO).map((n) => n.alive)).toEqual([2, 2]);
    });

    it('lets the clones see each other on the kin channel, and the kin-blind control hides them', () => {
        expect(notesFor(GROUP_CONTROL.SENSES).every((n) => n.kin)).toBe(true);
        expect(notesFor(GROUP_CONTROL.BLIND).some((n) => n.kin)).toBe(false);
        expect(notesFor(GROUP_CONTROL.SOLO).some((n) => n.kin)).toBe(false);
    });

    it('reports a share of trials in 0 to 1, replays bit for bit, and calls the hook once per trial', () => {
        /** @type {number[]} */
        const hits = [];
        const run = { config: {}, view: 350, seed: 3, trials: 2, onTrial: (/** @type {number} */ t) => hits.push(t) };
        const a = huntScore(GROUP_CONTROL.SENSES, watcher([]), run);
        expect(huntScore(GROUP_CONTROL.SENSES, watcher([]), run)).toBe(a);
        expect(a).toBeGreaterThanOrEqual(0);
        expect(a).toBeLessThanOrEqual(1);
        expect(hits).toEqual([0, 1, 0, 1]);
    });
});
