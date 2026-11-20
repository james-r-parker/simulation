#!/usr/bin/env node
// `npm run director:dry -- --seed <n> --ticks <t>`: runs the director over a headless world and prints one line per shot
// and the three readings (docs/designs/ambient-display.md): `director.chase_precision`, `director.max_kind_share` and
// `director.shots_per_hour`, each with the bar it is read against. `--seed 1,2,3,4` runs several seeds one after another,
// `--policy <name>` runs a registered policy (the live one by default), `--config <file.json>` overrides the config and
// `--json` prints the results as JSON. A detector, never fitness.

import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { getPolicy, LIVE_POLICY } from '../js/evo/policies/index.js';
import { BARS, meetsBars, runDirectorDry } from './lib/director-dry.mjs';

/** The default length: 20 simulated minutes at 60 ticks a second. */
export const DEFAULT_TICKS = 72000;

/**
 * @param {string[]} argv the arguments after the script name
 * @returns {{seeds: number[], ticks: number, json: boolean, policy: string, config: Record<string, any>}} the options
 * @throws {Error} on an unknown flag or a bad number
 */
export function parseDryArgs(argv) {
    const { values } = parseArgs({
        args: argv,
        options: {
            seed: { type: 'string', default: '1' },
            ticks: { type: 'string', default: String(DEFAULT_TICKS) },
            json: { type: 'boolean', default: false },
            policy: { type: 'string', default: LIVE_POLICY },
            config: { type: 'string' },
        },
    });
    const seeds = values.seed.split(',').map(Number);
    const ticks = Number(values.ticks);
    if (seeds.some((s) => !Number.isInteger(s) || s < 0) || !Number.isInteger(ticks) || ticks < 1) {
        throw new Error(`director-dry: --seed must be unsigned integers and --ticks a positive integer`);
    }
    const config = values.config === undefined ? {} : JSON.parse(readFileSync(values.config, 'utf8'));
    return { seeds, ticks, json: values.json, policy: values.policy, config };
}

/**
 * @param {import('./lib/director-dry.mjs').DryResult} r one seed's result
 * @returns {string[]} the report lines: one per shot, then the three readings with their bars
 */
export function reportLines(r) {
    const ok = meetsBars(r);
    const mark = (/** @type {boolean | null} */ pass) => (pass === null ? 'n/a' : pass ? 'meets' : 'MISSES');
    return [
        ...r.shots.map(
            (s) => `seed ${r.seed} tick ${s.tick} ${s.kind} score ${s.score} ${s.resolved ? 'resolved' : '-'}`,
        ),
        `director.chase_precision seed=${r.seed} ${r.chasePrecision === null ? 'n/a' : r.chasePrecision.toFixed(3)} (bar >= ${BARS.chasePrecision}: ${mark(ok.chasePrecision)})`,
        `director.max_kind_share seed=${r.seed} ${r.maxKindShare.toFixed(3)} (bar <= ${BARS.maxKindShare}: ${mark(ok.maxKindShare)})`,
        `director.shots_per_hour seed=${r.seed} ${r.shotsPerHour.toFixed(1)} (bar ${BARS.shotsPerHour.join(' to ')}: ${mark(ok.shotsPerHour)})`,
        `shares seed=${r.seed} ${Object.entries(r.shares)
            .map(([k, v]) => `${k}=${v.toFixed(2)}`)
            .join(' ')}`,
    ];
}

/**
 * @param {string[]} argv the arguments
 * @returns {void}
 */
function main(argv) {
    const { seeds, ticks, json, policy, config } = parseDryArgs(argv);
    const results = seeds.map((seed) =>
        runDirectorDry({
            seed,
            ticks,
            overrides: config,
            createPolicy: (options) => getPolicy(policy).create(options),
            policyName: policy,
        }),
    );
    if (json) {
        console.log(JSON.stringify(results, null, 2));
        return;
    }
    for (const r of results) {
        console.log(reportLines(r).join('\n'));
    }
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
    main(process.argv.slice(2));
}
