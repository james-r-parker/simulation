import { describe, expect, it } from 'vitest';
import { herdMetrics } from '../../js/evo/scene-herd-metrics.js';

function build() {
    const scene = {
        trampled: 0,
        deaths: 0,
        episodesClear: 0,
        episodesHit: 0,
        herdGrazed: 0,
        plantEaten: 0,
        unavoidableTramples: 0,
        trampleDeaths: 0,
        elapsedTicks: 10000,
        stampedes: 5,
        animalSamples: 1,
        aliveSamples: 4,
        gapCrossings: 2,
        recolonisations: 1,
        hunterBites: 10,
        carcassEatenBySpec: Float64Array.of(0, 40, 0, 0, 0),
        foodEatenBySpec: Float64Array.of(80, 100, 0, 0, 0),
    };
    const carcassScene = { eaten: 30, eatenByHunters: 20 };
    const observer = { intent: { hunterSpec: Uint8Array.of(0, 1, 0, 0, 0) } };
    return herdMetrics(scene, carcassScene, observer);
}

describe('herd scene metrics', () => {
    it('reports each carcass share over the matching all-meal denominator', () => {
        const metrics = build();
        expect(metrics['eval.herd_carcass_share.predator'].value).toBeCloseTo(0.4);
        expect(metrics['eval.herd_carcass_share.forager'].value).toBe(0);
        expect(metrics['eval.herd_carcass_meal_share'].value).toBeCloseTo(0.5);
        expect(metrics['eval.carcass_meal_share'].value).toBeCloseTo(0.875);
        expect(metrics['eval.carcass_hunter_share'].value).toBeCloseTo(60 / 70);
    });

    it('returns null with a reason when a specialisation has not eaten', () => {
        const result = build()['eval.herd_carcass_share.reproducer'];
        expect(result.value).toBeNull();
        expect(result.reason).toContain('no meals for reproducer');
    });
});
