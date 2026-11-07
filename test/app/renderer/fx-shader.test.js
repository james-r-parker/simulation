import { describe, expect, it } from 'vitest';
import { FX_CURVES, FX_SHAPES } from '../../../js/app/renderer/fx-curves.js';
import { FX_FRAGMENT, FX_PAD, FX_VERTEX } from '../../../js/app/renderer/fx-shader.js';

describe('fx shader', () => {
    it('sizes its uniform arrays to the curve table and declares the four instance attributes', () => {
        expect(FX_VERTEX).toContain(`uniform vec4 uScale[${FX_CURVES.length}]`);
        for (const name of ['iPose', 'iColor', 'iTime', 'iMove']) {
            expect(FX_VERTEX).toContain(`attribute vec4 ${name}`);
        }
        expect(FX_FRAGMENT).not.toContain('undefined');
        expect(FX_VERTEX).not.toContain('undefined');
    });
});

describe('fx shader shapes', () => {
    it('branches on every shape index and pads the quad for the glow', () => {
        expect(FX_SHAPES).toHaveLength(16);
        expect(FX_FRAGMENT).toContain(`vShape < ${FX_SHAPES.indexOf('ORBIT')}.0`);
        expect(FX_FRAGMENT).toContain(`s < ${FX_SHAPES.indexOf('GHOST')}.0`);
        expect(FX_PAD).toBeGreaterThan(1);
    });

    it('collapses an instance outside its life off screen', () => {
        expect(FX_VERTEX).toContain('if (!(age >= 0.0 && age < 1.0))');
    });
});
