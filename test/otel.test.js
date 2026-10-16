import { describe, expect, it, vi } from 'vitest';
import { createMetrics } from '../scripts/lib/otel.mjs';

describe('createMetrics', () => {
    it('is a no-op without an endpoint', async () => {
        const metrics = await createMetrics({ env: {} });

        expect(metrics.enabled).toBe(false);
        expect(() => metrics.record('sim.population', 3, { run: 'a' })).not.toThrow();
        await expect(metrics.shutdown()).resolves.toBeUndefined();
    });

    it('treats an empty endpoint as unset', async () => {
        const metrics = await createMetrics({ env: { OTEL_EXPORTER_OTLP_ENDPOINT: '' } });

        expect(metrics.enabled).toBe(false);
    });

    it('still resolves when the SDK shutdown rejects', async () => {
        vi.resetModules();
        vi.doMock('@opentelemetry/sdk-metrics', async (importOriginal) => {
            /** @type {typeof import('@opentelemetry/sdk-metrics')} */
            const real = await importOriginal();
            class FailingProvider extends real.MeterProvider {
                shutdown() {
                    return Promise.reject(new Error('collector gone'));
                }
            }
            return { ...real, MeterProvider: FailingProvider };
        });
        try {
            const { createMetrics: create } = await import('../scripts/lib/otel.mjs');
            const metrics = await create({ env: { OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:9' } });

            await expect(metrics.shutdown()).resolves.toBeUndefined();
        } finally {
            vi.doUnmock('@opentelemetry/sdk-metrics');
            vi.resetModules();
        }
    });
});
