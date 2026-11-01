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
                foods: [[1, 2, 3, 0]],
                obstacles: [
                    [4, 5, 6],
                    [7, 8, 9],
                ],
                clouds: [[10, 11, 0.5]],
            },
        );
        const s = readSections(snap.u32, createSections());
        expect(s).toMatchObject({ agentCount: 2, foodCount: 1, cloudCount: 1, rayCount: 0 });
        expect(Array.from(snap.f32.slice(s.foodStart, s.foodStart + 4))).toEqual([1, 2, 3, 0]);
        expect(Array.from(snap.f32.slice(s.obstacleStart + 3, s.obstacleStart + 6))).toEqual([7, 8, 9]);
        expect(Array.from(snap.f32.slice(s.cloudStart, s.cloudStart + 3))).toEqual([10, 11, 0.5]);
        expect(s.rayStart).toBe(s.cloudStart + 3);
    });

    it('places herd records after patches and before rays', () => {
        const snap = makeSnapshot(6, [], { herds: [[40, 50, 80, 0.5, 1.2]] });
        const s = readSections(snap.u32, createSections());
        expect(s.herdCount).toBe(1);
        expect(Array.from(snap.f32.slice(s.herdStart, s.herdStart + 4))).toEqual([40, 50, 80, 0.5]);
        expect(snap.f32[s.herdStart + 4]).toBeCloseTo(1.2);
        expect(s.rayStart).toBe(s.herdStart + 5);
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
