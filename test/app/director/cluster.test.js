import { describe, expect, it } from 'vitest';
import { largestCluster } from '../../../js/app/director/cluster.js';

describe('largestCluster', () => {
    it('finds the biggest group within the radius and its centroid, and nothing in an empty list', () => {
        const c = largestCluster(
            [
                { x: 0, y: 0 },
                { x: 10, y: 0 },
                { x: 500, y: 0 },
            ],
            50,
        );
        expect(c).toEqual({ count: 2, x: 5, y: 0 });
        expect(largestCluster([], 10)).toEqual({ count: 0, x: 0, y: 0 });
    });
});
