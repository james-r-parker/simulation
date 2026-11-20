import { describe, expect, it } from 'vitest';
import { createFamilySlots } from '../../../js/app/family-slots.js';
import { createInterpolated } from '../../../js/app/interpolate.js';
import {
    conditionOf,
    createPlateFade,
    mountSubjectPlate,
    PLATE_FADE_MS,
    plateSignature,
    plateText,
    plateView,
    STARVING_BELOW,
} from '../../../js/app/ui/subject-plate.js';
import { fakeDocument } from '../helpers/fake-dom.js';
import { smallReady } from '../helpers/ready.js';

const INFO = {
    temperatureColdStress: 5,
    temperatureOptimalMin: 10,
    temperatureOptimalMax: 20,
    temperatureHeatStress: 30,
};
const BITS = { PREGNANT: 1 << 13 };
const WORLD = { info: INFO, bits: BITS, hunted: false };
const BODY = { energy: 0.8, temperature: 15, flags: 0 };

describe('conditionOf', () => {
    it('is hunted before starving before pregnant before cold, and empty when well', () => {
        expect(conditionOf(BODY, WORLD)).toBe('');
        const cold = { ...BODY, temperature: 2 };
        expect(conditionOf(cold, WORLD)).toBe('cold');
        const pregnant = { ...cold, flags: BITS.PREGNANT };
        expect(conditionOf(pregnant, WORLD)).toBe('pregnant');
        const starving = { ...pregnant, energy: STARVING_BELOW - 0.01 };
        expect(conditionOf(starving, WORLD)).toBe('starving');
        expect(conditionOf(starving, { ...WORLD, hunted: true })).toBe('hunted');
        expect(conditionOf({ ...BODY, temperature: 8 }, WORLD)).toBe('');
    });
});

describe('plateView and plateText', () => {
    const { info, layout } = smallReady();
    const ready = { info, layout, seed: 3 };
    const agents = createInterpolated(2);
    agents.count = 1;
    agents.genomeId[0] = 42;
    agents.lineageId[0] = 9;
    agents.spec[0] = 0;
    agents.energy[0] = 0.9;
    agents.temperature[0] = (info.temperatureOptimalMin + info.temperatureOptimalMax) / 2;
    const slots = createFamilySlots();
    const source = { agents, i: 0, ready, slots, hunted: false, children: 2, stats: null };

    it('names the family and specialisation and counts the children alive, with no age or kills without the counters', () => {
        const view = plateView(source);
        expect(view).toMatchObject({
            id: 42,
            spec: info.specs[0].name,
            children: 2,
            age: '',
            kills: '',
            condition: '',
        });
        expect(view.family).not.toBe('');
        expect(plateText(view)).toEqual({ title: `${view.family} - ${view.spec}`, detail: 'children 2' });
    });

    it('adds the age in seasons, the kills and the condition when it has them', () => {
        const view = plateView({ ...source, hunted: true, stats: { ageSeasons: 3.26, kills: 4.2 } });
        expect(view).toMatchObject({ age: '3.3 seasons', kills: '4', condition: 'hunted' });
        expect(plateText(view).detail).toBe('3.3 seasons - children 2 - kills 4 - hunted');
    });

    it('changes its signature with the condition, children and kills but not the age', () => {
        const a = plateView({ ...source, stats: { ageSeasons: 1, kills: 0 } });
        const b = plateView({ ...source, stats: { ageSeasons: 2, kills: 0 } });
        expect(plateSignature(a)).toBe(plateSignature(b));
        expect(plateSignature(plateView({ ...source, children: 3 }))).not.toBe(plateSignature(a));
        expect(plateSignature(plateView({ ...source, hunted: true }))).not.toBe(plateSignature(plateView(source)));
    });
});

describe('createPlateFade', () => {
    it('shows for 6 s after a change, returns on a change, and hides with no subject', () => {
        const fade = createPlateFade();
        expect(fade.step('', 0)).toBe(false);
        expect(fade.step('a', 1000)).toBe(true);
        expect(fade.step('a', 1000 + PLATE_FADE_MS - 1)).toBe(true);
        expect(fade.step('a', 1000 + PLATE_FADE_MS)).toBe(false);
        expect(fade.step('b', 9000)).toBe(true);
        expect(fade.step('', 9100)).toBe(false);
        expect(fade.step('b', 9200)).toBe(true);
    });
});

describe('mountSubjectPlate', () => {
    /** @returns {any} a plate view */
    const view = (/** @type {Record<string, any>} */ over = {}) => ({
        id: 1,
        family: 'Velari',
        color: 'hsl(10, 50%, 50%)',
        spec: 'predator',
        age: '',
        children: 0,
        kills: '',
        condition: '',
        ...over,
    });

    it('writes only what changed, fades with the clock and hides with no subject', () => {
        const doc = fakeDocument();
        const parent = doc.createElement('body');
        const plate = mountSubjectPlate(doc, parent);
        expect(parent.children).toEqual([plate.element]);
        expect(plate.element.classList.contains('plate-on')).toBe(false);
        plate.update(view(), 0);
        expect(plate.element.classList.contains('plate-on')).toBe(true);
        const [title, detail] = plate.element.children;
        expect(title.textContent).toBe('Velari - predator');
        expect(title.style.color).toBe('hsl(10, 50%, 50%)');
        expect(detail.textContent).toBe('children 0');
        plate.update(view({ condition: 'hunted' }), 100);
        expect(detail.textContent).toBe('children 0 - hunted');
        plate.update(view({ condition: 'hunted' }), 100 + PLATE_FADE_MS);
        expect(plate.element.classList.contains('plate-on')).toBe(false);
        plate.update(view({ family: 'Other', color: 'red' }), 100 + PLATE_FADE_MS);
        expect(title.textContent).toBe('Other - predator');
        plate.update(null, 0);
        expect(plate.element.classList.contains('plate-on')).toBe(false);
    });
});
