import { describe, expect, it } from 'vitest';
import { AGENT_FRAGMENT, AGENT_VERTEX, QUAD_HALF } from '../../../js/app/renderer/agents-shader.js';

describe('agent shader', () => {
    it('declares every attribute and uniform the layer feeds, and the quad size matches the design', () => {
        for (const name of ['corner', 'iPose', 'iColor', 'iState', 'iExtra', 'iMotion']) {
            expect(AGENT_VERTEX).toContain(name);
        }
        for (const name of [
            'uShape',
            'uHunter',
            'uTime',
            'uBiteArc',
            'uTempLens',
            'uDim',
            'uRamp',
            'uSmoke',
            'uView',
            'uMotion',
        ]) {
            expect(AGENT_FRAGMENT).toContain(name);
        }
        expect(AGENT_VERTEX).toContain('uZoom');
        expect(QUAD_HALF).toBe(2.4);
        expect(AGENT_FRAGMENT).toContain('colorspace_fragment');
    });

    it('draws the nose notch and the small-agent tip only for a hunter, and a 4 px halo below 24 px across', () => {
        expect(AGENT_FRAGMENT).toContain('if (uShape > 0.5 && uHunter > 0.5)');
        expect(AGENT_FRAGMENT).toContain('small * uHunter');
        expect(AGENT_FRAGMENT).toContain('mix(9.0, 4.0, small)');
        expect(AGENT_FRAGMENT).toContain('smoothstep(23.0, 25.0, across)');
    });

    it('applies motion wobble and squash when uMotion is positive', () => {
        expect(AGENT_FRAGMENT).toContain('uMotion > 0.0');
        expect(AGENT_FRAGMENT).toContain('0.08 * speed01 * sin');
        expect(AGENT_FRAGMENT).toContain('1.0 / (1.0 + 0.12 * turn01)');
    });
});

describe('flora sickness', () => {
    it('uses the sickness bit and simulation tick for its tint and outline wobble', () => {
        expect(AGENT_VERTEX).toContain('vSick = iExtra.z');
        expect(AGENT_FRAGMENT).toContain('uSimTick * 0.05');
        expect(AGENT_FRAGMENT).toContain('vSick * uFlora');
    });
});
