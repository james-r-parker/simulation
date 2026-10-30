import { describe, expect, it } from 'vitest';
import { BURN_IN_TICKS } from '../../js/evo/burn-in.js';
import { logMemorySummary, memorySummaryFields } from '../../js/evo/memory-summary.js';
import { createSimLog } from '../../js/sim/log.js';
import { addBlob } from '../sim/helpers/life-world.js';
import { observed } from './helpers/observer-world.js';

describe('MemorySummary', () => {
    it('carries the tick and each running figure, null where its metric is', () => {
        const { observer } = observed();
        const fields = memorySummaryFields(observer, 12000);
        expect(Object.keys(fields)).toEqual([
            'tick',
            'leakRateMean',
            'leakSlowShare',
            'leakAtFloorShare',
            'hiddenPersistence',
            'hebbDrift',
            'hebbDriftClampedShare',
            'weightClampShare',
            'sigmaMean',
        ]);
        expect(fields.tick).toBe(12000);
        expect(fields.leakRateMean).toBeNull();
    });

    it('logs at debug from burn-in, and is silent at info or before burn-in', () => {
        const { world, observer } = observed({ maxAgents: 8 });
        const slot = addBlob(world);
        observer.sampled = Int32Array.of(slot);
        world.tick = BURN_IN_TICKS;
        observer.memory.leakSum = 1;
        observer.memory.leakUnits = 2;
        /** @type {any[]} */
        const records = [];
        logMemorySummary(
            createSimLog((r) => records.push(r), { level: 'debug' }),
            observer,
            world,
        );
        expect(records).toHaveLength(1);
        expect(records[0]).toMatchObject({
            level: 'debug',
            event: 'MemorySummary',
            tick: BURN_IN_TICKS,
            leakRateMean: 0.5,
        });
        logMemorySummary(
            createSimLog((r) => records.push(r), { level: 'info' }),
            observer,
            world,
        );
        world.tick = BURN_IN_TICKS - 1000;
        logMemorySummary(
            createSimLog((r) => records.push(r), { level: 'debug' }),
            observer,
            world,
        );
        expect(records).toHaveLength(1);
    });
});
