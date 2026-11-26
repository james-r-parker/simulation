// Role metric liveness and power table (metric-noise.md Phase 6, T23): per ROLE_METRICS metric, the null share and
// mean of each 16-seed report, and the power rows of an `eval:power --json` reading of the 128-seed shared baseline.
// Usage: node scripts/role-metric-table.mjs <base.json> <shove.json> <e254.json> <e254-power.json>
import { readFileSync } from 'node:fs';
import { METRICS } from '../js/evo/metric-registry/index.js';
import { minSeedsFromPower } from '../js/evo/metric-registry/status.js';
import { ROLE_METRICS } from '../js/evo/metric-registry/roles.js';

const [basePath, shovePath, oldPath, powerPath] = process.argv.slice(2);
/** @type {(p: string) => any} */
const load = (p) => JSON.parse(readFileSync(p, 'utf8'));
const [base, shove, old, power] = [basePath, shovePath, oldPath, powerPath].map(load);

/** @returns {{nulls: number, n: number, distinct: number, mean: number|null, sd: number|null}|null} */
/** @param {any} report @param {string} name */
function live(report, name) {
    const m = report.metrics[name];
    if (!m) {
        return null;
    }
    const vals = m.values.filter((/** @type {any} */ v) => v !== null && Number.isFinite(v));
    return {
        nulls: m.values.length - vals.length,
        n: m.values.length,
        distinct: new Set(vals).size,
        mean: vals.length
            ? vals.reduce((/** @type {number} */ a, /** @type {number} */ b) => a + b, 0) / vals.length
            : null,
        sd: m.sd ?? null,
    };
}
/** @type {(x: number|null|undefined) => string} */
const fmt = (x) => (x === null || x === undefined ? '-' : Number(x.toPrecision(3)).toString());
/** @type {(l: any) => string} */
const cell = (l) => (l ? `${l.nulls}/${l.n} null, ${l.distinct} distinct, mean ${fmt(l.mean)}` : 'absent');

/** @type {any[]} */
const rows = power.rows;
/** @type {(name: string) => any} */
const entry = (name) => /** @type {any} */ (METRICS)[name];

/** The seeds the power bar holds at, from the E254 power rows and the registry unit (`meetsPowerBar` rules). */
/** @param {string} name */
function powerCell(name) {
    const e = entry(name);
    const mine = rows.filter((r) => r.metric === name);
    if (!e || mine.length === 0) {
        return ['not in E254', '-'];
    }
    const by = Object.fromEntries(mine.map((r) => [r.size, r]));
    /** @type {(n: number) => string} */
    const read = (n) => (by[n] ? `${fmt(by[n].detectable)}${by[n].detectableKind === 'absolute' ? 'a' : ''}` : '-');
    const mde = [16, 32, 64].map(read).join(' / ');
    const refMean = old.metrics[name].mean;
    /** @type {any} */
    const reading = { unit: e.unit, signed: e.signed, power: { referenceMean: refMean } };
    for (const n of [16, 32, 64]) {
        reading.power[`fpr${n}`] = by[n]?.falsePositive ?? null;
        reading.power[`mde${n}`] = by[n]?.detectable ?? null;
    }
    const seeds = minSeedsFromPower(reading);
    return [mde, seeds === null ? 'more than 64' : String(seeds)];
}

console.log('| Role | Metric | Base 16 | Shove 16 | E254 128 | MDE 16/32/64 (a = absolute) | Seeds |');
console.log('| --- | --- | --- | --- | --- | --- | --- |');
for (const [role, names] of Object.entries(ROLE_METRICS)) {
    for (const name of names) {
        const [mde, seeds] = powerCell(name);
        console.log(
            `| ${role} | \`${name}\` | ${cell(live(base, name))} | ${cell(live(shove, name))} | ${cell(live(old, name))} | ${mde} | ${seeds} |`,
        );
    }
}
