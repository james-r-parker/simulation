import { describe, expect, it } from 'vitest';
import { EFFECTS } from '../../js/sim/effect-list.js';
import { EFFECT, EFFECT_INDEX, GATE, allocEffects, fadeEffects, gateOpen, liveOf } from '../../js/sim/effects.js';
import { hashWorld } from '../../js/sim/world-hash.js';
import { allocBody } from './helpers/body.js';
import { smallWorld } from './helpers/small-world.js';

describe('the default registry', () => {
    it('names each effect once, by `EFFECT_INDEX` and in UPPER_SNAKE by `EFFECT`', () => {
        expect(Object.keys(EFFECT_INDEX)).toEqual(EFFECTS.map((effect) => effect.name));
        expect(Object.values(EFFECT)).toEqual(Object.values(EFFECT_INDEX));
    });

    it('leaves every scaled lane at its base and every gate open for a calm body, with every level at 0', () => {
        const world = smallWorld({ maxAgents: 4 });
        const slot = allocBody(world, 0);
        world.temperature[slot] = 50;
        world.energy[slot] = 1;
        world.ateTimer[slot] = 255;
        world.ageTicks[slot] = world.config.maturityTicks;
        world.lanes.visionRange[slot] = 7;
        expect(liveOf(world, slot, 'visionRange')).toBe(7);
        for (const gate of Object.values(GATE)) {
            expect(gateOpen(world, slot, gate)).toBe(true);
        }
        for (const lane of new Set(EFFECTS.flatMap((effect) => effect.scales.map((scale) => scale.lane)))) {
            expect(liveOf(world, slot, lane), `${lane} of a calm body`).toBe(world.lanes[lane][slot]);
        }
    });

    it('allocates a row pair for each stored effect only, and fades nothing it has not stored', () => {
        const world = smallWorld({ maxAgents: 4 });
        const stored = EFFECTS.filter((effect) => effect.level === 'stacks').length;
        expect(world.effectStacks).toHaveLength(stored);
        expect(world.effectTicks).toHaveLength(stored);
        const rows = world.agentRows.length;
        allocEffects(world);
        expect(world.agentRows).toHaveLength(rows + 2 * stored);
        fadeEffects(world);
    });
});

describe('hashWorld', () => {
    it('covers the stored effect rows', () => {
        const world = smallWorld({ maxAgents: 4 });
        world.effectStacks = [new Float64Array(4)];
        world.effectTicks = [new Float64Array(4)];
        const before = hashWorld(world);
        world.effectTicks[0][2] = 1;
        expect(hashWorld(world)).not.toBe(before);
        world.effectTicks[0][2] = 0;
        world.effectStacks[0][1] = 2;
        expect(hashWorld(world)).not.toBe(before);
        world.effectStacks[0][1] = 0;
        expect(hashWorld(world)).toBe(before);
    });
});
