import { describe, expect, it } from 'vitest';
import { OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { referenceSubject } from '../../js/evo/memory-probe-references.js';
import { caseNamed } from '../../js/evo/reflex-cases.js';
import { createReflexWorld, evalReflex } from '../../js/evo/reflex-eval.js';
import { hueAwareSubject } from '../../js/evo/reflex-references.js';
import { buildCaseTable } from '../../js/evo/reflex-table.js';

describe('hueAwareSubject', () => {
    const table = buildCaseTable(caseNamed('pick-safe-food'), { trials: 16 });

    it('is a scripted subject with no weights', () => {
        const subject = hueAwareSubject();
        expect(subject).toMatchObject({ name: 'hue-aware', weights: null });
        expect(typeof subject.act).toBe('function');
    });

    it('passes pick-safe-food, where the memoryless reference cannot', () => {
        const [hue, memoryless] = evalReflex([hueAwareSubject(), referenceSubject('memoryless')], [table]);
        expect(hue['pick-safe-food'].passShare).toBe(1);
        expect(memoryless['pick-safe-food'].passShare).toBeLessThan(0.1);
    });

    it('goes for the safe hue although the toxic food is nearer, and stands still with nothing in view', () => {
        const world = createReflexWorld({}, 1, 0);
        const subject = hueAwareSubject();
        const raw = table.rawInputCount;
        world.inputs.set(table.rows.subarray(0, raw), 0);
        world.rayHue.set(table.hues.subarray(0, table.rayCount), 0);
        subject.act?.(world);
        const safeBearing = table.sequences[0].staging.bearing;
        expect(Math.sign(world.outputs[OUTPUT_INDEX.TURN])).toBe(Math.sign(safeBearing));
        expect(world.outputs[OUTPUT_INDEX.THRUST]).toBeGreaterThan(0);
        world.inputs.fill(0);
        world.rayHue.fill(0);
        subject.act?.(world);
        expect(world.outputs[OUTPUT_INDEX.THRUST]).toBe(0);
        expect(world.outputs[OUTPUT_INDEX.TURN]).toBe(0);
    });
});
