import { describe, expect, it } from 'vitest';
import { LANES } from '../../js/sim/body-lanes.js';
import { EFFECTS } from '../../js/sim/effect-list.js';
import { GATE } from '../../js/sim/effects.js';

describe('EFFECTS', () => {
    it('is a frozen list of effects with their own names', () => {
        expect(Object.isFrozen(EFFECTS)).toBe(true);
        expect(new Set(EFFECTS.map((effect) => effect.name)).size).toBe(EFFECTS.length);
    });

    it('names only lanes and gates that exist', () => {
        const lanes = new Set(LANES.map((lane) => lane.name));
        for (const effect of EFFECTS) {
            for (const scale of effect.scales) {
                expect(lanes.has(scale.lane), `${effect.name} scales ${scale.lane}`).toBe(true);
            }
            for (const gate of effect.gates) {
                expect(GATE, `${effect.name} closes ${gate}`).toHaveProperty(gate);
            }
        }
    });
});
