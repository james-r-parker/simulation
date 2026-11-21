import { describe, expect, it } from 'vitest';
import {
    childrenAlive,
    chooseHandoff,
    createStory,
    HOLD_AFTER_CLIP_MS,
    holdMsFor,
    noteStory,
    RELATION,
} from '../../js/app/follow-handoff.js';
import { createInterpolated } from '../../js/app/interpolate.js';
import { animFor } from '../../js/app/renderer/death-anim.js';

const KINDS = { DIED: 2, BORN: 1, BITE: 3 };
const CAUSE_NAMES = ['STARVED', 'EATEN', 'OLD_AGE'];
const CTX = { kinds: KINDS, eatenCause: 1, causeNames: CAUSE_NAMES };

/** @param {number} a @param {number} killer @param {number} cause @param {number} lineage @returns {any} a DIED */
const died = (a, killer, cause, lineage = 5) => ({ kind: 2, x: 100, y: 100, a, b: killer, c: cause * 256, d: lineage });
/** @param {number} child @param {number} mother @returns {any} a BORN */
const born = (child, mother) => ({ kind: 1, x: 0, y: 0, a: child, b: 5, c: mother, d: 1 });

/** @param {{id: number, lineage?: number, x?: number}[]} rows @returns {any} living agents */
function living(rows) {
    const agents = createInterpolated(Math.max(rows.length, 1));
    agents.count = rows.length;
    rows.forEach((r, i) => {
        agents.genomeId[i] = r.id;
        agents.lineageId[i] = r.lineage ?? 0;
        agents.x[i] = r.x ?? 100;
        agents.y[i] = 100;
    });
    return agents;
}

/** @param {any} story @param {any} agents @param {number} from @returns {{id: number, relation: string}} the choice */
function choose(story, agents, from) {
    const pick = { player: null, nowMs: 0, x: 0, y: 0, skip: 0 };
    return { ...chooseHandoff(story, agents, { from, pick }, { id: 0, relation: '' }) };
}

describe('the hold', () => {
    it('is the death clip of the cause plus 600 ms', () => {
        const story = createStory();
        noteStory(story, died(7, 0, 2), CTX);
        noteStory(story, died(8, 3, 1), CTX);
        expect(holdMsFor(story, 7)).toBe(animFor('OLD_AGE').ms + HOLD_AFTER_CLIP_MS);
        expect(holdMsFor(story, 8)).toBe(animFor('EATEN').ms + 600);
    });

    it('assumes a starvation until the death plays, and with no story', () => {
        expect(holdMsFor(createStory(), 9)).toBe(animFor('STARVED').ms + 600);
        expect(holdMsFor(null, 9)).toBe(animFor('STARVED').ms + 600);
    });
});

describe('the handoff order', () => {
    it('goes to the killer when the death was eaten and the killer lives', () => {
        const story = createStory();
        noteStory(story, born(20, 7), CTX);
        noteStory(story, died(7, 30, 1), CTX);
        expect(choose(story, living([{ id: 20 }, { id: 30 }]), 7)).toEqual({ id: 30, relation: RELATION.KILLER });
    });

    it('ignores a killer when the cause was not eaten, or the killer is gone', () => {
        const story = createStory();
        noteStory(story, born(20, 7), CTX);
        noteStory(story, died(7, 30, 0), CTX);
        expect(choose(story, living([{ id: 20 }, { id: 30 }]), 7).relation).toBe(RELATION.CHILD);
        noteStory(story, died(8, 31, 1), CTX);
        expect(choose(story, living([{ id: 20 }]), 8).relation).toBe(RELATION.PICK);
    });

    it('goes to the newest living child, skipping the dead', () => {
        const story = createStory();
        noteStory(story, born(20, 7), CTX);
        noteStory(story, born(21, 7), CTX);
        noteStory(story, born(22, 7), CTX);
        noteStory(story, born(23, 99), CTX);
        noteStory(story, died(7, 0, 2), CTX);
        expect(choose(story, living([{ id: 20 }, { id: 21 }, { id: 23 }]), 7)).toEqual({
            id: 21,
            relation: RELATION.CHILD,
        });
        expect(childrenAlive(story, living([{ id: 20 }, { id: 21 }, { id: 23 }]), 7)).toBe(2);
    });

    it('goes to the nearest living kin of the lineage when no child lives', () => {
        const story = createStory();
        noteStory(story, died(7, 0, 2, 5), CTX);
        const agents = living([
            { id: 40, lineage: 6, x: 101 },
            { id: 41, lineage: 5, x: 400 },
            { id: 42, lineage: 5, x: 180 },
            { id: 43, lineage: 5, x: 180 },
        ]);
        expect(choose(story, agents, 7)).toEqual({ id: 42, relation: RELATION.KIN });
    });

    it('has no kin when the lineage is 0 or none of it lives, and falls back to the pick', () => {
        const story = createStory();
        noteStory(story, died(7, 0, 2, 0), CTX);
        expect(choose(story, living([{ id: 40, lineage: 0 }]), 7)).toEqual({ id: 40, relation: RELATION.PICK });
        noteStory(story, died(8, 0, 2, 5), CTX);
        expect(choose(story, living([{ id: 40, lineage: 6 }]), 8).relation).toBe(RELATION.PICK);
    });

    it('picks when the death is unknown, the story is missing, or nobody lives', () => {
        expect(choose(createStory(), living([{ id: 50 }]), 7)).toEqual({ id: 50, relation: RELATION.PICK });
        expect(choose(null, living([{ id: 50 }]), 7).relation).toBe(RELATION.PICK);
        expect(choose(null, living([]), 7)).toEqual({ id: 0, relation: RELATION.PICK });
    });
});

describe('the story rings', () => {
    it('ignores other effects and a birth with no mother', () => {
        const story = createStory();
        noteStory(story, { kind: 3, x: 0, y: 0, a: 1, b: 2, c: 0, d: 0 }, CTX);
        noteStory(story, born(20, 0), CTX);
        expect(story.deathCount + story.birthCount).toBe(0);
    });

    it('keep the newest deaths and births once full', () => {
        const story = createStory();
        for (let k = 1; k <= 20; k++) {
            noteStory(story, died(k, 0, 2), CTX);
        }
        for (let k = 1; k <= 300; k++) {
            noteStory(story, born(1000 + k, 7), CTX);
        }
        expect(story.deathCount).toBe(16);
        expect(holdMsFor(story, 20)).toBe(animFor('OLD_AGE').ms + 600);
        expect(holdMsFor(story, 2)).toBe(animFor('STARVED').ms + 600);
        expect(childrenAlive(story, living([{ id: 1001 }, { id: 1300 }]), 7)).toBe(1);
    });
});
