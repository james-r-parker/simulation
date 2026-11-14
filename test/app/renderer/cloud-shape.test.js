import { describe, expect, it } from 'vitest';
import { cloudShape } from '../../../js/app/renderer/cloud-shape.js';

describe('cloudShape', () => {
    it('starts at half size and full strength, is full size by a quarter of its age, and fades out at the end', () => {
        expect(cloudShape(1)).toEqual({ radiusScale: 0.5, alpha: 1 });
        expect(cloudShape(0.75).radiusScale).toBe(1);
        expect(cloudShape(0.5).alpha).toBe(1);
        expect(cloudShape(0.25).alpha).toBeLessThan(1);
        expect(cloudShape(0).alpha).toBe(0);
    });
});
