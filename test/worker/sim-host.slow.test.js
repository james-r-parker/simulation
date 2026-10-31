import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getPolicy, LIVE_POLICY } from '../../js/evo/policies/index.js';
import { createHarness, SMALL_CONFIG } from './helpers/host-harness.js';
import { driveGolden, effectStreamHash } from './helpers/golden-drive.js';
import { scaleTimeout } from '../../scripts/lib/test-timeout.mjs';

const { cases } = JSON.parse(readFileSync(new URL('../sim/golden.json', import.meta.url), 'utf8'));
const byName = Object.fromEntries(cases.map((/** @type {any} */ c) => [c.name, c]));
const TIMEOUT_MS = scaleTimeout(300_000);

/** The FNV hash of the busy golden world's effect stream (every effect record, in order). A self-pin. */
const BUSY_EFFECT_HASH = '53a1639c471d5e5e';
const BUSY_EFFECT_RECORDS = 1785;

describe('the golden world through the host', () => {
    it(
        'reaches the golden world hash for the default case with uneven slices, select, setLenses and a dry snapshot pool',
        () => {
            const { hash, harness } = driveGolden(byName.default, { keep: Infinity, slices: 11 });
            expect(hash).toBe(byName.default.worldHash);
            expect(harness.of('snapshot')).toHaveLength(3);
            expect(harness.of('log').some((m) => m.record.event === 'SnapshotSkipped')).toBe(true);
            expect(harness.of('error')).toHaveLength(0);
        },
        TIMEOUT_MS,
    );

    it(
        'reaches the golden world hash for the busy case and yields the pinned effect stream, whatever the slicing',
        () => {
            const a = driveGolden(byName.busy, { keep: 2, slices: 3 });
            const b = driveGolden(byName.busy, { keep: 1, slices: 29 });
            expect(a.hash).toBe(byName.busy.worldHash);
            expect(b.hash).toBe(byName.busy.worldHash);
            const effectsA = effectStreamHash(a.harness);
            const effectsB = effectStreamHash(b.harness);
            expect(effectsA.dropped).toBe(0);
            expect(effectsB).toEqual(effectsA);
            expect(effectsA).toEqual({ hash: BUSY_EFFECT_HASH, records: BUSY_EFFECT_RECORDS, dropped: 0 });
        },
        TIMEOUT_MS,
    );
});

describe('a long run of the live policy', () => {
    it(
        'keeps every log and queue at a constant capacity over 20000 ticks',
        () => {
            const createPolicy = (/** @type {any} */ options) => getPolicy(LIVE_POLICY).create(options);
            const h = createHarness({ keep: 2, createPolicy });
            h.send({
                type: 'init',
                seed: 4,
                config: { ...SMALL_CONFIG, maturityTicks: 200, reproductionCooldown: 150 },
            });
            h.send({ type: 'setSpeed', ticksPerSecond: 960 });
            const sizes = () => {
                const { observer, effects, live, world } = h.run();
                return [
                    observer.deaths.capacity,
                    observer.series.capacity,
                    effects.u32.length,
                    live.pending.length <= 32 ? 0 : 1,
                    observer.slotOf.size <= world.config.maxAgents ? 0 : 1,
                ];
            };
            let warm = null;
            while (h.run().world.tick < 20000) {
                h.advance(20);
                if (warm === null && h.run().world.tick >= 5000) {
                    warm = sizes();
                }
            }
            expect(h.of('error')).toHaveLength(0);
            expect(sizes()).toEqual(warm);
            expect(h.run().observer.deathsDrained).toBeGreaterThan(100);
            expect(h.run().observer.deaths.capacity).toBeLessThanOrEqual(1024);
            expect(h.of('stats').length).toBeGreaterThan(50);
        },
        TIMEOUT_MS,
    );
});
