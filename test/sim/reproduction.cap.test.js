import { describe, expect, it } from 'vitest';
import { advancePregnancies, splitAll } from '../../js/sim/reproduction.js';
import { freeAgent } from '../../js/sim/world.js';
import { addBlob, lifeWorld, recordingPolicy } from './helpers/life-world.js';

describe('capBirthsEnabled: pregnancies', () => {
    it('loses a due pregnancy in a full world when off', () => {
        const w = lifeWorld({ maxAgents: 1 });
        const m = addBlob(w, { energy: 2000, pregnancy: 1 });
        advancePregnancies(w, recordingPolicy([]));
        expect(w.pregnancy[m]).toBe(0);
        expect(w.population).toBe(1);
        expect(w.events.count).toBe(1);
    });

    it('keeps it at 1, with no event and no energy change, when on', () => {
        const w = lifeWorld({ maxAgents: 1, capBirthsEnabled: true });
        const m = addBlob(w, { energy: 2000, pregnancy: 1, cooldown: 5 });
        for (let i = 0; i < 3; i++) {
            advancePregnancies(w, recordingPolicy([]));
        }
        expect(w.pregnancy[m]).toBe(1);
        expect(w.energy[m]).toBe(2000);
        expect(w.events.count).toBe(0);
        expect(w.population).toBe(1);
    });

    it('is born once a slot frees', () => {
        const w = lifeWorld({ maxAgents: 2, capBirthsEnabled: true });
        const m = addBlob(w, { energy: 2000, pregnancy: 1 });
        const other = addBlob(w, { energy: 100 });
        advancePregnancies(w, recordingPolicy([]));
        expect(w.population).toBe(2);
        expect(w.pregnancy[m]).toBe(1);
        freeAgent(w, other);
        advancePregnancies(w, recordingPolicy([]));
        expect(w.pregnancy[m]).toBe(0);
        expect(w.population).toBe(2);
        expect(w.energy[m]).toBeLessThan(2000);
    });

    it('does not delay a pregnancy while there is room', () => {
        const w = lifeWorld({ maxAgents: 4, capBirthsEnabled: true });
        const m = addBlob(w, { energy: 2000, pregnancy: 2 });
        advancePregnancies(w, recordingPolicy([]));
        expect(w.pregnancy[m]).toBe(1);
        advancePregnancies(w, recordingPolicy([]));
        expect(w.pregnancy[m]).toBe(0);
        expect(w.population).toBe(2);
    });
});

describe('capBirthsEnabled: splits', () => {
    it('splits up to maxAgents when off', () => {
        const w = lifeWorld({ maxAgents: 4 });
        for (let i = 0; i < 3; i++) {
            addBlob(w, { energy: 2000 });
        }
        splitAll(w, recordingPolicy([]));
        expect(w.population).toBe(4);
    });

    it('stops within splitCapMargin of maxAgents when on', () => {
        const w = lifeWorld({ maxAgents: 6, capBirthsEnabled: true, splitCapMargin: 2 });
        for (let i = 0; i < 3; i++) {
            addBlob(w, { energy: 2000 });
        }
        splitAll(w, recordingPolicy([]));
        expect(w.population).toBe(4);
        expect(w.events.count).toBe(1);
    });

    it('does not split when the population starts inside the margin', () => {
        const w = lifeWorld({ maxAgents: 4, capBirthsEnabled: true, splitCapMargin: 50 });
        const a = addBlob(w, { energy: 2000 });
        splitAll(w, recordingPolicy([]));
        expect(w.population).toBe(1);
        expect(w.energy[a]).toBe(2000);
    });
});
