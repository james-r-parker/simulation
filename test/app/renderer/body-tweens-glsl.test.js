import { describe, expect, it } from 'vitest';
import { TWEEN } from '../../../js/app/renderer/body-tweens.js';
import { TWEEN_GLSL } from '../../../js/app/renderer/body-tweens-glsl.js';
import { AGENT_FRAGMENT } from '../../../js/app/renderer/agents-shader.js';

describe('body tween GLSL', () => {
    it('the shader branches on every kind in TWEEN order', () => {
        for (const [name, k] of Object.entries(TWEEN).slice(1, -1)) {
            expect(TWEEN_GLSL, name).toContain(`k < ${k}.5`);
        }
        expect(TWEEN_GLSL).toContain('vec2 bodyStates(vec2 p, float cold, float hot)');
    });

    it('is spliced into the agent shader after the varyings it reads, and applied before the silhouette', () => {
        expect(AGENT_FRAGMENT).toContain('vec2 tweenP(vec2 p)');
        expect(AGENT_FRAGMENT.indexOf('varying vec4 vTween;')).toBeLessThan(AGENT_FRAGMENT.indexOf('vec2 tweenP'));
        expect(AGENT_FRAGMENT).toContain('bodyStates(tweenP(vP), cold, hot)');
    });

    it('gates the one-shot tweens on uBody and the continuous states on uBody at full', () => {
        expect(TWEEN_GLSL).toContain('if (uBody <= 0.0 || k < 0.5) return p;');
        expect(TWEEN_GLSL).toContain('if (uBody < 0.75) return p;');
    });
});
