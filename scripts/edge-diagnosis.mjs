// Prints the low-density-edge diagnosis of one eval report (docs/designs/low-density-edge.md, Phase 2, T10):
// `node scripts/edge-diagnosis.mjs evals/decisions/E155/defaults-floor-on.json [--json] [--probes=a.json,b.json]`.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
    SEASON_NAMES,
    flowTable,
    median,
    ratioReading,
    sumFunnels,
    swapShares,
    traceReading,
} from './lib/edge-diagnosis.mjs';

/** The edge ratio the E-LD-1 prediction compares with. */
const RATIO_BAR = 0.6;

/** @param {number} x @returns {string} a share as a rounded decimal */
const f = (x) => (Number.isNaN(x) ? '-' : x.toFixed(3));

/**
 * @param {Record<string, any>} report an eval report with the edge detectors and traces
 * @returns {Record<string, any>} every reading the diagnosis reports
 */
export function diagnose(report) {
    const trace = traceReading(report);
    const { episodes: eps, ...rest } = trace;
    const closed = eps.filter((e) => !e.censored);
    return {
        ratio: ratioReading(report, RATIO_BAR),
        swaps: swapShares(report),
        trace: rest,
        episodes: {
            count: eps.length,
            medianLength: median(eps.map((e) => e.length)),
            censored: eps.filter((e) => e.censored).length,
            longShare: eps.filter((e) => e.length >= 10).length / (eps.length || 1),
            floorShare: eps.filter((e) => e.minPop <= report.config.floorTrigger).length / (eps.length || 1),
            fromBoom: eps.filter((e) => e.peak > 400).length / (eps.length || 1),
            medianDescentSamples: median(eps.map((e) => e.descentSamples)),
            medianBandSamples: median(eps.map((e) => e.bandSamples)),
            medianClosedLength: median(closed.map((e) => e.length)),
            entrySeasons: SEASON_NAMES.map((s, i) => [s, eps.filter((e) => e.enterSeason === i).length]),
            peakSeasons: SEASON_NAMES.map((s, i) => [s, eps.filter((e) => e.peakSeason === i).length]),
        },
    };
}

/**
 * @param {Record<string, any>} report the eval report
 * @param {Record<string, any>[]} probes the probes of `scripts/edge-probe.mjs`
 * @returns {Record<string, any>} the band flows and the funnel read from the probes
 */
export function readProbes(report, probes) {
    const rows = /** @type {any[]} */ (probes);
    return {
        seeds: probes.length,
        flows: flowTable(rows, report.config.eraSeasonTicks),
        edgeFunnel: sumFunnels(rows.map((p) => p.funnel)),
        bandFunnel: sumFunnels(rows.map((p) => p.bandFunnel)),
    };
}

/**
 * @param {string} title what the funnel covers
 * @param {import('./lib/edge-funnel.mjs').Funnel} funnel the summed funnel
 * @returns {string[]} the funnel as a table: a class by seen, unseen and the four seasons
 */
function renderFunnel(title, funnel) {
    const total = (/** @type {Record<string, number>} */ side) => Object.values(side).reduce((a, b) => a + b, 0);
    const lines = [
        `${title} (${funnel.samples} checkpoints; mature prey females by first failing class)`,
        '| class | seen | unseen | spring | summer | autumn | winter |',
        '| --- | --- | --- | --- | --- | --- | --- |',
    ];
    for (const cls of Object.keys(funnel.seen)) {
        lines.push(
            `| ${cls} | ${funnel.seen[cls]} | ${funnel.unseen[cls]} | ${funnel.seasons.map((s) => s[cls]).join(' | ')} |`,
        );
    }
    lines.push(
        `| total | ${total(funnel.seen)} | ${total(funnel.unseen)} | ${funnel.seasons.map(total).join(' | ')} |`,
    );
    return lines;
}

/** @param {Record<string, any>} p the probe reading @returns {string[]} its text lines */
function renderProbes(p) {
    const lines = [
        `probes: ${p.seeds} seeds replayed`,
        '| interval start | season | intervals | mate | split | births | deaths | starved | eaten |',
        '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ];
    for (const band of ['edge', 'band', 'high']) {
        for (const season of ['all', ...SEASON_NAMES]) {
            const c = p.flows[`${band}/${season}`];
            if (c) {
                lines.push(
                    `| ${band} | ${season} | ${c.n} | ${f(c.mate)} | ${f(c.split)} | ${f(c.mate + c.split)} | ${f(c.deaths)} | ${f(c.starved)} | ${f(c.eaten)} |`,
                );
            }
        }
    }
    return [
        ...lines,
        ...renderFunnel('funnel at the edge', p.edgeFunnel),
        ...renderFunnel('funnel at 100 to 400 prey', p.bandFunnel),
    ];
}

/** @param {Record<string, any>} d the diagnosis @returns {string} a text report */
export function render(d) {
    const { ratio, swaps, trace, episodes: ep } = d;
    const lines = [
        `edge ratio: ${ratio.seeds} seeds with an edge span (${ratio.nulls} without), median ${f(ratio.median)}, mean ${f(ratio.mean)}, under ${RATIO_BAR} on ${ratio.under}, at or over on ${ratio.over}`,
        `swaps: ${swaps.seeds} seeds with every rate, ${swaps.positive} with a positive deficit (median ${f(swaps.medianDeficit)} per prey per 1000 ticks)`,
        '| swap | median share | pooled share |',
        '| --- | --- | --- |',
        ...Object.keys(swaps.median).map((k) => `| ${k} | ${f(swaps.median[k])} | ${f(swaps.pooled[k])} |`),
        `time under ${100} prey after burn-in: ${trace.everUnder} of ${trace.seeds} seeds ever, ${trace.atLeastHalf} for at least half the samples, median share ${f(trace.median)}, ${trace.endUnder} end under; median lowest population ${trace.lowestPop}; ${trace.floorSeeds} seeds reach the floor trigger`,
        `episodes: ${ep.count} (${ep.censored} last to the end), median length ${ep.medianLength} samples (closed ${ep.medianClosedLength}), ${f(ep.longShare)} last 10 or more, ${f(ep.floorShare)} reach the floor trigger, ${f(ep.fromBoom)} fall from over 400 prey`,
        `descent: median ${ep.medianDescentSamples} samples from peak to entry, ${ep.medianBandSamples} of them at 100 to 400 prey`,
        `entry by season: ${ep.entrySeasons.map((/** @type {[string, number]} */ [s, n]) => `${s} ${n}`).join(', ')}; peak by season: ${ep.peakSeasons.map((/** @type {[string, number]} */ [s, n]) => `${s} ${n}`).join(', ')}`,
        '| interval start | season | intervals | losing | mean change |',
        '| --- | --- | --- | --- | --- |',
    ];
    for (const band of ['edge', 'band', 'high']) {
        for (const season of ['all', ...SEASON_NAMES]) {
            const c = trace.intervals[`${band}/${season}`];
            if (c) {
                lines.push(`| ${band} | ${season} | ${c.n} | ${f(c.fall / c.n)} | ${f(c.meanChange)} |`);
            }
        }
    }
    return [...lines, ...(d.probes ? renderProbes(d.probes) : [])].join('\n');
}

/* v8 ignore start -- thin CLI; diagnose, readProbes and render are tested */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const [path, ...flags] = process.argv.slice(2).filter((a) => !a.startsWith('--probes='));
    const probePaths =
        process.argv
            .slice(2)
            .find((a) => a.startsWith('--probes='))
            ?.slice(9)
            .split(',') ?? [];
    if (!path) {
        console.error('usage: node scripts/edge-diagnosis.mjs <report.json> [--json]');
        process.exit(2);
    }
    const report = JSON.parse(readFileSync(path, 'utf8'));
    const d = diagnose(report);
    if (probePaths.length > 0) {
        d.probes = readProbes(
            report,
            probePaths.map((p) => JSON.parse(readFileSync(p, 'utf8'))),
        );
    }
    console.log(flags.includes('--json') ? JSON.stringify(d, null, 2) : render(d));
}
/* v8 ignore stop */
