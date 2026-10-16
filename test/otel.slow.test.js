import { describe, expect, it } from 'vitest';
import { createMetrics } from '../scripts/lib/otel.mjs';

describe('createMetrics against an unreachable endpoint', () => {
    it('records and shuts down against an unreachable endpoint', async () => {
        const metrics = await createMetrics({ env: { OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:9' } });

        expect(metrics.enabled).toBe(true);
        metrics.record('sim.population', 10, { run: 'a' });
        metrics.record('sim.step_ms', 1.5, { phase: 'brain' });
        await expect(metrics.shutdown()).resolves.toBeUndefined();
    });
});
