import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { ARENA_CENTRE } from '../../js/evo/chase-arena.js';
import { clearerBrain, nearestAnimal } from '../../js/evo/herd-oracles.js';

const out = (/** @type {any} */ w, /** @type {string} */ name) => w.outputs[OUTPUT_INDEX[name]];

/**
 * @param {{herdAt: [number, number][], body?: [number, number]}} at the animals and the body
 * @returns {Record<string, any>} the part of a world the oracle reads
 */
function world({ herdAt, body = [ARENA_CENTRE.x, ARENA_CENTRE.y] }) {
    return {
        herdMax: herdAt.length,
        herdAlive: Uint8Array.from(herdAt.map(() => 1)),
        herdX: Float64Array.from(herdAt.map((a) => a[0])),
        herdY: Float64Array.from(herdAt.map((a) => a[1])),
        x: Float64Array.of(body[0]),
        y: Float64Array.of(body[1]),
        angle: Float64Array.of(Math.PI),
        groupCentroidY: Float64Array.of(ARENA_CENTRE.y),
        config: { maxTurn: 0.15 },
        turnBySpec: Float64Array.of(1),
        spec: Uint8Array.of(0),
        outputs: new Float32Array(OUTPUT_COUNT),
        tick: 0,
    };
}

describe('nearestAnimal', () => {
    it('is the distance to the nearest alive animal, and Infinity with none', () => {
        const w = world({
            herdAt: [
                [ARENA_CENTRE.x - 300, ARENA_CENTRE.y],
                [ARENA_CENTRE.x - 100, ARENA_CENTRE.y + 100],
            ],
        });
        expect(nearestAnimal(w, 0)).toBeCloseTo(Math.sqrt(100 * 100 + 100 * 100), 9);
        w.herdAlive.fill(0);
        expect(nearestAnimal(w, 0)).toBe(Infinity);
    });
});

describe('clearerBrain', () => {
    const near = [[ARENA_CENTRE.x - 200, ARENA_CENTRE.y]];

    it('stands, holding nothing, while no animal is inside the seeing gap', () => {
        const w = world({ herdAt: [[ARENA_CENTRE.x - 900, ARENA_CENTRE.y]] });
        w.outputs.fill(1);
        const brain = clearerBrain({ slot: 0, seeGap: 380, reaction: 2, sprint: true });
        brain(w);
        expect(Array.from(w.outputs).every((v) => v === 0)).toBe(true);
        expect(brain.state.seenTick).toBe(-1);
    });

    it('notes the tick it sees the herd, waits the reaction ticks, then holds THRUST, SPRINT and a turn to the flank it stands on', () => {
        const w = world({
            herdAt: /** @type {[number, number][]} */ (near),
            body: [ARENA_CENTRE.x, ARENA_CENTRE.y + 30],
        });
        const brain = clearerBrain({ slot: 0, seeGap: 380, reaction: 2, sprint: true });
        w.tick = 5;
        brain(w);
        expect(brain.state.seenTick).toBe(5);
        expect(out(w, 'THRUST')).toBe(0);
        w.tick = 7;
        brain(w);
        expect([out(w, 'THRUST'), out(w, 'SPRINT')]).toEqual([1, 1]);
        expect(out(w, 'TURN')).not.toBe(0);
        const mirror = world({
            herdAt: /** @type {[number, number][]} */ (near),
            body: [ARENA_CENTRE.x, ARENA_CENTRE.y - 30],
        });
        const other = clearerBrain({ slot: 0, seeGap: 380, reaction: 0, sprint: false });
        other(mirror);
        expect(Math.sign(out(mirror, 'TURN'))).toBe(-Math.sign(out(w, 'TURN')));
        expect(out(mirror, 'SPRINT')).toBe(0);
    });

    it('a body on the centre line goes to the +y flank, and one told not to run stands', () => {
        const w = world({ herdAt: /** @type {[number, number][]} */ (near) });
        clearerBrain({ slot: 0, seeGap: 380, reaction: 0, sprint: true })(w);
        expect(out(w, 'THRUST')).toBe(1);
        const still = world({ herdAt: /** @type {[number, number][]} */ (near) });
        clearerBrain({ slot: 0, seeGap: 380, reaction: 0, sprint: true, run: false })(still);
        expect(out(still, 'THRUST')).toBe(0);
    });
});
