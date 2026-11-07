import { describe, expect, it } from 'vitest';
import { CLIENT_KIND } from '../../../js/app/renderer/client-kinds.js';
import { createFxNames, nameOf } from '../../../js/app/renderer/fx-names.js';

const LAYOUT = {
    effectKinds: { BORN: 1, DIED: 2, BITE: 3 },
    deathCauses: { STARVED: 0, EATEN: 1 },
    bornCauses: { INITIAL: 0, MATE: 1, SPLIT: 2 },
};

describe('nameOf', () => {
    it('names a death by its cause, a birth by its cause, a client kind and any other kind', () => {
        const names = createFxNames(LAYOUT);
        expect(nameOf(names, { kind: 2, c: 1 << 8, d: 0 })).toBe('EATEN');
        expect(nameOf(names, { kind: 2, c: 9 << 8, d: 0 })).toBe('DIED');
        expect(nameOf(names, { kind: 1, c: 0, d: 2 })).toBe('SPLIT');
        expect(nameOf(names, { kind: 3, c: 0, d: 0 })).toBe('BITE');
        expect(nameOf(names, { kind: CLIENT_KIND.MEAL, c: 0, d: 0 })).toBe('EAT');
        expect(nameOf(names, { kind: CLIENT_KIND.RECOVERED, c: 0, d: 0 })).toBe('INF-');
        expect(nameOf(names, { kind: 77, c: 0, d: 0 })).toBe('KIND 77');
    });
});
