// Mutation score per scope from a Stryker JSON report (mutation-testing-report-schema), and its ratchet rules.

/** Scopes the mutation ratchet tracks, as repo-relative path prefixes. */
const SCOPES = ['js/sim', 'js/evo'];
/** Points a score may fall below its baseline before the check fails. */
const TOLERANCE = 0.1;
/** Most surviving mutants listed in a failure digest. */
const MAX_SURVIVORS = 20;
/** Statuses that count as detected by a test. */
const DETECTED = new Set(['Killed', 'Timeout']);
/** Statuses that count as undetected: the mutant ran (or could have run) and no test failed. */
const UNDETECTED = new Set(['Survived', 'NoCoverage']);

/**
 * @typedef {{status: string, mutatorName: string, location: {start: {line: number}}}} Mutant
 * @typedef {{files: Record<string, {mutants: Mutant[]}>}} MutationReport
 * @typedef {{file: string, line: number, mutator: string}} Survivor
 */

/**
 * @param {string} file report file path
 * @returns {string | undefined} the scope that contains it
 */
function scopeOf(file) {
    const rel = file.split('\\').join('/');
    return SCOPES.find((s) => rel.startsWith(`${s}/`));
}

/**
 * Scores each scope with the standard Stryker definition: detected / (detected + undetected) * 100, where detected is
 * Killed + Timeout and undetected is Survived + NoCoverage. Ignored, CompileError and Runtime errors are left out.
 * A scope with no countable mutants is absent.
 * @param {MutationReport} report parsed reports/mutation/mutation.json
 * @returns {Record<string, number>} score in percent per scope
 */
export function scoreScopes(report) {
    /** @type {Record<string, {detected: number, undetected: number}>} */
    const sums = {};
    for (const [file, entry] of Object.entries(report.files ?? {})) {
        const scope = scopeOf(file);
        if (!scope) {
            continue;
        }
        sums[scope] ??= { detected: 0, undetected: 0 };
        for (const mutant of entry.mutants) {
            if (DETECTED.has(mutant.status)) {
                sums[scope].detected += 1;
            } else if (UNDETECTED.has(mutant.status)) {
                sums[scope].undetected += 1;
            }
        }
    }
    /** @type {Record<string, number>} */
    const scores = {};
    for (const [scope, { detected, undetected }] of Object.entries(sums)) {
        if (detected + undetected > 0) {
            scores[scope] = (detected / (detected + undetected)) * 100;
        }
    }
    return scores;
}

/**
 * Lists the first surviving mutants (Survived and NoCoverage) by file, line and mutator.
 * @param {MutationReport} report parsed reports/mutation/mutation.json
 * @returns {Survivor[]} at most 20 survivors, in report order
 */
export function listSurvivors(report) {
    /** @type {Survivor[]} */
    const survivors = [];
    for (const [file, entry] of Object.entries(report.files ?? {})) {
        for (const mutant of entry.mutants) {
            if (UNDETECTED.has(mutant.status) && survivors.length < MAX_SURVIVORS) {
                survivors.push({ file, line: mutant.location.start.line, mutator: mutant.mutatorName });
            }
        }
    }
    return survivors;
}

/**
 * Compares scores with the baseline.
 * @param {Record<string, number>} scores measured score per scope
 * @param {{mutation?: Record<string, number>}} baseline parsed quality-baseline.json
 * @param {Survivor[]} survivors surviving mutants to list after the failures
 * @returns {string[]} messages; empty when no scope dropped more than the tolerance
 */
export function compareMutation(scores, baseline, survivors) {
    const failures = [];
    for (const [scope, limit] of Object.entries(baseline.mutation ?? {})) {
        const value = scores[scope];
        if (value !== undefined && value < limit - TOLERANCE) {
            failures.push(
                `${scope} mutation score is below its baseline: baseline ${limit.toFixed(2)}%, measured ${value.toFixed(2)}%`,
            );
        }
    }
    if (failures.length > 0) {
        failures.push(...survivors.map((s) => `surviving mutant: ${s.file}:${s.line} ${s.mutator}`));
    }
    return failures;
}

/**
 * Raises each mutation baseline to the measured score (rounded down to 2 places); never lowers one.
 * @param {Record<string, number>} scores measured score per scope
 * @param {{mutation?: Record<string, number>}} baseline parsed quality-baseline.json
 * @returns {{mutation: Record<string, number>}} a new baseline object; other keys and their order are kept
 */
export function raiseMutation(scores, baseline) {
    const mutation = { ...baseline.mutation };
    for (const [scope, value] of Object.entries(scores)) {
        mutation[scope] = Math.max(mutation[scope] ?? 0, Math.floor(value * 100) / 100);
    }
    return { ...baseline, mutation };
}
