import { describe, expect, it } from 'vitest';
import { findMoments, readSnapshotAgents } from '../../../js/app/director/moments.js';
import { EFFECT_BITS, MOMENT_KIND, MOMENT_THRESHOLD } from '../../../js/app/director/scoring.js';
import { AGENT_FIELD, AGENT_STRIDE, HEADER_WORDS } from '../../../js/app/interpolate.js';

const INFO = {
    worldWidth: 2000,
    worldHeight: 1000,
    maxVelocity: 2,
    biteArc: Math.PI / 4,
    ticksPerSecond: 60,
    specs: [
        { index: 0, name: 'predator', canHunt: true },
        { index: 1, name: 'forager', canHunt: false },
    ],
};

const LAYOUT = {
    effectKinds: { BORN: 1, DIED: 2, BITE: 3, ALARM: 4, PACK_CALL: 5, SMOKE: 6, ESCAPED: 7 },
    deathCauses: { EATEN: 2 },
    flags: { HUNTING: 1 << 16, FLEEING: 1 << 17 },
};

/**
 * Packs agent records into a raw `{ u32, f32 }` snapshot buffer.
 * @param {readonly Record<string, number>[]} records agent records
 * @returns {{u32: Uint32Array, f32: Float32Array}} raw snapshot
 */
function makeRawSnapshot(records) {
    const buffer = new ArrayBuffer((HEADER_WORDS + records.length * AGENT_STRIDE) * 4);
    const u32 = new Uint32Array(buffer);
    const f32 = new Float32Array(buffer);
    u32[1] = records.length;
    records.forEach((r, i) => {
        const o = HEADER_WORDS + i * AGENT_STRIDE;
        f32[o + AGENT_FIELD.X] = r.x;
        f32[o + AGENT_FIELD.Y] = r.y;
        f32[o + AGENT_FIELD.ANGLE] = r.angle;
        f32[o + AGENT_FIELD.SIZE] = r.size;
        u32[o + AGENT_FIELD.SPEC] = r.spec;
        u32[o + AGENT_FIELD.LINEAGE] = r.lineageId;
        u32[o + AGENT_FIELD.GENOME] = r.genomeId;
        f32[o + AGENT_FIELD.SPEED] = r.speed;
        u32[o + AGENT_FIELD.FLAGS] = r.flags;
    });
    return { u32, f32 };
}

describe('readSnapshotAgents', () => {
    it('reads from a raw snapshot buffer, an agent array or null', () => {
        expect(readSnapshotAgents(null)).toEqual([]);
        const raw = makeRawSnapshot([
            { genomeId: 10, lineageId: 2, spec: 0, x: 50, y: 60, angle: 0, size: 12, speed: 1.5, flags: 1 << 16 },
        ]);
        const parsed = readSnapshotAgents(raw);
        expect(parsed).toEqual([
            { genomeId: 10, lineageId: 2, spec: 0, x: 50, y: 60, angle: 0, size: 12, speed: 1.5, flags: 1 << 16 },
        ]);
        expect(readSnapshotAgents(parsed)).toBe(parsed);
    });
});

describe('findMoments: chases', () => {
    const hunter = (/** @type {Record<string, number>} */ over) => ({
        genomeId: 1,
        lineageId: 1,
        spec: 0,
        x: 200,
        y: 100,
        angle: 0,
        size: 40,
        speed: 2,
        flags: 0,
        ...over,
    });
    const prey = (/** @type {Record<string, number>} */ over) => ({
        genomeId: 2,
        lineageId: 2,
        spec: 1,
        x: 270,
        y: 100,
        angle: 0,
        size: 10,
        speed: 2,
        flags: 0,
        ...over,
    });
    /** The pursuit as it was 1.5 s ago: the hunter 100 units further back. */
    const EARLIER = [hunter({ x: 100 }), prey({})];
    const chases = (/** @type {Record<string, number>} */ h, /** @type {Record<string, number>} */ p) =>
        findMoments({
            snapshot: [hunter(h), prey(p)],
            earlierSnapshot: EARLIER,
            info: INFO,
            layout: LAYOUT,
            tick: 600,
        }).filter((m) => m.kind === MOMENT_KIND.CHASE);

    it('finds a chase from the geometry alone while the snapshot has no hunting bit, and needs the bit once it has one', () => {
        const input = { snapshot: [hunter({}), prey({})], earlierSnapshot: EARLIER, info: INFO, tick: 600 };
        const noBit = findMoments({ ...input, layout: { ...LAYOUT, flags: {} } });
        expect(noBit.map((m) => m.kind)).toEqual([MOMENT_KIND.CHASE]);
        expect(findMoments({ ...input, layout: LAYOUT })).toEqual([]);
    });

    it('finds a sustained pursuit: near, closing, aimed, moving and no slower than the prey', () => {
        const found = chases({ flags: 1 << 16 }, {});
        expect(found).toHaveLength(1);
        expect(found[0]).toMatchObject({
            x: 235,
            y: 100,
            hunterId: 1,
            preyId: 2,
            hunterSpec: 'predator',
            preySpec: 'forager',
        });
        // 65 + 20 x (1 - 70 / 100): reach is 2.5 hunter sizes
        expect(found[0].score).toBeCloseTo(71);
    });

    it('rejects a pursuit that fails any rule', () => {
        const hunting = { flags: 1 << 16 };
        // Beyond 2.5 hunter sizes (100 units): the prey is 130 away
        expect(chases(hunting, { x: 330 })).toEqual([]);
        // Aimed 0.5 rad off its prey, wider than the 0.3 rad alignment and inside the jaw arc
        expect(chases({ ...hunting, angle: 0.5 }, {})).toEqual([]);
        // Drifting: slower than 0.35 of maxVelocity now
        expect(chases({ ...hunting, speed: 0.5 }, {})).toEqual([]);
        // The prey is faster than the hunter
        expect(chases(hunting, { speed: 2.5 })).toEqual([]);
        // The prey runs at the hunter
        expect(chases(hunting, { angle: Math.PI })).toEqual([]);
        // The gap did not close by 20%
        const flat = findMoments({
            snapshot: [hunter(hunting), prey({})],
            earlierSnapshot: [hunter({ x: 190, ...hunting }), prey({})],
            info: INFO,
            layout: LAYOUT,
            tick: 600,
        });
        expect(flat).toEqual([]);
    });

    it('rejects a hunter that was not moving 1.5 s ago, a prey that is not smaller, a prey missing earlier and a prey that can hunt', () => {
        const hunting = { flags: 1 << 16 };
        const run = (/** @type {any[]} */ now, /** @type {any[]} */ before) =>
            findMoments({ snapshot: now, earlierSnapshot: before, info: INFO, layout: LAYOUT, tick: 600 });
        expect(run([hunter(hunting), prey({})], [hunter({ x: 100, speed: 0.1, ...hunting }), prey({})])).toEqual([]);
        expect(
            run([hunter(hunting), prey({ size: 40 })], [hunter({ x: 100, ...hunting }), prey({ size: 40 })]),
        ).toEqual([]);
        expect(run([hunter(hunting), prey({})], [hunter({ x: 100, ...hunting })])).toEqual([]);
        expect(run([hunter(hunting), prey({ spec: 0 })], [hunter({ x: 100, ...hunting }), prey({ spec: 0 })])).toEqual(
            [],
        );
        expect(run([hunter({ ...hunting, genomeId: 9 }), prey({})], EARLIER)).toEqual([]);
    });
});

describe('findMoments: effects and clusters', () => {
    it('detects pack-kill, deliberate kill, chance kill (< 45), escape, smoke-escape, smoke-screen and clusters', () => {
        const eatenWord = LAYOUT.deathCauses.EATEN << EFFECT_BITS.CAUSE_SHIFT;
        const snapshot = [
            { genomeId: 20, lineageId: 3, spec: 1, x: 555, y: 666, angle: 0, size: 10, speed: 1, flags: 0 },
        ];
        const effects = [
            // Future effect (ignored):
            { kind: LAYOUT.effectKinds.DIED, tick: 610, x: 0, y: 0, a: 1, b: 2, c: eatenWord, d: 1 },
            // Pack kill (deliberate + pack):
            {
                kind: LAYOUT.effectKinds.DIED,
                tick: 600,
                x: 100,
                y: 200,
                a: 10,
                b: 11,
                c: eatenWord | EFFECT_BITS.DIED_PACK | EFFECT_BITS.DIED_DELIBERATE,
                d: 1,
            },
            // Deliberate solo kill:
            {
                kind: LAYOUT.effectKinds.DIED,
                tick: 600,
                x: 150,
                y: 250,
                a: 12,
                b: 11,
                c: eatenWord | EFFECT_BITS.DIED_DELIBERATE,
                d: 1,
            },
            // Chance kill (scores 30, below 45):
            { kind: LAYOUT.effectKinds.DIED, tick: 600, x: 180, y: 280, a: 13, b: 11, c: eatenWord, d: 1 },
            // Escape of live victim 20 (uses live position 555, 666):
            {
                kind: LAYOUT.effectKinds.ESCAPED,
                tick: 600,
                x: 10,
                y: 20,
                a: 20,
                b: 11,
                c: EFFECT_BITS.ESCAPED_RESPONDED,
                d: 3,
            },
            // Smoke escape of non-present victim 21 (uses effect position 30, 40):
            {
                kind: LAYOUT.effectKinds.ESCAPED,
                tick: 600,
                x: 30,
                y: 40,
                a: 21,
                b: 11,
                c: EFFECT_BITS.ESCAPED_RESPONDED | EFFECT_BITS.ESCAPED_SMOKE,
                d: 3,
            },
            // Smoke screen:
            {
                kind: LAYOUT.effectKinds.SMOKE,
                tick: 600,
                x: 70,
                y: 80,
                a: 20,
                b: 0,
                c: EFFECT_BITS.SMOKE_BITTEN,
                d: 0,
            },
            // 3 alarms within 800 units in last 3 s:
            { kind: LAYOUT.effectKinds.ALARM, tick: 540, x: 400, y: 400, a: 1, b: 0, c: 1, d: 1 },
            { kind: LAYOUT.effectKinds.ALARM, tick: 550, x: 460, y: 400, a: 2, b: 0, c: 1, d: 1 },
            { kind: LAYOUT.effectKinds.ALARM, tick: 560, x: 520, y: 400, a: 3, b: 0, c: 1, d: 1 },
            // 6 births within 600 units in last 4 s:
            ...Array.from({ length: 6 }, (_, i) => ({
                kind: LAYOUT.effectKinds.BORN,
                tick: 500 + i,
                x: 800 + i * 10,
                y: 300,
                a: 100 + i,
                b: 2,
                c: 1,
                d: 0,
            })),
        ];

        const moments = findMoments({
            snapshot,
            effects,
            info: { ...INFO, ticksPerSecond: undefined },
            layout: LAYOUT,
            tick: 600,
        });
        const byKind = new Map(moments.map((m) => [m.kind + (m.score === 30 ? '-chance' : ''), m]));
        expect(byKind.get(MOMENT_KIND.PACK_KILL)?.score).toBe(90);
        expect(byKind.get(MOMENT_KIND.KILL)?.score).toBe(80);
        expect(byKind.get(`${MOMENT_KIND.KILL}-chance`)?.score).toBe(30);
        expect(byKind.get(`${MOMENT_KIND.KILL}-chance`)?.score).toBeLessThan(MOMENT_THRESHOLD);
        expect(byKind.get(MOMENT_KIND.ESCAPE)).toMatchObject({ score: 65, x: 555, y: 666 });
        expect(byKind.get(MOMENT_KIND.SMOKE_ESCAPE)).toMatchObject({ score: 85, x: 30, y: 40 });
        expect(byKind.get(MOMENT_KIND.SMOKE_SCREEN)).toMatchObject({ score: 55, x: 70, y: 80 });
        expect(byKind.get(MOMENT_KIND.ALARM_CHORUS)).toMatchObject({ score: 65, x: 460, y: 400, count: 3 });
        expect(byKind.get(MOMENT_KIND.BIRTH_CLUSTER)).toMatchObject({ score: 55, x: 825, y: 300, count: 6 });
    });
});

describe('findMoments: ticker and repeat penalty', () => {
    it('detects family-lead, extinct, last-stand and first milestones and applies the repeat penalty', () => {
        const snapshot = [
            { genomeId: 1, lineageId: 7, spec: 1, x: 200, y: 300, angle: 0, size: 10, speed: 1, flags: 0 },
            { genomeId: 2, lineageId: 7, spec: 1, x: 400, y: 500, angle: 0, size: 10, speed: 1, flags: 0 },
        ];
        const ticker = [
            { tick: 580, kind: 'new-leader', lineageId: 7 },
            { tick: 580, kind: 'new-leader', lineageId: 99 },
            { tick: 590, kind: 'extinct', lineageId: 8, x: 120, y: 240 },
            { tick: 590, kind: 'last-stand', lineageId: 9, x: 340, y: 480 },
            { tick: 595, kind: 'first-pack-kill', x: 500, y: 600 },
            { tick: 595, kind: 'elder' },
        ];
        const moments = findMoments({
            snapshot,
            ticker,
            info: INFO,
            layout: LAYOUT,
            tick: 600,
            lastShownS: { [MOMENT_KIND.FIRST]: 5 },
        });
        const extinct = moments.find((m) => m.kind === MOMENT_KIND.EXTINCT);
        const lastStand = moments.find((m) => m.kind === MOMENT_KIND.LAST_STAND);
        const first = moments.find((m) => m.kind === MOMENT_KIND.FIRST);
        const leads = moments.filter((m) => m.kind === MOMENT_KIND.FAMILY_LEAD);
        expect(extinct).toMatchObject({ score: 75, x: 120, y: 240, lineageId: 8 });
        expect(lastStand).toMatchObject({ score: 70, x: 340, y: 480, lineageId: 9 });
        expect(first).toMatchObject({ score: 90 * 0.6, x: 500, y: 600, tickerKind: 'first-pack-kill' });
        expect(leads).toHaveLength(2);
        expect(leads[0]).toMatchObject({ score: 60, x: 300, y: 400, lineageId: 7 });
        expect(leads[1]).toMatchObject({ score: 60, x: 1000, y: 500, lineageId: 99 });
    });
});
