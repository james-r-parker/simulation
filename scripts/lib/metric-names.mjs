// Reading metric names out of text: the `eval.<name>` names inside the string literals of source files and the
// `**Targets:**` lines of design docs, and whether the registry knows a name (docs/designs/metric-trust.md, Every new
// metric is registered).
import { METRICS } from '../../js/evo/metric-registry/index.js';

/**
 * Names that are not report metrics, or are not yet: each with the reason it is let through. A name here that the
 * registry now holds is reported as stale, so the list shrinks as the metrics are built.
 * @type {Readonly<Record<string, string>>}
 */
export const LET_THROUGH = Object.freeze({
    'eval.population': 'an OpenTelemetry instrument of scripts/eval.mjs (checkpoint population), not a report metric',
    'eval.births': 'an OpenTelemetry instrument of scripts/eval.mjs (checkpoint births), not a report metric',
    'eval.deaths': 'an OpenTelemetry instrument of scripts/eval.mjs (checkpoint deaths), not a report metric',
    'eval.a': 'a made-up metric of test/evo/report.test.js',
    'eval.b': 'a made-up metric of test/evo/report.test.js',
    'eval.x': 'a made-up metric of a table-rule test',
    'eval.nope': 'a made-up metric of test/eval-compare.test.js: an unknown name',
    'eval.not_a_metric': 'the made-up name tests use to prove a check fails',
    'eval.nothing': 'the made-up name tests use to prove a check fails',
    'eval.p90_fitness.all': 'a fitness-prefix name that compare.test.js uses; compare reads any name under the prefix',
    'eval.mean_fitness.all': 'a fitness-prefix name that compare.test.js uses; compare reads any name under the prefix',
    'eval.winter_activity_ratio': 'planned: docs/designs/seasonal-movement.md T18 adds it with its registry entry',
});

/** An `eval.` name that begins a string or follows a comma, a space, `(` or `|`; and what ends it. */
const NAME = /(?:^|[\s,(|])(eval\.[A-Za-z0-9_.-]*)(\$\{)?/g;

/** A name in a `**Targets:**` line. */
const TARGET = /eval\.[A-Za-z0-9_.*<>|-]+/g;

/**
 * @typedef {object} NameUse
 * @property {number} line the 1-based line
 * @property {string} name the name, or the part of it before an interpolation, a `*` or a `<placeholder>`
 * @property {boolean} prefix whether `name` is only the start of a name
 */

/**
 * @param {string} text JavaScript source
 * @param {number} from the index of a `//` or a `/*`
 * @returns {number} the index after the comment: past the end of line, or past the closing `*` and `/`
 */
function afterComment(text, from) {
    if (text[from + 1] === '/') {
        const end = text.indexOf('\n', from);
        return end === -1 ? text.length : end;
    }
    const end = text.indexOf('*/', from + 2);
    return end === -1 ? text.length : end + 2;
}

/**
 * @param {string} text JavaScript source
 * @param {number} from the index of an opening quote or backtick
 * @returns {number} the index of the closing one; a quote that is not a backtick also ends at a line break
 */
function closingQuote(text, from) {
    const quote = text[from];
    let j = from + 1;
    while (j < text.length && text[j] !== quote && !(quote !== '`' && text[j] === '\n')) {
        j += text[j] === '\\' ? 2 : 1;
    }
    return j;
}

/**
 * @param {string} text JavaScript source
 * @returns {{ text: string, line: number }[]} the contents of its string and template literals, with the line each starts
 *   on; comments are skipped, and `${...}` inside a template stays in its text
 */
export function stringLiterals(text) {
    /** @type {{ text: string, line: number }[]} */
    const literals = [];
    let line = 1;
    let i = 0;
    while (i < text.length) {
        const c = text[i];
        const comment = c === '/' && (text[i + 1] === '/' || text[i + 1] === '*');
        const quoted = c === "'" || c === '"' || c === '`';
        const stop = comment ? afterComment(text, i) : quoted ? closingQuote(text, i) + 1 : i + 1;
        if (quoted) {
            literals.push({ text: text.slice(i + 1, stop - 1), line });
        }
        line += text.slice(i, stop).split('\n').length - 1;
        i = stop;
    }
    return literals;
}

/**
 * @param {string} text JavaScript source, or JSON
 * @returns {NameUse[]} every `eval.<name>` in a string literal; a name that goes on after `${` is a prefix; `eval.` alone
 *   (`eval.${name}`) names nothing and is left out
 */
export function literalUses(text) {
    /** @type {NameUse[]} */
    const uses = [];
    for (const literal of stringLiterals(text)) {
        for (const match of literal.text.matchAll(NAME)) {
            const name = match[1].replace(/[.-]+$/, (tail) => (match[2] === undefined ? '' : tail));
            if (match[1] !== 'eval.') {
                uses.push({ line: literal.line, name, prefix: match[2] !== undefined });
            }
        }
    }
    return uses;
}

/**
 * @param {string} text a design doc
 * @returns {NameUse[]} the `eval.` names on the `**Targets:**` lines of the phases not marked `(built)`; a `*` or
 *   `<placeholder>` ends a name as a prefix
 */
export function targetUses(text) {
    /** @type {NameUse[]} */
    const uses = [];
    const lines = text.split('\n');
    let built = false;
    for (let i = 0; i < lines.length; i++) {
        if (/^#{2,4} /.test(lines[i])) {
            built = /\(built\)/.test(lines[i]);
        }
        if (built || !lines[i].startsWith('**Targets:**')) {
            continue;
        }
        for (const match of lines[i].matchAll(TARGET)) {
            const cut = match[0].search(/[*<|]/);
            const name = (cut === -1 ? match[0] : match[0].slice(0, cut)).replace(/[.,;:)-]+$/, cut === -1 ? '' : '.');
            uses.push({ line: i + 1, name, prefix: cut !== -1 });
        }
    }
    return uses;
}

/**
 * @param {Pick<NameUse, 'name' | 'prefix'>} use a name or a prefix from a file
 * @param {Readonly<Record<string, { renamedFrom: readonly string[] }>>} [metrics] the registry
 * @returns {boolean} whether the registry knows it: an exact name, an old name in a `renamedFrom`, the base of a family
 *   (`eval.reward_events_per_1k`, the first argument of `metricName`), or (for a prefix) the start of some name or old name
 */
export function isRegistered({ name, prefix }, metrics = METRICS) {
    const known = Object.entries(metrics).flatMap(([current, entry]) => [current, ...entry.renamedFrom]);
    return prefix ? known.some((n) => n.startsWith(name)) : known.some((n) => n === name || n.startsWith(`${name}.`));
}

/**
 * @param {{metrics: Record<string, unknown>}} report an eval report
 * @param {Readonly<Record<string, unknown>>} [metrics] the registry
 * @returns {string[]} the report's `eval.*` metric names that have no registry entry, sorted
 */
export function unregisteredReportNames(report, metrics = METRICS) {
    return Object.keys(report.metrics)
        .filter((name) => name.startsWith('eval.') && !Object.hasOwn(metrics, name))
        .sort();
}
