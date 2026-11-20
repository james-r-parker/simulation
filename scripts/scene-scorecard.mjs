#!/usr/bin/env node
// Generates docs/scene-scorecard.md: for each scene of docs/principles.md (and each failure and goal the user flagged),
// the registry metrics tagged with it (the `scenes` field), each with its status, its baseline mean, its null share and
// the smallest change it detects at 64 seeds, and the scene's state (docs/designs/agent-workflow.md, Principles and the
// scene scorecard). The registry and the newest shared baseline report are the sources; never hand-edit the doc.
//
// Usage:
//   node scripts/scene-scorecard.mjs            # print the doc to stdout
//   node scripts/scene-scorecard.mjs --write    # (re)write docs/scene-scorecard.md
//   node scripts/scene-scorecard.mjs --check    # exit 1 if the committed doc differs from the sources
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { METRICS } from '../js/evo/metric-registry/index.js';
import { withCurrentNames } from '../js/evo/metric-registry/renames.js';
import { FAILURES, GOALS, PRINCIPLE_SCENES, SCENES } from '../js/evo/metric-registry/scenes.js';
import { metricStatus } from '../js/evo/metric-registry/status.js';
import { rulesHash } from '../js/sim/config.js';
import { BASELINE_DIR, BASELINE_PREFIX, readReport } from './lib/baseline-report.mjs';
import { renderTable } from './metrics-doc.mjs';

const DOC_PATH = fileURLToPath(new URL('../docs/scene-scorecard.md', import.meta.url));
const BASELINE_PATH = fileURLToPath(new URL(`../${BASELINE_DIR}/`, import.meta.url));

/** What the user flagged (docs/principles.md, v1): the label of each failure and goal. */
const FLAGGED = Object.freeze({
    N1: 'Agents spinning on the spot',
    N2: 'Every agent the same type',
    N3: 'Agents that never travel across the map',
    N4: 'No hunting',
    N5: 'No evolution: bad agents living too long',
    G1: 'Many different gene pools: small families fighting to survive',
    G2: 'Families and groups working together',
    G3: 'Hunting in packs',
    G4: 'Natural-world behaviour: foraging trips, fleeing, seasonal movement, rest',
});

/** A detector with this share of null seeds or more counts as not seen. */
const NULL_LIMIT = 0.5;

/**
 * @param {string} dir the directory of the shared reports
 * @returns {string | null} the path of the floor-on baseline with the highest experiment id (`-E<n>`), else the last by
 *   name; the name, not the modification time, so a fresh checkout picks the same file as the author did
 */
export function newestBaselineByName(dir = BASELINE_PATH) {
    const id = (/** @type {string} */ name) => Number(name.match(/-E(\d+)\.json$/)?.[1] ?? -1);
    const names = readdirSync(dir).filter((name) => name.startsWith(BASELINE_PREFIX) && name.endsWith('.json'));
    names.sort((a, b) => id(a) - id(b) || (a < b ? -1 : 1));
    return names.length === 0 ? null : `${dir}${names[names.length - 1]}`;
}

/**
 * @param {number} value a number
 * @returns {string} the value to four significant figures
 */
const num = (value) => String(Number(value.toPrecision(4)));

/**
 * @param {readonly (number | null)[]} values a metric's per-seed values
 * @returns {{ mean: number | null, nullShare: number, seen: boolean }} the mean of the non-null values, the share of null
 *   seeds, and whether the detector read anything: under half the seeds null and a mean other than 0
 */
export function reading(values) {
    const live = /** @type {number[]} */ (values.filter((v) => v !== null));
    const nullShare = values.length === 0 ? 1 : (values.length - live.length) / values.length;
    const mean = live.length === 0 ? null : live.reduce((a, b) => a + b, 0) / live.length;
    return { mean, nullShare, seen: nullShare < NULL_LIMIT && live.some((v) => v !== 0) };
}

/**
 * @param {import('../js/evo/metric-registry/entry.js').MetricEntry} entry a registry entry
 * @returns {string} its detectable change at 64 seeds: absolute for a share, a percentage of the mean otherwise
 */
function mde64(entry) {
    const value = entry.power?.mde64;
    if (value === undefined || entry.power === null) {
        return '-';
    }
    if (value === null) {
        return 'none';
    }
    return entry.unit === 'share' ? `${num(value)} abs` : `${(value * 100).toFixed(0)}%`;
}

/**
 * @typedef {object} Detector one metric tagged with a scene
 * @property {string} name the metric
 * @property {string} status `verified`, `unverified` or `deprecated`
 * @property {string[]} cells the mean, the null share and the detectable change at 64 seeds, ready for a table
 * @property {boolean} seen whether it read anything on the baseline
 */

/**
 * @param {Readonly<Record<string, import('../js/evo/metric-registry/entry.js').MetricEntry>>} metrics the registry
 * @param {Record<string, any>} report a report with current metric names
 * @returns {Map<string, Detector[]>} each scene name to the detectors tagged with it, in metric-name order
 * @throws {Error} `unknown scene <name>` when an entry is tagged outside `SCENES`
 */
export function detectorsByScene(metrics, report) {
    /** @type {Map<string, Detector[]>} */
    const byScene = new Map(SCENES.map((scene) => [scene, []]));
    for (const name of Object.keys(metrics).sort()) {
        const entry = metrics[name];
        const read = reading(report.metrics[name]?.values ?? []);
        for (const scene of entry.scenes ?? []) {
            const list = byScene.get(scene);
            if (list === undefined) {
                throw new Error(`unknown scene ${scene} on ${name}`);
            }
            const cells = [read.mean === null ? '-' : num(read.mean), num(read.nullShare), mde64(entry)];
            list.push({ name, status: metricStatus(entry), cells, seen: read.seen });
        }
    }
    return byScene;
}

/**
 * @param {Detector[]} detectors the detectors tagged with one scene
 * @returns {'absent' | 'present' | 'no verified detector'} `no verified detector` when none is verified; else `absent`
 *   when every verified detector is null on at least half the seeds or reads 0, else `present`
 */
export function sceneState(detectors) {
    const verified = detectors.filter((d) => d.status === 'verified');
    if (verified.length === 0) {
        return 'no verified detector';
    }
    return verified.some((d) => d.seen) ? 'present' : 'absent';
}

/**
 * @param {readonly string[]} names the scenes of one table
 * @param {Map<string, Detector[]>} byScene the detectors of every scene
 * @param {Readonly<Record<string, string>>} [labels] a label per name, for the flagged failures and goals
 * @returns {string[]} the state table, then the detector table
 */
function tables(names, byScene, labels) {
    const head = labels ? ['Id', 'Flagged'] : ['Scene'];
    const lead = (/** @type {string} */ name) => (labels ? [name, labels[name]] : [name]);
    const states = names.map((name) => [...lead(name), sceneState(byScene.get(name) ?? [])]);
    const rows = names.flatMap((name) => {
        const list = byScene.get(name) ?? [];
        return list.length === 0
            ? [[...lead(name), 'none', '-', '-', '-', '-']]
            : list.map((d) => [...lead(name), `\`${d.name}\``, d.status, ...d.cells]);
    });
    return [
        ...renderTable([[...head, 'State'], ...states]),
        '',
        ...renderTable([[...head, 'Detector', 'Status', 'Mean', 'Null', 'MDE 64'], ...rows]),
    ];
}

/**
 * @param {Readonly<Record<string, import('../js/evo/metric-registry/entry.js').MetricEntry>>} metrics the registry
 * @param {Record<string, any>} report the baseline report
 * @param {string} reportPath the repo path of the report
 * @returns {string} the Markdown of docs/scene-scorecard.md
 */
export function renderScorecard(metrics, report, reportPath) {
    const byScene = detectorsByScene(metrics, withCurrentNames(report, metrics));
    const experiment = reportPath.match(/-(E\d+)\.json$/)?.[1] ?? 'none';
    const out = [
        '# Scene scorecard',
        '',
        `**Status:** Reference - which registry metrics detect each scene, read on the shared baseline \`${reportPath}\` (experiment ${experiment}, rulesHash \`${rulesHash(report.config)}\`, ${report.seeds.length} seeds x ${report.ticks} ticks).`,
        '',
        'Generated by `node scripts/scene-scorecard.mjs --write` from the `scenes` field of `js/evo/metric-registry/` and the newest',
        '`evals/power/defaults-floor-on-*.json` - **do not hand-edit.** Tag a metric in its registry entry, then re-run. The scenes are in',
        '[principles.md](principles.md); the metric definitions are in [metrics.md](designs/metrics.md).',
        '',
        '- **State** reads the `verified` detectors only: `absent` when every one is null on at least half the seeds or reads 0, `present`',
        '  when one reads something, `no verified detector` when none is verified (the clip shows the scene, and a PR says so).',
        '- **Mean** and **Null** are over the baseline seeds (Null is the share of seeds with no value). **MDE 64** is the smallest change',
        '  a verdict detects at 64 seeds per arm: a percentage of the mean, or `abs` for a share; `-` before it is measured.',
        '- The selection rules have their own detectors (`eval.birth_source_share.<cause>`, `eval.skill_heritability`,',
        '  `eval.niche_replacement`, `eval.social_return`, `eval.mate_rank_gap`, `eval.mate_hunter_lean`); they are not scenes.',
        '',
        '## Scenes',
        '',
        ...tables(PRINCIPLE_SCENES, byScene),
        '',
        '## What the user flagged',
        '',
        'The failures (N) and goals (G) the user listed, each with the metrics that read it.',
        '',
        ...tables([...FAILURES, ...GOALS], byScene, FLAGGED),
    ];
    return `${out.join('\n')}\n`;
}

/**
 * @param {string[]} args the flags: `--check` or `--write`, else the doc is printed
 * @param {string} markdown the rendered doc
 * @param {string} path where the committed doc lives
 * @returns {number} the exit code
 */
function finish(args, markdown, path) {
    if (args.includes('--check')) {
        const current = existsSync(path) ? readFileSync(path, 'utf8') : '';
        if (current !== markdown) {
            process.stderr.write('docs/scene-scorecard.md is stale. Run: node scripts/scene-scorecard.mjs --write\n');
            return 1;
        }
        process.stdout.write('docs/scene-scorecard.md is up to date.\n');
        return 0;
    }
    if (args.includes('--write')) {
        writeFileSync(path, markdown);
        process.stdout.write('Wrote docs/scene-scorecard.md\n');
        return 0;
    }
    process.stdout.write(markdown);
    return 0;
}

/**
 * @param {string[]} args the command-line arguments
 * @param {{ path?: string, metrics?: Readonly<Record<string, import('../js/evo/metric-registry/entry.js').MetricEntry>>,
 *   reportPath?: string | null }} [options] the doc's path, the registry and the report's path (default: the newest baseline)
 * @returns {number} the exit code
 */
export function main(args, { path = DOC_PATH, metrics = METRICS, reportPath = newestBaselineByName() } = {}) {
    const stray = args.find((arg) => !['--write', '--check'].includes(arg));
    if (stray !== undefined) {
        process.stderr.write(`unknown argument: ${stray} (expected --write or --check)\n`);
        return 2;
    }
    if (reportPath === null) {
        process.stderr.write('no shared baseline report under evals/power/\n');
        return 1;
    }
    const shown = reportPath.startsWith(BASELINE_PATH)
        ? `${BASELINE_DIR}/${reportPath.slice(BASELINE_PATH.length)}`
        : reportPath;
    return finish(args, renderScorecard(metrics, readReport(reportPath), shown), path);
}

/* v8 ignore start -- thin CLI; main is tested */
if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
    process.exitCode = main(process.argv.slice(2));
}
/* v8 ignore stop */
