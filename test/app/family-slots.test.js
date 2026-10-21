import { describe, expect, it } from 'vitest';
import { assignSlots, createFamilySlots, FAMILY_SLOTS, slotOf } from '../../js/app/family-slots.js';

/** @param {number[]} ids family ids by rank @returns {{id: number}[]} a top list */
const top = (ids) => ids.map((id) => ({ id }));

describe('assignSlots', () => {
    it('gives the top eight the lowest free slots in rank order', () => {
        const slots = createFamilySlots();
        expect(assignSlots(slots, top([10, 11, 12]))).toBe(true);
        expect([slotOf(slots, 10), slotOf(slots, 11), slotOf(slots, 12)]).toEqual([0, 1, 2]);
        expect(slotOf(slots, 99)).toBe(-1);
    });

    it('keeps a family on its slot while it stays in the top 12, however its rank moves', () => {
        const slots = createFamilySlots();
        assignSlots(slots, top([1, 2, 3]));
        const version = slots.version;
        expect(assignSlots(slots, top([3, 2, 1]))).toBe(false);
        expect(slots.version).toBe(version);
        expect([slotOf(slots, 1), slotOf(slots, 2), slotOf(slots, 3)]).toEqual([0, 1, 2]);
        const twelve = top([3, 2, 1, 20, 21, 22, 23, 24, 25, 26, 27, 28]);
        assignSlots(slots, twelve);
        expect(slotOf(slots, 1)).toBe(0);
    });

    it('frees the slot of a family that leaves the top 12 and gives it to the next one up', () => {
        const slots = createFamilySlots();
        assignSlots(slots, top([1, 2, 3, 4, 5, 6, 7, 8]));
        expect(slotOf(slots, 3)).toBe(2);
        assignSlots(slots, top([1, 2, 4, 5, 6, 7, 8, 9]));
        expect(slotOf(slots, 3)).toBe(-1);
        expect(slotOf(slots, 9)).toBe(2);
    });

    it('leaves a family beyond the eighth neutral until a slot frees, even inside the top 12', () => {
        const slots = createFamilySlots();
        assignSlots(slots, top([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]));
        expect(slotOf(slots, 9)).toBe(-1);
        expect(new Set(Array.from(slots.ids)).size).toBe(FAMILY_SLOTS);
        assignSlots(slots, top([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]));
        expect(slotOf(slots, 1)).toBe(-1);
        expect(slotOf(slots, 9)).toBe(0);
        expect(slotOf(slots, 10)).toBe(-1);
    });

    it('keeps a family that fell out of the top 8 but is still in the top 12', () => {
        const slots = createFamilySlots();
        assignSlots(slots, top([1, 2, 3, 4, 5, 6, 7, 8]));
        assignSlots(slots, top([9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 1]));
        expect(slotOf(slots, 1)).toBe(0);
        expect(slotOf(slots, 9)).toBe(1);
        expect(slotOf(slots, 15)).toBe(7);
        expect(slotOf(slots, 16)).toBe(-1);
    });
});

describe('createFamilySlots', () => {
    it('starts with every slot free and the named palette', () => {
        const slots = createFamilySlots('cvd-safe');
        expect(Array.from(slots.ids)).toEqual(new Array(FAMILY_SLOTS).fill(-1));
        expect(slots.palette).toBe('cvd-safe');
        expect(createFamilySlots().palette).toBe('default');
    });
});
