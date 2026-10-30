// Formats memory-probe results as text lines and averages them over a set of genomes. Pure: no files.

/**
 * @param {number} value a score or gain
 * @returns {string} two decimals
 */
function fixed(value) {
    return value.toFixed(2);
}

/**
 * @param {number} value a gain
 * @returns {string} two decimals with an explicit sign
 */
function signed(value) {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
}

/**
 * @param {import('../../js/evo/memory-probe.js').ScenarioResult} result one scenario's result
 * @returns {string} one line: the scores per control, the gain and the reading
 */
function scenarioLine(result) {
    const name = result.scenario.padEnd(24);
    if (result.skipped !== null || result.gain === null) {
        return `  ${name} skipped: ${result.skipped}`;
    }
    const scores = Object.entries(result.scores)
        .map(([control, score]) => `${control} ${fixed(score)}`)
        .join('  ');
    return `  ${name} ${scores}  gain ${signed(result.gain)}  ${result.reading}`;
}

/**
 * @param {import('../../js/evo/memory-probe.js').GroupResult} group the group-hunt result
 * @returns {string} one line: the three kill shares, the coordination, the ratio and the per-hunter gain
 */
function groupLine(group) {
    const name = 'group-hunt'.padEnd(24);
    if (group.skipped !== null || group.coordination === null) {
        return `  ${name} skipped: ${group.skipped}`;
    }
    const scores = Object.entries(group.scores)
        .map(([control, score]) => `${control} ${fixed(score)}`)
        .join('  ');
    const ratio = group.ratio === null ? 'n/a' : fixed(group.ratio);
    const gain = group.gain === null ? 'n/a' : fixed(group.gain);
    return `  ${name} ${scores}  coordination ${signed(group.coordination)}  ratio ${ratio}  per-hunter gain ${gain}`;
}

/**
 * @param {string} title the subject's heading
 * @param {{scenarios: import('../../js/evo/memory-probe.js').ScenarioResult[], group: import('../../js/evo/memory-probe.js').GroupResult | null}} result
 *   the subject's results
 * @returns {string[]} the lines to print
 */
export function describeSubject(title, { scenarios, group }) {
    return [`${title}`, ...scenarios.map(scenarioLine), ...(group === null ? [] : [groupLine(group)])];
}

/**
 * The score of a set of genomes: the mean over the genomes that were probed, per metric.
 * @param {readonly {scenarios: import('../../js/evo/memory-probe.js').ScenarioResult[], group: import('../../js/evo/memory-probe.js').GroupResult | null}[]} results
 *   one result per genome
 * @returns {Record<string, number>} `probe.<metric>`, `probe.memory_gain.<scenario>`, `probe.group_coordination` and
 *   `probe.group_gain`, each the mean over the genomes that have it; a metric no genome has is left out
 */
export function setScores(results) {
    /** @type {Record<string, number[]>} */
    const values = {};
    const add = (/** @type {string} */ name, /** @type {number | null} */ value) => {
        if (value !== null) {
            (values[name] ??= []).push(value);
        }
    };
    for (const { scenarios, group } of results) {
        for (const result of scenarios) {
            const kept = result.scores.blindfold ?? result.scores.intact;
            add(result.metric, result.skipped === null ? kept : null);
            add(`probe.memory_gain.${result.scenario}`, result.gain);
        }
        add('probe.group_coordination', group?.coordination ?? null);
        add('probe.group_gain', group?.gain ?? null);
    }
    return Object.fromEntries(
        Object.entries(values).map(([name, list]) => [name, list.reduce((a, b) => a + b, 0) / list.length]),
    );
}
