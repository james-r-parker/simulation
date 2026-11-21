// The amplifier rows of `npm run role:budget` (docs/designs/status-effects.md T13): the rows read with effects on, beside the
// matrix and never part of it. Splits a row list into the gated rows and the amplifiers, reads the amplifiers, formats them.
import { AMPLIFIER_ROWS, budgetPack } from '../../js/evo/role-budget-pack.js';
import { cellText } from './role-budget-report.mjs';

/**
 * @param {readonly string[] | undefined} rows the rows asked for, undefined for the default run
 * @param {readonly string[]} built the rows of the gate (the default run reads all of them)
 * @returns {{gate: readonly string[], amplifiers: readonly string[]}} the gated rows, and the amplifier rows: a default run
 *   reads every amplifier beside the gate, a run with `--rows` only those named
 */
export function splitRows(rows, built) {
    if (rows === undefined) {
        return { gate: built, amplifiers: AMPLIFIER_ROWS };
    }
    return {
        gate: rows.filter((name) => !AMPLIFIER_ROWS.includes(name)),
        amplifiers: rows.filter((name) => AMPLIFIER_ROWS.includes(name)),
    };
}

/**
 * @param {Readonly<Record<string, any>>} config the validated config
 * @param {import('../../js/evo/role-budget-model.js').RoleModel} model the model options
 * @param {readonly string[]} names the amplifier rows to read
 * @returns {{text: string, data: Record<string, import('../../js/evo/role-budget-pack.js').PackBudget>} | null} the report
 *   of the amplifiers and their budgets, null when none was asked for
 */
export function readAmplifiers(config, model, names) {
    if (names.length === 0) {
        return null;
    }
    const data = Object.fromEntries(names.map((name) => [name, budgetPack(config, model)]));
    const rows = Object.entries(data).map(([name, pack]) => packLines(name, pack, config));
    const head = 'amplifiers: read with the effects on, beside the gate and never part of it';
    return { text: [head, ...rows.flat()].join('\n'), data };
}

/**
 * @param {string} name the row's name
 * @param {import('../../js/evo/role-budget-pack.js').PackBudget} pack the pack's budget
 * @param {Readonly<Record<string, any>>} config the validated config
 * @returns {string[]} the row's lines: its cells and status, the two hunters' margins, `packGain` and the rally's burn
 */
function packLines(name, pack, config) {
    const levels = Object.entries(pack.levels)
        .map(([effect, level]) => `${effect}=${level}`)
        .join(' ');
    const cells = Object.entries(pack.row.cells)
        .map(([step, c]) => `${step} ${cellText(c)}`)
        .join('  ');
    const signed = (/** @type {number} */ v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}`;
    const neutral =
        config.rallyThrust === 0 && config.rallyBurn === 0
            ? '  rallyThrust and rallyBurn are 0: a rally changes no lane, so packGain is 0 by construction'
            : null;
    return [
        `${name}  hearer at ${levels}  ${cells}  ${pack.row.status}  binding ${pack.row.binding ?? '-'}`,
        `  catch margin (broken bound, px): lone ${signed(pack.lone.catchMargin)}  rallied ${signed(pack.rallied.catchMargin)}`,
        `  packGain ${signed(pack.packGain)} px (${signed(pack.packGainTicks)} ticks)  chase energy spent against the lone hunter's ${signed(pack.burn)}`,
        ...(neutral === null ? [] : [neutral]),
    ];
}
