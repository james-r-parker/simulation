// bench-check: fails when the measured step time at 500 agents is over 15% above bench/baseline.json.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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

/**
 * @param {string} baselinePath path to bench/baseline.json
 * @param {string} measuredPath path to a `bench --json` output
 * @returns {number} the process exit code
 */
export function main(baselinePath, measuredPath) {
    const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'))[KEY];
    const measured = JSON.parse(readFileSync(measuredPath, 'utf8'))[KEY];
    const verdict = compareStep(baseline, measured);
    console.log(verdict.message);
    return verdict.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    process.exit(main(process.argv[2], process.argv[3]));
}
