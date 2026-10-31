import { describe, expect, it } from 'vitest';
import { PASS_SHARE, SCENES, runPoolDiscrimination, runScene } from '../../js/evo/pool-discrimination.js';

describe('the discrimination scenes', () => {
    it('include the three brain scenes and the food-hue choice', () => {
        expect(SCENES.map((s) => s.name)).toEqual([
            'two-food-opposite',
            'two-threats-apart',
            'corridor',
            'food-hue-choice',
        ]);
    });

    it('food-hue-choice: raw and pooled controllers choose the requested hue in the first decision', () => {
        expect(runScene(SCENES[3], { trials: 8, seed: 1 })).toMatchObject({ pooled: 1, raw: 1, pass: true });
    });

    it('stage the same trial for both controllers and are deterministic', () => {
        const a = runScene(SCENES[0], { trials: 4, seed: 5 });
        const b = runScene(SCENES[0], { trials: 4, seed: 5 });
        expect(a).toEqual(b);
        expect(a).toMatchObject({ scene: 'two-food-opposite', trials: 4 });
    });

    it('two-food-opposite: both controllers eat both foods, so pooling loses nothing there', () => {
        const result = runScene(SCENES[0], { trials: 8, seed: 1 });
        expect(result).toMatchObject({ pooled: 1, raw: 1, pass: true });
    });

    it('corridor: the raw controller drives the passage and the pooled one, with its two strongest rock hits, does not', () => {
        const result = runScene(SCENES[2], { trials: 8, seed: 1 });
        expect(result.raw).toBeGreaterThanOrEqual(0.75);
        expect(result.pooled).toBeLessThan(PASS_SHARE * result.raw);
        expect(result.pass).toBe(false);
    });

    it('two-threats-apart: the raw controller survives at least as often as the pooled one', () => {
        const result = runScene(SCENES[1], { trials: 8, seed: 1 });
        expect(result.raw).toBeGreaterThan(0);
        expect(result.raw).toBeGreaterThanOrEqual(result.pooled);
    });

    it('a scene where the raw controller scores nothing cannot pass', () => {
        const never = { ...SCENES[0], won: () => false };
        expect(runScene(never, { trials: 2, seed: 1 })).toMatchObject({ raw: 0, pooled: 0, pass: false });
    });
});

describe('runPoolDiscrimination', () => {
    it('reports every scene, and passes only when every scene passes', () => {
        const report = runPoolDiscrimination({ trials: 4, seed: 1 });
        expect(report.scenes.map((s) => s.scene)).toEqual(SCENES.map((s) => s.name));
        expect(report.pass).toBe(report.scenes.every((s) => s.pass));
    });
});
