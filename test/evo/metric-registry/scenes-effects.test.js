// The status-effect entries (js/evo/metric-registry/scenes-effects.js): one share entry for each effect the scene reads, and
// the three scene metrics, all watched and none a reward.

import { describe, expect, it } from 'vitest';
import { SHARED } from '../../../js/evo/scene-effects.js';
import { SCENES_EFFECTS } from '../../../js/evo/metric-registry/scenes-effects.js';

describe('SCENES_EFFECTS', () => {
    it('holds an effect_share entry for each effect the scene reads, and the three scene metrics', () => {
        expect(Object.keys(SCENES_EFFECTS)).toEqual([
            ...SHARED.map((name) => `eval.effect_share.${name}`),
            'eval.rally_bite_share',
            'eval.hoarse_call_share',
            'eval.huddle_cold_gain',
        ]);
    });

    it('watches every metric with an intended direction, in the scene family, naming one module and test', () => {
        for (const [name, entry] of Object.entries(SCENES_EFFECTS)) {
            expect(entry.family, name).toBe('scenes-effects');
            expect(entry.direction, name).toBe('watch');
            expect(['higher', 'lower'], name).toContain(entry.intended);
            expect(entry.module, name).toBe('js/evo/scene-effects.js');
            expect(entry.tests.source, name).toBe('test/evo/scene-effects.test.js');
        }
    });
});
