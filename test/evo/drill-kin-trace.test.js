import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { SIBLING_SLOT, createKinTrace, noteKin } from '../../js/evo/drill-kin-trace.js';

/**
 * @param {{sibling: {x: number, y: number}, bite: number, subjectAlive?: number, siblingAlive?: number}} scene the
 *   sibling's place relative to a subject at (0, 0) facing +x, the subject's BITE output and who is alive
 * @returns {any} a three-slot fake world
 */
function world({ sibling, bite, subjectAlive = 1, siblingAlive = 1 }) {
    const outputs = new Float32Array(3 * OUTPUT_COUNT);
    outputs[OUTPUT_INDEX.BITE] = bite;
    return {
        config: { biteArc: Math.PI / 2 },
        biteCos: Float32Array.of(Math.cos(Math.PI / 2)),
        alive: Uint8Array.of(subjectAlive, 1, siblingAlive),
        x: Float32Array.of(0, 500, sibling.x),
        y: Float32Array.of(0, 500, sibling.y),
        angle: Float32Array.of(0, 0, 0),
        size: Float32Array.of(30, 30, 30),
        outputs,
    };
}

describe('noteKin', () => {
    it('counts the ticks the sibling is in the jaws, and those among them with BITE above 0', () => {
        const trace = createKinTrace();
        noteKin(trace, world({ sibling: { x: 60, y: 0 }, bite: 0 }));
        noteKin(trace, world({ sibling: { x: 60, y: 0 }, bite: 1 }));
        noteKin(trace, world({ sibling: { x: 40, y: 40 }, bite: 0.5 }));
        expect(trace).toEqual({ jawTicks: 3, biteTicks: 2 });
    });

    it('does not count a sibling that is not touching, is behind the subject, or is dead, nor a dead subject', () => {
        const trace = createKinTrace();
        noteKin(trace, world({ sibling: { x: 200, y: 0 }, bite: 1 }));
        noteKin(trace, world({ sibling: { x: -60, y: 0 }, bite: 1 }));
        noteKin(trace, world({ sibling: { x: 60, y: 0 }, bite: 1, siblingAlive: 0 }));
        noteKin(trace, world({ sibling: { x: 60, y: 0 }, bite: 1, subjectAlive: 0 }));
        expect(trace).toEqual({ jawTicks: 0, biteTicks: 0 });
    });

    it('reads the sibling in slot 2', () => {
        expect(SIBLING_SLOT).toBe(2);
    });
});
