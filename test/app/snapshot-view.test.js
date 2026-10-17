import { describe, expect, it } from 'vitest';
import { createSections, readSections } from '../../js/app/snapshot-view.js';
import { smallReady } from './helpers/ready.js';
import { makeSnapshot } from './helpers/snapshots.js';

describe('readSections', () => {
    it('places food, obstacles, clouds and rays after the agents in order', () => {
        const snap = makeSnapshot(
            5,
            [
                { slot: 0, genomeId: 1 },
                { slot: 1, genomeId: 2 },
            ],
            {
                foods: [[1, 2, 3]],
                obstacles: [
                    [4, 5, 6],
                    [7, 8, 9],
                ],
                clouds: [[10, 11, 0.5]],
            },
        );
        const s = readSections(snap.u32, createSections());
        expect(s).toMatchObject({ agentCount: 2, foodCount: 1, obstacleCount: 2, cloudCount: 1, rayCount: 0 });
        expect(Array.from(snap.f32.slice(s.foodStart, s.foodStart + 3))).toEqual([1, 2, 3]);
        expect(Array.from(snap.f32.slice(s.obstacleStart + 3, s.obstacleStart + 6))).toEqual([7, 8, 9]);
        expect(Array.from(snap.f32.slice(s.cloudStart, s.cloudStart + 3))).toEqual([10, 11, 0.5]);
        expect(s.rayStart).toBe(s.cloudStart + 3);
    });

    it('agrees with what the sim wrote for a real world', () => {
        const { snapshot } = smallReady(10);
        const s = readSections(snapshot.u32, createSections());
        expect(s.foodCount).toBeGreaterThan(0);
        const sampleRadius = snapshot.f32[s.foodStart + 2];
        expect(sampleRadius).toBeGreaterThan(0);
        expect(snapshot.f32[s.obstacleStart + 2]).toBeGreaterThan(0);
    });
});
