import { describe, expect, it } from 'vitest';
import { createFamilySlots, assignSlots } from '../../../js/app/family-slots.js';
import { createInterpolated, interpolateInto } from '../../../js/app/interpolate.js';
import { familyName } from '../../../js/app/renderer/colors.js';
import { createPeekTracker, mountPeek, nowLine, PEEK_REST_MS, peekView } from '../../../js/app/ui/hover-peek.js';
import { byClass, fakeDocument } from '../helpers/fake-dom.js';
import { makeSnapshot } from '../helpers/snapshots.js';

const BITS = {
    ATE_SHIFT: 0,
    BITTEN_SHIFT: 5,
    TIMER_MASK: 31,
    JAW_OPEN: 1 << 10,
    ALARMING: 1 << 11,
    HUNT_CALLING: 1 << 12,
    PREGNANT: 1 << 13,
};
const WORLD = { maxVelocity: 10, bits: BITS };

describe('nowLine', () => {
    it('takes the first line that holds, in order', () => {
        const all = (3 << BITS.BITTEN_SHIFT) | BITS.JAW_OPEN | BITS.HUNT_CALLING | BITS.ALARMING | 2 | BITS.PREGNANT;
        expect(nowLine(all, 9, WORLD)).toBe('being bitten');
        expect(nowLine(all & ~(31 << BITS.BITTEN_SHIFT), 9, WORLD)).toBe('biting');
        expect(nowLine(BITS.HUNT_CALLING | BITS.ALARMING | 2 | BITS.PREGNANT, 9, WORLD)).toBe('calling the pack');
        expect(nowLine(BITS.ALARMING | 2 | BITS.PREGNANT, 9, WORLD)).toBe('sounding an alarm');
        expect(nowLine(2 | BITS.PREGNANT, 9, WORLD)).toBe('eating');
        expect(nowLine(BITS.PREGNANT, 9, WORLD)).toBe('pregnant');
    });

    it('falls back on speed: sprinting above 70% of the top speed, resting below 5%, else wandering', () => {
        expect(nowLine(0, 7.1, WORLD)).toBe('sprinting');
        expect(nowLine(0, 7, WORLD)).toBe('wandering');
        expect(nowLine(0, 0.49, WORLD)).toBe('resting');
        expect(nowLine(0, 0.5, WORLD)).toBe('wandering');
    });
});

describe('peekView', () => {
    it('says the type, the family name and colour and what it is doing', () => {
        const agents = createInterpolated(4);
        interpolateInto(
            null,
            makeSnapshot(1, [{ slot: 0, genomeId: 1, spec: 1, lineageId: 5, flags: BITS.PREGNANT }]),
            1,
            agents,
        );
        const slots = createFamilySlots();
        assignSlots(slots, [{ id: 5 }]);
        const info = { specs: [{ name: 'predator' }, { name: 'forager' }], maxVelocity: 10 };
        const view = peekView({ agents, index: 0 }, { info, layout: { flags: BITS }, seed: 3, slots });
        expect(view).toMatchObject({ type: 'forager', name: familyName(3, 5), now: 'pregnant' });
        expect(view.color).toMatch(/^rgb\(/);
    });
});

describe('createPeekTracker', () => {
    it('is rested only after the pointer has stayed put for 150 ms, and not before it ever moved', () => {
        const tracker = createPeekTracker();
        expect(tracker.rested(1e9)).toBe(false);
        tracker.move(10, 20, 1000);
        expect(tracker.position()).toEqual({ x: 10, y: 20 });
        expect(tracker.rested(1000 + PEEK_REST_MS - 1)).toBe(false);
        expect(tracker.rested(1000 + PEEK_REST_MS)).toBe(true);
        tracker.move(12, 20, 1500);
        expect(tracker.rested(1500 + 10)).toBe(false);
    });
});

describe('mountPeek', () => {
    it('shows the tag beside the point with the family chip, and hides it', () => {
        const doc = fakeDocument();
        const root = doc.createElement('div');
        const peek = mountPeek(doc, root);
        expect(peek.visible()).toBe(false);
        peek.show({ type: 'scout', name: 'Velari', color: 'rgb(1, 2, 3)', now: 'resting' }, { x: 100, y: 50 });
        const [tag] = byClass(root, 'peek');
        expect(peek.visible()).toBe(true);
        expect([tag.style.left, tag.style.top]).toEqual(['114px', '64px']);
        expect(byClass(root, 'peek-text')[0].textContent).toBe('scout, Velari: resting');
        expect(byClass(root, 'peek-chip')[0].style.background).toBe('rgb(1, 2, 3)');
        peek.hide();
        expect(peek.visible()).toBe(false);
    });
});
