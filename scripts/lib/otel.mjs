// Optional OpenTelemetry metrics for the scripts: a no-op unless OTEL_EXPORTER_OTLP_ENDPOINT is set.

const HISTOGRAM_NAMES = new Set(['sim.step_ms']);
const EXPORT_INTERVAL_MS = 5000;
const EXPORT_TIMEOUT_MS = 2000;
const SHUTDOWN_TIMEOUT_MS = 3000;

/**
 * @typedef {object} Metrics
 * @property {boolean} enabled Whether metrics are exported.
 * @property {(name: string, value: number, attributes?: Record<string, string | number>) => void} record Records one value.
 * @property {() => Promise<void>} shutdown Flushes and stops the exporter.
 */

/** @type {Metrics} */
const NO_OP = {
    enabled: false,
    record() {},
    async shutdown() {},
};

/**
 * Creates the metrics recorder. Without `OTEL_EXPORTER_OTLP_ENDPOINT` nothing is imported and every call is a no-op.
 * `sim.step_ms` is a histogram; every other name is a gauge.
 * @param {object} [options] Options.
 * @param {string} [options.serviceName] The OpenTelemetry service name.
 * @param {Record<string, string | undefined>} [options.env] The environment to read the endpoint from.
 * @returns {Promise<Metrics>} The recorder.
 */
export async function createMetrics({ serviceName = 'blob-evolution', env = process.env } = {}) {
    const endpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT;
    if (!endpoint) {
        return NO_OP;
    }
    const [{ MeterProvider, PeriodicExportingMetricReader }, { OTLPMetricExporter }, { resourceFromAttributes }] =
        await Promise.all([
            import('@opentelemetry/sdk-metrics'),
            import('@opentelemetry/exporter-metrics-otlp-http'),
            import('@opentelemetry/resources'),
        ]);
    const exporter = new OTLPMetricExporter({
        url: `${endpoint.replace(/\/+$/, '')}/v1/metrics`,
        timeoutMillis: EXPORT_TIMEOUT_MS,
    });
    const reader = new PeriodicExportingMetricReader({
        exporter,
        exportIntervalMillis: EXPORT_INTERVAL_MS,
        exportTimeoutMillis: EXPORT_TIMEOUT_MS,
    });
    const provider = new MeterProvider({
        resource: resourceFromAttributes({ 'service.name': serviceName }),
        readers: [reader],
    });
    const meter = provider.getMeter(serviceName);
    const instruments = new Map();
    return {
        enabled: true,
        record(name, value, attributes = {}) {
            let instrument = instruments.get(name);
            if (!instrument) {
                instrument = HISTOGRAM_NAMES.has(name) ? meter.createHistogram(name) : meter.createGauge(name);
                instruments.set(name, instrument);
            }
            if (instrument.record) {
                instrument.record(value, attributes);
            }
        },
        async shutdown() {
            await shutdownWithin(provider, SHUTDOWN_TIMEOUT_MS);
        },
    };
}

/**
 * Shuts the provider down, giving up after a deadline so an unreachable collector cannot hang a script.
 * @param {{ shutdown: () => Promise<void> }} provider The meter provider.
 * @param {number} ms The deadline in milliseconds.
 * @returns {Promise<void>} Resolves when the provider is down or the deadline passes.
 */
async function shutdownWithin(provider, ms) {
    let timer;
    const deadline = new Promise((resolve) => {
        timer = setTimeout(resolve, ms);
    });
    try {
        await Promise.race([provider.shutdown().catch(() => {}), deadline]);
    } finally {
        clearTimeout(timer);
    }
}
