import { describe, expect, it } from 'vitest';
import { GROUP_CONTROL, HUNT_TICKS, TRIO } from '../../js/evo/memory-probe-group.js';

describe('the group-hunt probe', () => {
    it('hunts with three clones for 600 ticks, against a trio that cannot sense its allies and a solo hunter', () => {
        expect(TRIO).toBe(3);
        expect(HUNT_TICKS).toBe(600);
        expect(Object.values(GROUP_CONTROL)).toEqual(['senses', 'kin-blind', 'solo']);
    });
});
