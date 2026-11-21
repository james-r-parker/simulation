// Formats the role budget for `npm run role:budget`: the matrix (rows by steps), then per row the bounds, the tiers, the
// energy and heat lines. Every number is rounded here, never by a module (docs/designs/role-budget.md).
import { padTable } from './drill-report.mjs';

/** The steps of each kind of row, by the first step of its cells. */
const STEPS = ['see', 'turn', 'run', 'bite'];

/** @param {number} v a number @param {number} [digits] the decimals @returns {string} the number, signed */
const signed = (v, digits = 0) => `${v >= 0 ? '+' : ''}${v.toFixed(digits)}`;

/**
 * @param {import('../../js/evo/role-budget-cell.js').Cell} cell one cell
 * @returns {string} its slack in ticks, `>200` at the cap, `X` for an impossible step and `-` for one not read, a tight
 *   one marked with `!`
 */
export function cellText(cell) {
    if (cell.status === 'impossible') {
        return 'X';
    }
    if (cell.status === 'n/a') {
        return '-';
    }
    const text = cell.capped ? `>${cell.margin}` : String(Math.round(/** @type {number} */ (cell.margin)));
    return cell.status === 'tight' ? `${text}!` : text;
}

/**
 * @param {import('../../js/evo/role-budget-matrix.js').Row[]} rows the rows, all with the same steps
 * @returns {string} one table: a row per line, its steps, its status and its binding step
 */
function matrixTable(rows) {
    const steps = Object.keys(rows[0].cells).length > 0 ? Object.keys(rows[0].cells) : STEPS;
    const head = ['row', ...steps, 'status', 'binding'];
    const body = rows.map((row) => [
        row.name,
        ...steps.map((step) => cellText(row.cells[step])),
        row.status,
        row.binding ?? '-',
    ]);
    return padTable([head, ...body]).join('\n');
}

/**
 * @param {import('../../js/evo/role-budget-matrix.js').Row[]} rows the matrix rows
 * @returns {string} the matrix: a table per set of steps (the hunter's rows, then the defender's), a row per line, each
 *   with its status and its binding step
 */
export function formatMatrix(rows) {
    const groups = new Map();
    for (const row of rows) {
        const key = Object.keys(row.cells).join(',');
        groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    return [...groups.values()].map(matrixTable).join('\n\n');
}

/**
 * @param {Record<string, {straight: number, broken: number}>} tiers the tier margins in px
 * @returns {string} `perfect +408/-102 reactive ...`, straight then broken
 */
function tierText(tiers) {
    return ['perfect', 'reactive', 'naive']
        .map((t) => `${t} ${signed(tiers[t].straight)}/${signed(tiers[t].broken)}`)
        .join('  ');
}

/**
 * @param {any} budget one hunter-against-prey budget
 * @returns {string[]} the lines that go under its row
 */
function budgetLines(budget) {
    const lines = [
        `  catch margin (broken bound, px): ${signed(budget.catchMargin)}  catchable ${budget.catchable ? 'yes' : 'no'}  gap at awareness ${budget.gapAtAwareness.toFixed(0)}`,
        `  tiers, margin straight/broken px: ${tierText(budget.tiers)}`,
        `  learn slope ${budget.learnSlope}  fit for the rung screen ${budget.fit ? 'yes' : 'no'}`,
    ];
    if (budget.bearings !== null) {
        const share = budget.bearings.share.toFixed(3);
        lines.push(`  audit bearings closing ${share}  worst margin ${signed(budget.bearings.worst)} px`);
    }
    const e = budget.chaseEnergy;
    lines.push(
        `  chase energy: spent ${e.spent.toFixed(1)}  kicks ${e.kick.toFixed(1)}  returned ${e.income.toFixed(1)}  net ${signed(e.net, 1)}  (holds ${e.holds.toFixed(0)} above its birth reserve)`,
        `  chase heat: +${budget.chaseHeat.gain.toFixed(3)} of ${budget.chaseHeat.headroom} headroom  refill after the burst: ${budget.refillTicks.toFixed(0)} ticks`,
    );
    return lines;
}

/**
 * @param {import('../../js/evo/role-budget-defend.js').DefendBudget} budget the defender's budget
 * @returns {string[]} the lines that go under its row: the scene's ticks, the shove, the bite on the defender, the smoke
 */
function defendLines(budget) {
    const { run, baseline, repel, smoke, defenderBite } = budget;
    const at = (/** @type {number | null} */ t) => (t === null || t < 0 ? 'never' : `tick ${t}`);
    const shove = repel.on
        ? `on (energy ${repel.energy}, impulse ${repel.impulse}, cost ${repel.cost}): breaks the bite ${repel.breaksBite ? 'yes' : 'no'}, prevents ${repel.prevented.toFixed(0)} bite energy, takes ${repel.energy} from the hunter`
        : 'off (defenderRepelEnergy and defenderRepelImpulse are 0): no power on arrival';
    return [
        `  alarm ${at(run.alarmTick)}  heard ${at(run.heardTick)}  defender moves ${at(run.startTick)}  touches the hunter ${at(run.interceptTick)}  caller dies ${at(baseline.killTick)} (no defender) / ${at(run.killTick)}`,
        `  shove ${shove}`,
        `  a hunter's bite on the defender takes ${defenderBite.taken.toFixed(0)} and costs the hunter ${defenderBite.kick.toFixed(1)} of kick`,
        `  smoke: ${smoke.refused ? 'refused (the defender faces the hunter) ' : ''}release at tick ${smoke.releaseTick} (walk ${smoke.runTicks}, turn ${smoke.facingTicks}), latest ${smoke.latestRelease}; hidden ${smoke.hiddenTicks} ticks, caller needs ${smoke.escapeNeed} to leave the view; slack defender ${smoke.slackDefender ?? 'X'}, caller ${smoke.slackCaller ?? 'X'}`,
    ];
}

/**
 * @param {import('../../js/evo/role-budget-matrix.js').Row[]} rows the matrix rows
 * @returns {string} the detail of each row: its bounds, tiers, energy and heat, or the average and best row's choice
 */
export function formatDetail(rows) {
    return rows
        .flatMap((row) => {
            const d = row.detail;
            if (d === undefined) {
                return [];
            }
            if (d.average !== undefined) {
                const picks = row.name === 'predator:best' ? `  picks ${d.best.picks}` : '';
                const share = `catchable share ${d.catchableShare.toFixed(2)}  choice gain ${d.choiceGain.toFixed(1)} ticks`;
                return [row.name, `  ${share}${picks}`];
            }
            return [row.name, ...(d.repel === undefined ? budgetLines(d) : defendLines(d))];
        })
        .join('\n');
}

/**
 * @param {{rows: import('../../js/evo/role-budget-matrix.js').Row[], model: object, rulesHash: string}} result the matrix
 * @param {string} configHash the hash of the config the matrix was built from
 * @returns {string} the report: a header, the matrix and the detail
 */
export function formatReport(result, configHash) {
    const head = `role budget  config ${configHash}  rules ${result.rulesHash}\nmodel ${JSON.stringify(result.model)}`;
    return [head, formatMatrix(result.rows), formatDetail(result.rows)].join('\n\n');
}

/**
 * @param {{pair: string, findings: import('../../js/evo/role-budget-search.js').Finding[], files: string[]}[]} searched the
 *   search of each pair and the override files written for it
 * @returns {string} for each pair the smallest changes that make it catchable (or fit), with the margin and the file
 */
export function formatSearch(searched) {
    return searched
        .map(({ pair, findings, files }) => {
            if (findings.length === 0) {
                return `${pair}: no single setting at the factors tried gives it`;
            }
            const rows = findings.map((f, i) => [
                `x${f.factor}`,
                f.path,
                String(Number(f.value.toPrecision(5))),
                signed(f.margin),
                f.learnSlope,
                f.fit ? 'fit' : '-',
                files[i] ?? '',
            ]);
            return `${pair}: smallest single changes that give it\n${padTable([['factor', 'setting', 'value', 'margin px', 'slope', 'fit', 'file'], ...rows]).join('\n')}`;
        })
        .join('\n\n');
}

/**
 * @param {{kinematics: import('../../js/evo/role-budget-check.js').KinematicRow[], pairs: {pair: string, straight: any[], broken: any[]}[]}} check the cross-check
 * @returns {string} the kinematic readings and, per pair and bound, the cells that disagree or drift
 */
export function formatCheck(check) {
    const kin = check.kinematics.map((k) => [
        k.spec,
        k.what,
        k.formula.toFixed(3),
        k.sim.toFixed(3),
        `${(k.difference * 100).toFixed(3)}%`,
        `${(k.tolerance * 100).toFixed(3)}%`,
        k.drift ? 'DRIFT' : 'ok',
    ]);
    const lines = [padTable([['body', 'reading', 'formula', 'sim', 'difference', 'tolerance', ''], ...kin]).join('\n')];
    for (const { pair, straight, broken } of check.pairs) {
        /** @type {[string, any[]][]} */
        const bounds = [
            ['straight', straight],
            ['broken', broken],
        ];
        for (const [bound, cells] of bounds) {
            const apart = cells.filter((c) => c.drift || !c.agrees);
            const drift = apart.filter((c) => c.drift).length;
            const detail = apart.map(
                (c) =>
                    `${c.distance.toFixed(0)}px@${((c.bearing * 180) / Math.PI).toFixed(0)}: formula ${c.formula ?? 'none'} sim ${c.sim ?? 'none'}${c.edge ? ' (view edge)' : ''}`,
            );
            lines.push(
                `${pair} ${bound}: ${cells.length} cells, ${drift} drift${detail.length > 0 ? `\n  ${detail.join('\n  ')}` : ''}`,
            );
        }
    }
    return lines.join('\n\n');
}
