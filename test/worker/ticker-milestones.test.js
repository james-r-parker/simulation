import { describe, expect, it } from 'vitest';
import {
    ageItems,
    createMilestones,
    lineageItems,
    packKillItems,
    STREAK_FLOOR,
    streakItems,
    takeCentre,
} from '../../js/worker/ticker-milestones.js';

/**
 * @param {{alive: number[], lineage: number[], age?: number[], x?: number[], y?: number[], tick?: number}} spec agents
 * @returns {Record<string, any>} a world with just the arrays the milestones read
 */
function world({ alive, lineage, age = [], x = [], y = [], tick = 500 }) {
    return {
        tick,
        alive: Uint8Array.from(alive),
        lineageId: Uint32Array.from(lineage),
        genomeId: Uint32Array.from(alive.map((_, i) => 100 + i)),
        ageTicks: Uint32Array.from(alive.map((_, i) => age[i] ?? 0)),
        x: Float32Array.from(alive.map((_, i) => x[i] ?? 0)),
        y: Float32Array.from(alive.map((_, i) => y[i] ?? 0)),
    };
}

describe('packKillItems', () => {
    it('announces the first pack kill once, with the killer place when known', () => {
        const m = createMilestones();
        expect(packKillItems(m, { tick: 9, genomeId: 4, x: 1, y: 2 })).toEqual([
            { tick: 9, kind: 'first-pack-kill', text: 'first pack kill', genomeId: 4, x: 1, y: 2 },
        ]);
        expect(packKillItems(m, { tick: 10, genomeId: 5, x: 1, y: 2 })).toEqual([]);
    });

    it('leaves the place out when it is not known', () => {
        const [item] = packKillItems(createMilestones(), { tick: 9, genomeId: 4 });
        expect(Object.keys(item)).toEqual(['tick', 'kind', 'text', 'genomeId']);
    });
});

describe('streakItems', () => {
    it('announces only a streak that beats every one before it', () => {
        const m = createMilestones();
        const at = { tick: 1, genomeId: 3, x: 5, y: 6 };
        expect(streakItems(m, { ...at, kills: STREAK_FLOOR })).toEqual([]);
        expect(streakItems(m, { ...at, kills: STREAK_FLOOR + 1 })).toMatchObject([
            { kind: 'record-streak', genomeId: 3, x: 5, y: 6 },
        ]);
        expect(streakItems(m, { ...at, kills: STREAK_FLOOR + 1 })).toEqual([]);
        expect(streakItems(m, { ...at, kills: STREAK_FLOOR + 2 })).toHaveLength(1);
    });
});

describe('ageItems', () => {
    it('announces the oldest agent when it passes the elder age and the record, and each new holder once', () => {
        const m = createMilestones();
        const w = world({ alive: [1, 1], lineage: [1, 2], age: [800, 900], x: [10, 20], y: [30, 40] });
        expect(ageItems(m, w, 850)).toMatchObject([{ kind: 'record-age', genomeId: 101, lineageId: 2, x: 20, y: 40 }]);
        w.ageTicks[1] = 950;
        expect(ageItems(m, w, 850)).toEqual([]);
        w.ageTicks[0] = 960;
        expect(ageItems(m, w, 850)).toMatchObject([{ genomeId: 100 }]);
    });

    it('says nothing when no one is old enough or the oldest is dead', () => {
        const m = createMilestones();
        expect(ageItems(m, world({ alive: [1], lineage: [1], age: [100] }), 850)).toEqual([]);
        expect(ageItems(m, world({ alive: [0], lineage: [1], age: [900] }), 850)).toEqual([]);
    });
});

describe('lineageItems and takeCentre', () => {
    it('announces a last stand once, where the survivor is, and again only after the family recovers', () => {
        const m = createMilestones();
        const big = new Set([7]);
        const w = world({ alive: [1, 1, 1], lineage: [7, 7, 7], x: [0, 30, 60], y: [0, 30, 60] });
        expect(lineageItems(m, w, big)).toEqual([]);
        w.alive[0] = 0;
        w.alive[1] = 0;
        expect(lineageItems(m, w, big)).toMatchObject([{ kind: 'last-stand', lineageId: 7, x: 60, y: 60 }]);
        expect(lineageItems(m, w, big)).toEqual([]);
        w.alive[0] = 1;
        lineageItems(m, w, big);
        w.alive[0] = 0;
        expect(lineageItems(m, w, big)).toHaveLength(1);
    });

    it('remembers the centre of a big family so its extinction has a place, then forgets it', () => {
        const m = createMilestones();
        lineageItems(m, world({ alive: [1, 1], lineage: [7, 7], x: [10, 30], y: [20, 40] }), new Set([7]));
        expect(takeCentre(m, 7)).toEqual({ x: 20, y: 30 });
        expect(takeCentre(m, 7)).toBeNull();
    });

    it('ignores families that are not big', () => {
        const m = createMilestones();
        expect(lineageItems(m, world({ alive: [1], lineage: [3] }), new Set())).toEqual([]);
        expect(m.centre.size).toBe(0);
    });
});
