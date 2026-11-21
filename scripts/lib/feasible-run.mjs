// Runs the learnability check over a ladder (docs/designs/training-loop.md, Learnability check): the learn probe on each gate
// drill of each gated stage, in the stage's config, judged against the bar the gate condition implies. A detector only.
import { drillBodyRules } from '../../js/evo/drill-body-rules.js';
import { BITE_DRILLS, baselineShares, barOf, fairBands, judge, parseGate } from '../../js/evo/feasible.js';
import { LEARN_GENERATIONS, LEARN_POPULATION, LEARN_SEEDS, LEARN_TRIALS } from '../../js/evo/learn-probe.js';
import { runPool } from './worker-pool.mjs';

const WORKER_URL = new URL('../learn-worker.mjs', import.meta.url);

/** The probe's sizes (the defaults are the doc's: 8 populations, 200 generations). */
export const PROBE_DEFAULTS = Object.freeze({
    generations: LEARN_GENERATIONS,
    seeds: LEARN_SEEDS,
    population: LEARN_POPULATION,
    trials: LEARN_TRIALS,
});

/**
 * @typedef {object} DrillFeasible
 * @property {string} drill the drill
 * @property {number} bar the final win share the gate condition(s) imply
 * @property {number} reached populations at or above the bar
 * @property {number} populations populations run
 * @property {number} best the best final win share
 * @property {number[]} finals each population's final win share
 * @property {Record<string, number[]> | null} fairBand each hunter's fair band for a bite drill, else null
 * @property {boolean} learnable whether enough populations reached the bar
 */

/**
 * @typedef {object} StageFeasible
 * @property {string} stage the stage
 * @property {DrillFeasible[]} drills each checked drill
 * @property {string[]} unchecked readings the check cannot test
 * @property {boolean | null} learnable every checked drill learnable (null: the gate has none to check)
 */

/**
 * @typedef {object} CheckOptions
 * @property {number} [generations] probe generations
 * @property {number} [seeds] populations per drill
 * @property {number} [population] brains per generation
 * @property {number} [trials] trials per brain per generation
 * @property {number} [workers] pool size (default: the pool's)
 * @property {string | null} [until] the last stage to check (default: all)
 * @property {(file: string) => Record<string, any>} readConfig reads a stage's config file
 * @property {import('../../js/sim/log.js').SimLog} [log] receives `FeasibleStage`
 */

/**
 * @param {readonly Record<string, any>[]} ladder a ladder's entries
 * @param {string | null} until the last stage to check
 * @returns {Record<string, any>[]} the gated stages up to and including `until`
 * @throws {Error} when `until` names no stage
 */
function gatedStages(ladder, until) {
    const names = ladder.map((entry) => entry.name);
    if (until !== null && !names.includes(until)) {
        throw new Error(`feasible: --until "${until}" is not a stage of the ladder (${names.join(', ')})`);
    }
    const cut = until === null ? ladder.length : names.indexOf(until) + 1;
    return ladder.slice(0, cut).filter((entry) => entry.gate !== undefined);
}

/**
 * @param {readonly Record<string, any>[]} ladder a ladder's entries
 * @param {CheckOptions} options the sizes, the config reader and the log
 * @returns {Promise<StageFeasible[]>} one result per gated stage, in ladder order
 */
export async function checkLadder(ladder, options) {
    const { readConfig, log, until = null } = options;
    const size = {
        generations: options.generations ?? PROBE_DEFAULTS.generations,
        seeds: options.seeds ?? PROBE_DEFAULTS.seeds,
        population: options.population ?? PROBE_DEFAULTS.population,
        trials: options.trials ?? PROBE_DEFAULTS.trials,
    };
    const plans = gatedStages(ladder, until).map((entry) => planStage(entry, readConfig));
    const tasks = plans.flatMap((plan) =>
        plan.drills.flatMap(({ drill }) =>
            Array.from({ length: size.seeds }, (_, i) => ({
                lesson: drill,
                seed: i + 1,
                generations: size.generations,
                population: size.population,
                trials: size.trials,
                config: plan.drillConfig,
            })),
        ),
    );
    /** @type {{reached: number}[]} */
    const results = tasks.length === 0 ? [] : await runPool(tasks, { workerUrl: WORKER_URL, workers: options.workers });
    let at = 0;
    return plans.map((plan) => {
        const finals = plan.drills.map(() => {
            at += size.seeds;
            return results.slice(at - size.seeds, at).map((r) => r.reached);
        });
        return stageResult(plan, finals, log);
    });
}

/**
 * @param {Record<string, any>} entry a gated stage
 * @param {(file: string) => Record<string, any>} readConfig reads a stage's config file
 * @returns {{entry: Record<string, any>, config: Record<string, any>, drillConfig: Record<string, any>, drills: {drill: string, bar: number}[], unchecked: string[]}}
 *   the stage with the bar of each gate drill
 */
function planStage(entry, readConfig) {
    const config = entry.config === null ? {} : readConfig(entry.config);
    // The trainer's gate drills run under the stage's body rules, so the learn probe and its bar do too (never its world size).
    const drillConfig = drillBodyRules(config);
    const { needs, unchecked } = parseGate(entry.gate);
    const drills = [...needs].map(([drill, list]) => ({
        drill,
        bar: barOf(list, baselineShares(drill, { config: drillConfig })),
    }));
    return { entry, config, drillConfig, drills, unchecked };
}

/**
 * @param {ReturnType<typeof planStage>} plan the stage's plan
 * @param {number[][]} finals each drill's populations' final win shares
 * @param {import('../../js/sim/log.js').SimLog | undefined} log receives `FeasibleStage`
 * @returns {StageFeasible} the stage's verdicts
 */
function stageResult(plan, finals, log) {
    const bands = plan.drills.some((d) => BITE_DRILLS.includes(d.drill)) ? fairBands(plan.config) : null;
    const drills = plan.drills.map(({ drill, bar }, i) => {
        const verdict = judge(finals[i], bar);
        const fairBand = BITE_DRILLS.includes(drill) ? bands : null;
        const { reached, best, learnable } = verdict;
        log?.log('info', 'FeasibleStage', { stage: plan.entry.name, drill, reached, best, fairBand, learnable });
        return { drill, bar, populations: finals[i].length, finals: finals[i], fairBand, ...verdict };
    });
    const learnable = drills.length === 0 ? null : drills.every((d) => d.learnable);
    return { stage: plan.entry.name, drills, unchecked: plan.unchecked, learnable };
}

/**
 * @param {readonly StageFeasible[]} stages the check's result
 * @returns {string[]} one line per stage
 */
export function formatFeasible(stages) {
    return stages.map((s) => {
        const drills = s.drills.map((d) => {
            const band = d.fairBand === null ? '' : ` fair-band ${bandText(d.fairBand)}`;
            return `${d.drill} ${d.reached}/${d.populations} at bar ${d.bar.toFixed(2)} (best ${d.best.toFixed(2)})${band}`;
        });
        const verdict = s.learnable === null ? 'not checked' : s.learnable ? 'learnable' : 'UNLEARNABLE';
        const skipped = s.unchecked.length === 0 ? '' : `; unchecked: ${s.unchecked.join(', ')}`;
        return `${s.stage}: ${verdict} - ${drills.join('; ') || 'no drill to check'}${skipped}`;
    });
}

/**
 * @param {Record<string, number[]>} bands each hunter's fair band
 * @returns {string} the bands as `hunter:n` (distances in the band)
 */
function bandText(bands) {
    return Object.entries(bands)
        .map(([hunter, band]) => `${hunter}:${band.length === 0 ? 'empty' : band.length}`)
        .join(',');
}
