#!/usr/bin/env node
// Replays one seed on map-elites-v6 and prints each specialisation's mean fitnessV6 and each term's share of it, over
// the lives scored at death after burn-in and the living at the last tick (natural-selection.md Phase 4 T39):
// `node scripts/fitness-by-spec.mjs --seed <n> --ticks <n> [--config <file.json>]`.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BURN_IN_TICKS } from '../js/evo/burn-in.js';
import { TERM_NAMES, createTermTally, tallyingFitness, termTable } from '../js/evo/fitness-by-spec.js';
import { createObserver } from '../js/evo/observer.js';
import { getPolicy } from '../js/evo/policies/index.js';
import { createConfig } from '../js/sim/config.js';
import { createSimLog } from '../js/sim/log.js';
import { createRng, fork } from '../js/sim/rng.js';
import { createWorld } from '../js/sim/spawn.js';
import { step } from '../js/sim/step.js';
import { intValue, parseFlags } from './lib/cli-args.mjs';
import { feedPolicy } from './lib/feed-policy.mjs';

const USAGE = 'usage: fitness-by-spec --seed <n> --ticks <n> [--config <file.json>]';

/**
 * @param {string[]} argv the arguments after the script
 * @returns {{seed: number, ticks: number, config: string | null}} the options
 */
export function parse(argv) {
    const opts = parseFlags(argv, {
        valueFlags: {
            '--seed': (v, f) => ['seed', intValue(f, v, 0, USAGE)],
            '--ticks': (v, f) => ['ticks', intValue(f, v, 1, USAGE)],
            '--config': (v) => ['config', v],
        },
        defaults: { seed: 1, ticks: 200000, config: null },
        usage: USAGE,
    });
    return /** @type {{seed: number, ticks: number, config: string | null}} */ (opts);
}

/**
 * @param {{seed: number, ticks: number, config: string | null, from?: number}} opts the options; `from` is the first
 *   tick whose deaths are counted (default `BURN_IN_TICKS`)
 * @returns {{rows: ReturnType<typeof termTable>, world: Record<string, any>}} the table and the world at the end
 */
export function run({ seed, ticks, config: file, from = BURN_IN_TICKS }) {
    const overrides = file === null ? {} : JSON.parse(readFileSync(file, 'utf8'));
    const config = createConfig({ ...overrides, seed });
    const observer = createObserver(config, fork(createRng(seed), 'eval'), { runTicks: ticks, checkpointTicks: 1000 });
    const log = createSimLog(() => {}, { level: 'error' });
    const policy = getPolicy('map-elites-v6').create({ config, log, observer });
    const tally = createTermTally();
    const world = createWorld(config, policy.brain);
    const fitness = tallyingFitness(policy.fitness, { tally, on: () => world.tick >= from });
    const feed = { policy: { ...policy, fitness }, observer };
    feedPolicy(feed, world);
    for (let t = 0; t < ticks; t++) {
        step(world, policy.brain);
        feedPolicy(feed, world);
    }
    for (const slot of observer.slotOf.values()) {
        fitness(observer, slot, config);
    }
    const names = [];
    for (const [name, spec] of Object.entries(config.specialisations)) {
        names[spec.index] = name;
    }
    return { rows: termTable(tally, names), world };
}

/**
 * @param {ReturnType<typeof termTable>} rows the table
 * @param {{seed: number, ticks: number}} opts the run's seed and length
 * @returns {string} the table as Markdown under a title line
 */
export function format(rows, { seed, ticks }) {
    const pct = (/** @type {number | null} */ v) => (v === null ? '-' : `${(100 * v).toFixed(1)}%`);
    return [
        `fitnessV6 by specialisation, seed ${seed}, ${ticks} ticks (deaths after burn-in and the living)`,
        '',
        `| spec | lives | mean fitness | ${TERM_NAMES.join(' | ')} |`,
        `| --- | --- | --- | ${TERM_NAMES.map(() => '---').join(' | ')} |`,
        ...rows.map(
            (r) =>
                `| ${r.spec} | ${r.lives} | ${r.mean.toFixed(1)} | ${TERM_NAMES.map((t) => pct(r.shares[t])).join(' | ')} |`,
        ),
    ].join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const opts = parse(process.argv.slice(2));
    console.log(format(run(opts).rows, opts));
}
