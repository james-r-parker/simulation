import { describe, expect, it } from 'vitest';
import { SNAPSHOT_STATE } from '../../../js/sim/snapshot-state.js';
import { AGENT_FRAGMENT, AGENT_VERTEX } from '../../../js/app/renderer/agents-shader.js';
import { DOSE_SHIFT, GESTATION_SHIFT, STATE_BITS, STRAIN_SHIFT } from '../../../js/app/renderer/agents-pack.js';
import { BODY_BIT, BODY_STATE_GLSL, GAITS } from '../../../js/app/renderer/body-states-glsl.js';

describe('body state GLSL', () => {
    it('reads the state bits at the positions SNAPSHOT_STATE writes them', () => {
        expect(1 << BODY_BIT.RESTING).toBe(SNAPSHOT_STATE.RESTING);
        expect(1 << BODY_BIT.SATED).toBe(SNAPSHOT_STATE.SATED);
        expect(1 << BODY_BIT.IN_COVER).toBe(SNAPSHOT_STATE.IN_COVER);
        expect(1 << BODY_BIT.JUVENILE).toBe(SNAPSHOT_STATE.JUVENILE);
        expect([GESTATION_SHIFT, DOSE_SHIFT, STRAIN_SHIFT]).toEqual([
            SNAPSHOT_STATE.GESTATION_SHIFT,
            SNAPSHOT_STATE.DOSE_SHIFT,
            SNAPSHOT_STATE.STRAIN_SHIFT,
        ]);
        expect(STATE_BITS).toBe(
            SNAPSHOT_STATE.RESTING | SNAPSHOT_STATE.SATED | SNAPSHOT_STATE.IN_COVER | SNAPSHOT_STATE.JUVENILE,
        );
    });

    it('is spliced into the agent shader and used for the eye, the fill, the spots and the gestation arc', () => {
        expect(AGENT_VERTEX).toContain('attribute vec4 iBody;');
        expect(AGENT_FRAGMENT).toContain('vec2 stateP(vec2 p)');
        expect(AGENT_FRAGMENT).toContain('eyeCover(eyeAt)');
        expect(AGENT_FRAGMENT).toContain('(1.0 - concealment())');
        expect(AGENT_FRAGMENT).toContain('strainTint(');
        expect(AGENT_FRAGMENT).toContain('gestationArc(p) * cover');
        expect(AGENT_FRAGMENT).toContain('max(vSick, vBody.z)');
    });

    it('gates the breathing, roundness, eye and dither on the body item at full, and the arc on courtship', () => {
        expect(BODY_STATE_GLSL).toContain('if (uBody < 0.75) return p;');
        expect(BODY_STATE_GLSL).toContain('if (uBody < 0.75) return 0.0;');
        expect(BODY_STATE_GLSL).toContain('vPregnant * uCourt');
    });

    it('stretches a fleeing body into a streamline and widens its eye', () => {
        expect(BODY_STATE_GLSL).toContain('p.x /= 1.0 + 0.15 * vTween.w;');
        expect(BODY_STATE_GLSL).toContain('0.3 * vTween.w');
    });

    it('gives each of the five silhouettes its own gait, gated on the body and motion items', () => {
        expect(Object.keys(GAITS)).toEqual(['predator', 'forager', 'reproducer', 'scout', 'defender']);
        expect(BODY_STATE_GLSL).toContain('if (uBody < 0.75 || uMotion <= 0.0) return p;');
        for (const shape of ['0.5', '1.5', '2.5', '3.5']) {
            expect(BODY_STATE_GLSL).toContain(`uShape < ${shape}`);
        }
        expect(AGENT_FRAGMENT).toContain('* gaitRim()');
    });
});
