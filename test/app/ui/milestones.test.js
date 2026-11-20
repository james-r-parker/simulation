import { describe, expect, it } from 'vitest';
import { clockLabel, MILESTONE_LINES, mountMilestones } from '../../../js/app/ui/milestones.js';
import { fakeDocument } from '../helpers/fake-dom.js';

describe('clockLabel', () => {
    it('writes simulated time as m:ss and h:mm:ss', () => {
        expect(clockLabel(0)).toBe('0:00');
        expect(clockLabel(65 * 60)).toBe('1:05');
        expect(clockLabel(3725 * 60)).toBe('1:02:05');
    });
});

describe('mountMilestones', () => {
    it('lists the newest first, and rewrites only when a milestone was added', () => {
        const doc = fakeDocument();
        const root = doc.createElement('div');
        const view = mountMilestones(doc, root);
        const list = root.children[0].children[1];
        expect(view.update([])).toBe(true);
        expect(view.update([])).toBe(false);
        const two = [
            { tick: 600, text: 'a' },
            { tick: 1200, text: 'b' },
        ];
        expect(view.update(two)).toBe(true);
        expect(list.children.map((/** @type {any} */ c) => c.textContent)).toEqual(['0:20  b', '0:10  a']);
        expect(view.update(two)).toBe(false);
    });

    it('shows at most the newest lines, and notices a full list whose newest item changed', () => {
        const doc = fakeDocument();
        const root = doc.createElement('div');
        const view = mountMilestones(doc, root);
        const many = Array.from({ length: 30 }, (_, i) => ({ tick: i * 60, text: `m${i}` }));
        view.update(many);
        expect(root.children[0].children[1].children).toHaveLength(MILESTONE_LINES);
        expect(view.update(many.map((m) => ({ ...m, tick: m.tick + 60 })))).toBe(true);
    });
});
