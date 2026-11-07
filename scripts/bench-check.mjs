// bench-check: fails when the measured step time at 500 agents is over 15% above bench/baseline.json.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isBusy } from './lib/load-state.mjs';

const KEY = 'bench.step_ms@500';
/** Fraction above the baseline the measured step time may be. */
const TOLERANCE = 0.15;

/**
 * @param {number} baseline baseline step time in ms
 * @param {number} measured measured step time in ms
 * @returns {{ok: boolean, change: number, message: string}} the verdict; `change` is a fraction of the baseline
 */
export function compareStep(baseline, measured) {
    if (!(baseline > 0) || !Number.isFinite(measured)) {
        throw new Error(
            `bench-check needs a positive baseline and a finite measurement, got ${baseline} and ${measured}`,
        );
    }
    const change = measured / baseline - 1;
    const ok = change <= TOLERANCE;
    const pct = `${change >= 0 ? '+' : ''}${(change * 100).toFixed(1)}%`;
    return {
        ok,
        change,
        message: `${KEY}: baseline ${baseline} ms, measured ${measured} ms, change ${pct} (limit +${TOLERANCE * 100}%)`,
    };
}

/** Exit code for a failure the load makes inconclusive; check.sh reports it as skipped. */
export const EXIT_INCONCLUSIVE = 3;

/**
 * Load only slows a run, so a measurement inside the limit passes whatever the load. One over the limit fails on a quiet
 * machine and is inconclusive on a busy one (a load average read around the run above nproc / 8).
 * @param {number} baseline baseline step time in ms
 * @param {number} measured measured step time in ms
 * @param {{ loads?: number[], cores?: number }} [machine] load averages read around the run, and the thread count
 * @returns {{status: 'pass' | 'fail' | 'inconclusive', message: string}} the verdict
 */
export function judge(baseline, measured, { loads = [], cores = 1 } = {}) {
    const verdict = compareStep(baseline, measured);
    if (verdict.ok) {
        return { status: 'pass', message: verdict.message };
    }
    const peak = Math.max(0, ...loads);
    if (!isBusy(peak, cores)) {
        return { status: 'fail', message: verdict.message };
    }
    const note = `inconclusive: load avg ${peak} > ${cores / 8} (nproc/8); rerun with scripts/check.sh --only=bench-check`;
    return { status: 'inconclusive', message: `${verdict.message}\n${note}` };
}

/**
 * @param {string} baselinePath path to bench/baseline.json
 * @param {string} measuredPath path to a `bench --json` output
 * @param {{ loads?: number[], cores?: number }} [machine] see `judge`
 * @returns {number} the process exit code
 */
export function main(baselinePath, measuredPath, machine = {}) {
    const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'))[KEY];
    const measured = JSON.parse(readFileSync(measuredPath, 'utf8'))[KEY];
    const verdict = judge(baseline, measured, machine);
    console.log(verdict.message);
    return { pass: 0, fail: 1, inconclusive: EXIT_INCONCLUSIVE }[verdict.status];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const flag = (/** @type {string} */ name) =>
        process.argv.filter((arg) => arg.startsWith(`--${name}=`)).map((arg) => Number(arg.split('=')[1]));
    process.exit(main(process.argv[2], process.argv[3], { loads: flag('load'), cores: flag('cores')[0] ?? 1 }));
}
