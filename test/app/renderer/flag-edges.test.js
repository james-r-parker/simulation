import { describe, expect, it } from 'vitest';
import { createInterpolated, interpolateInto } from '../../../js/app/interpolate.js';
import { createFlagEdges, diffFlags, EDGE } from '../../../js/app/renderer/flag-edges.js';
import { makeSnapshot } from '../helpers/snapshots.js';

const BITS = {
    ATE_SHIFT: 0,
    TIMER_MASK: 31,
    ALARMING: 1 << 11,
    HUNT_CALLING: 1 << 12,
    PREGNANT: 1 << 13,
    INFECTED: 1 << 15,
    SICK: 1 << 18,
};

/**
 * @param {ReturnType<typeof createFlagEdges>} edges the state
 * @param {{slot: number, genomeId: number, flags: number}[]} agents agents this frame
 * @returns {[number, number][]} the edges as [edge, index]
 */
function diff(edges, agents) {
    const out = createInterpolated(8);
    interpolateInto(null, makeSnapshot(1, agents), 1, out);
    /** @type {[number, number][]} */
    const found = [];
    diffFlags(edges, out, BITS, (edge, index) => found.push([edge, index]));
    return found;
}

describe('diffFlags', () => {
    it('reports nothing for a body seen for the first time', () => {
        const edges = createFlagEdges(8);
        expect(diff(edges, [{ slot: 2, genomeId: 9, flags: BITS.SICK | BITS.PREGNANT | 3 }])).toEqual([]);
    });

    it('reports rising and falling edges of each state bit with the agent index', () => {
        const edges = createFlagEdges(8);
        diff(edges, [
            { slot: 1, genomeId: 5, flags: 30 },
            { slot: 2, genomeId: 9, flags: BITS.INFECTED | 30 },
        ]);
        const found = diff(edges, [
            { slot: 1, genomeId: 5, flags: BITS.SICK | BITS.PREGNANT | BITS.ALARMING | BITS.HUNT_CALLING | 30 },
            { slot: 2, genomeId: 9, flags: 30 },
        ]);
        expect(found).toEqual([
            [EDGE.SICK_ON, 0],
            [EDGE.PREGNANT_ON, 0],
            [EDGE.ALARM_ON, 0],
            [EDGE.HUNT_ON, 0],
            [EDGE.INFECTED_OFF, 1],
        ]);
        expect(diff(edges, [{ slot: 1, genomeId: 5, flags: 30 }])).toEqual([[EDGE.SICK_OFF, 0]]);
    });

    it('reports an eat when the ate timer falls, not while it climbs', () => {
        const edges = createFlagEdges(8);
        diff(edges, [{ slot: 1, genomeId: 5, flags: 20 }]);
        expect(diff(edges, [{ slot: 1, genomeId: 5, flags: 22 }])).toEqual([]);
        expect(diff(edges, [{ slot: 1, genomeId: 5, flags: 2 }])).toEqual([[EDGE.ATE, 0]]);
        expect(diff(edges, [{ slot: 1, genomeId: 5, flags: 4 }])).toEqual([]);
    });

    it('reports nothing when a slot is reused by a new body', () => {
        const edges = createFlagEdges(8);
        diff(edges, [{ slot: 1, genomeId: 5, flags: 30 }]);
        expect(diff(edges, [{ slot: 1, genomeId: 6, flags: BITS.SICK | 1 }])).toEqual([]);
    });

    it('starts with an emitter that ignores edges until diffFlags installs the real one', () => {
        const edges = createFlagEdges(2);
        expect(edges.ctx.emit(EDGE.ATE, 0)).toBeUndefined();
    });
});
