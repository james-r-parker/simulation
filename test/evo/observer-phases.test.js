import { describe, expect, it, vi } from 'vitest';
import { observerPhases } from '../../js/evo/observer.js';

vi.mock('../../js/sim/step.js', () => ({ STEP_PHASES: [{ name: 'senses', run: () => {} }] }));

describe('observerPhases without a physics phase', () => {
    it('throws rather than observing nothing', () => {
        expect(() => observerPhases({})).toThrow('observerPhases: step has no physics phase');
    });
});
