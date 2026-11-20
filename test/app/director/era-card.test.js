import { describe, expect, it } from 'vitest';
import { createEraSchedule, ERA_MINUTES, eraCardFor } from '../../../js/app/director/era-card.js';
import { createHistory, pushSample } from '../../../js/app/history.js';
import { mountEraCard } from '../../../js/app/ui/caption.js';
import { fakeDocument } from '../helpers/fake-dom.js';

const TPS = 60;
const MINUTE = 60 * TPS;

/**
 * @param {{minute: number, leader: number, caught: number, escaped: number, generation?: number}[]} samples one per
 *   simulated minute
 * @returns {import('../../../js/app/history.js').History} a history of them
 */
function historyOf(samples) {
    const h = createHistory({
        names: ['river.id0', 'caught', 'escaped', 'generation'],
        kinds: ['level', 'flow', 'flow', 'level'],
        sampleMs: 1,
    });
    samples.forEach((s, i) =>
        pushSample(h, {
            nowMs: (i + 1) * 10,
            tick: s.minute * MINUTE,
            values: [s.leader, s.caught, s.escaped, s.generation ?? 0],
        }),
    );
    return h;
}

const nameOf = (/** @type {number} */ id) => `Family${id}`;

describe('createEraSchedule', () => {
    it('is due once per ten minutes of simulated time, never inside a close shot, and not at the first call', () => {
        const era = createEraSchedule(TPS);
        const period = ERA_MINUTES * MINUTE;
        expect(era.due(5 * MINUTE, 'wide')).toBe(false);
        expect(era.due(period, 'glide')).toBe(false);
        expect(era.due(period + 10, 'linger')).toBe(false);
        expect(era.due(period + 20, 'pullback')).toBe(true);
        expect(era.due(period + 30, 'wide')).toBe(false);
        expect(era.due(2 * period, 'wide')).toBe(true);
    });

    it('does not show a card on entry at a late tick', () => {
        const era = createEraSchedule(TPS);
        expect(era.due(37 * MINUTE, 'wide')).toBe(false);
        expect(era.due(40 * MINUTE, 'wide')).toBe(true);
    });
});

describe('eraCardFor', () => {
    it('says who leads and for how long, the catch share now against before, and the generation', () => {
        const samples = [];
        for (let m = 1; m <= 24; m++) {
            samples.push({
                minute: m,
                leader: m <= 10 ? 3 : 7,
                caught: m <= 12 ? 3 : 5,
                escaped: m <= 12 ? 7 : 5,
                generation: m,
            });
        }
        const lines = eraCardFor(historyOf(samples), { tick: 24 * MINUTE, ticksPerSecond: TPS, nameOf });
        expect(lines).toEqual([
            'Family7 has led for 13 min',
            'Catch share 50%, was 34% ten minutes ago',
            'Generation 24',
        ]);
    });

    it('leaves out what the history cannot say', () => {
        const h = historyOf([
            { minute: 1, leader: -1, caught: 0, escaped: 0 },
            { minute: 2, leader: -1, caught: 0, escaped: 0 },
        ]);
        expect(eraCardFor(h, { tick: 2 * MINUTE, ticksPerSecond: TPS, nameOf })).toBeNull();
        const first = historyOf([
            { minute: 1, leader: 2, caught: 1, escaped: 3, generation: 4 },
            { minute: 2, leader: 2, caught: 1, escaped: 3, generation: 4 },
        ]);
        expect(eraCardFor(first, { tick: 2 * MINUTE, ticksPerSecond: TPS, nameOf })).toEqual([
            'Family2 has led for 1 min',
            'Catch share 25%',
            'Generation 4',
        ]);
    });

    it('says nothing before the history has two samples', () => {
        expect(
            eraCardFor(historyOf([{ minute: 1, leader: 1, caught: 1, escaped: 1 }]), {
                tick: 1,
                ticksPerSecond: TPS,
                nameOf,
            }),
        ).toBeNull();
    });
});

describe('mountEraCard', () => {
    it('shows the lines with the on class and hides it again', () => {
        const doc = fakeDocument();
        const parent = doc.createElement('body');
        const card = mountEraCard(doc, parent);
        expect(parent.children).toEqual([card.element]);
        card.show(['a', 'b']);
        expect(card.element.children[1].textContent).toBe('a\nb');
        expect(card.element.classList.contains('era-on')).toBe(true);
        card.hide();
        expect(card.element.classList.contains('era-on')).toBe(false);
    });
});
