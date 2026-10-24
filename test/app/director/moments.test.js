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
    it('detects a gap-closing chase inside the jaw arc and rejects pairs that fail any chase rule', () => {
        const earlier = [
            { genomeId: 1, lineageId: 1, spec: 0, x: 100, y: 100, angle: 0, size: 14, speed: 2.2, flags: 1 << 16 },
            { genomeId: 2, lineageId: 2, spec: 1, x: 400, y: 100, angle: 0, size: 10, speed: 2.2, flags: 0 },
            // Non-closing prey (gap stays 300):
            { genomeId: 3, lineageId: 2, spec: 1, x: 400, y: 120, angle: 0, size: 10, speed: 1, flags: 0 },
        ];
        const current = makeRawSnapshot([
            // Hunter 1 now at x=200, prey 2 at x=400 (distance shrank from 300 to 200 <= 240):
            { genomeId: 1, lineageId: 1, spec: 0, x: 200, y: 100, angle: 0, size: 14, speed: 2.2, flags: 1 << 16 },
            { genomeId: 2, lineageId: 2, spec: 1, x: 400, y: 100, angle: 0, size: 10, speed: 2.2, flags: 0 },
            // Prey 3 at x=500 (distance 300, did not shrink by 20%):
            { genomeId: 3, lineageId: 2, spec: 1, x: 500, y: 120, angle: 0, size: 10, speed: 1, flags: 0 },
            // Prey 4 heading towards hunter (angle PI, opposite to bearing 0):
            { genomeId: 4, lineageId: 2, spec: 1, x: 300, y: 100, angle: Math.PI, size: 10, speed: 1, flags: 0 },
            // Prey 5 too far (> 400):
            { genomeId: 5, lineageId: 2, spec: 1, x: 700, y: 100, angle: 0, size: 10, speed: 1, flags: 0 },
            // Hunter without hunting flag:
            { genomeId: 6, lineageId: 1, spec: 0, x: 200, y: 100, angle: 0, size: 14, speed: 2.2, flags: 0 },
            // Hunter missing from earlierSnapshot:
            { genomeId: 7, lineageId: 1, spec: 0, x: 200, y: 100, angle: 0, size: 14, speed: 2.2, flags: 1 << 16 },
        ]);
        const earlierWithExtras = [
            ...earlier,
            { genomeId: 4, lineageId: 2, spec: 1, x: 500, y: 100, angle: Math.PI, size: 10, speed: 1, flags: 0 },
            { genomeId: 5, lineageId: 2, spec: 1, x: 900, y: 100, angle: 0, size: 10, speed: 1, flags: 0 },
        ];
        const moments = findMoments({
            snapshot: current,
            earlierSnapshot: earlierWithExtras,
            info: INFO,
            layout: { ...LAYOUT, flags: {} },
            tick: 600,
        });
        expect(moments).toHaveLength(1);
        expect(moments[0]).toMatchObject({
            kind: MOMENT_KIND.CHASE,
            x: 300,
            y: 100,
            hunterId: 1,
            preyId: 2,
            hunterSpec: 'predator',
            preySpec: 'forager',
        });
        expect(moments[0].score).toBeCloseTo(95);
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
