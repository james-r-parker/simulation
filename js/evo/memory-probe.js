// The memory probes (brain-capacity-and-memory.md, Memory probes): runs a genome or a reference controller through
// staged scenarios under the intact, blindfold and amnesia controls and returns the scores. Pure: no files, no clock.
// The probe draws its bearings and starts from its own `fork(rng, 'probe')` stream, so a run replays bit for bit from
// the seed and the genome.

import { createConfig } from '../sim/config.js';
import { createRng, fork } from '../sim/rng.js';
import { CONTROL } from './memory-probe-controls.js';
import { playTrial, viewOf } from './memory-probe-run.js';
import { SCENARIOS } from './memory-probe-scenarios.js';

/** Trials per scenario per control. */
export const TRIALS = 32;
/** A score at or above this is good. */
export const GOOD_SCORE = 0.5;
/** The intact-minus-amnesia difference that counts as better. */
export const GAIN_MARGIN = 0.1;

/**
 * @typedef {object} ProbeOptions
 * @property {Record<string, any>} [config] config overrides the probe world is built from (default none)
 * @property {number} [seed] the base seed; trial `i` runs on world seed `seed + i` (default 1)
 * @property {number} [trials] trials per control (default `TRIALS`)
 * @property {import('../sim/log.js').SimLog} [log] receives `ProbeTrial` at debug level
 */

/**
 * The probe-interpretation table.
 * @param {number} intact the score with the brain's state kept (under the blindfold, where the scenario has one)
 * @param {number} amnesia the score with the state wiped each tick
 * @returns {string} the reading
 */
export function readProbe(intact, amnesia) {
    if (intact >= GOOD_SCORE && amnesia < GOOD_SCORE) {
        return 'strong evidence for memory';
    }
    if (intact - amnesia >= GAIN_MARGIN) {
        return 'internal state contributes';
    }
    return intact >= GOOD_SCORE
        ? 'solvable from the current senses; no memory is shown'
        : 'not evolved, or too hard for this brain';
}

/**
 * @param {number} spec a specialisation index
 * @param {Readonly<Record<string, any>>} base the config the probe world is built from
 * @returns {boolean} whether the specialisation can hunt
 */
function canHunt(spec, base) {
    const entry = Object.values(base.specialisations).find((s) => /** @type {any} */ (s).index === spec);
    return /** @type {any} */ (entry).canHunt === true;
}

/**
 * @param {import('./memory-probe-scenarios.js').Scenario} scenario the scenario
 * @param {string} control a `CONTROL` value
 * @returns {{name: string, blind: boolean, amnesia: boolean}} the control spec the runner builds the control from
 */
function controlSpec(scenario, control) {
    return {
        name: control,
        blind: scenario.windowed && control !== CONTROL.INTACT,
        amnesia: control === CONTROL.AMNESIA,
    };
}

/**
 * Scores one scenario under one control.
 * @param {import('./memory-probe-scenarios.js').Scenario} scenario the scenario
 * @param {import('./memory-probe-run.js').Subject} subject the subject
 * @param {{control: string, options: Required<Pick<ProbeOptions, 'config' | 'seed' | 'trials'>> & ProbeOptions,
 *   view: number}} run the control, the options and the subject's ray length
 * @returns {number} the share of trials that scored, 0 to 1
 */
function scoreScenario(scenario, subject, { control, options, view }) {
    const { config, seed, trials, log } = options;
    let wins = 0;
    for (let trial = 0; trial < trials; trial++) {
        const rng = fork(fork(createRng(seed + trial), 'probe'), scenario.name);
        const won = playTrial({
            plan: scenario.plan(rng, view),
            subject,
            controlSpec: controlSpec(scenario, control),
            seed: seed + trial,
            config,
        });
        wins += won ? 1 : 0;
        log?.log('debug', 'ProbeTrial', {
            scenario: scenario.name,
            genomeId: subject.id,
            control,
            trial,
            score: won ? 1 : 0,
        });
    }
    return wins / trials;
}

/**
 * @typedef {object} ScenarioResult
 * @property {string} scenario the scenario's name
 * @property {string} metric the score's metric name
 * @property {Record<string, number>} scores the score under each control it has
 * @property {number | null} gain the score with the state kept minus the score with it wiped; null when skipped
 * @property {string | null} reading the interpretation table's reading; null when skipped
 * @property {string | null} skipped why the subject was not probed, or null
 */

/**
 * Runs a subject through one scenario under each control.
 * @param {import('./memory-probe-scenarios.js').Scenario} scenario the scenario
 * @param {import('./memory-probe-run.js').Subject} subject the subject
 * @param {ProbeOptions} [options] the probe options
 * @returns {ScenarioResult} the scores, the gain and the reading
 */
export function probeScenario(scenario, subject, options = {}) {
    const { config = {}, seed = 1, trials = TRIALS, log } = options;
    const base = createConfig(config);
    const staged = { ...subject, spec: subject.spec ?? scenario.spec };
    const result = { scenario: scenario.name, metric: scenario.metric, scores: {}, gain: null, reading: null };
    if (scenario.needsHunter && !canHunt(staged.spec, base)) {
        return { ...result, skipped: 'the specialisation cannot hunt' };
    }
    const run = { options: { config, seed, trials, log }, view: viewOf(staged, base) };
    const controls = scenario.windowed
        ? [CONTROL.INTACT, CONTROL.BLINDFOLD, CONTROL.AMNESIA]
        : [CONTROL.INTACT, CONTROL.AMNESIA];
    const scores = Object.fromEntries(
        controls.map((c) => [c, scoreScenario(scenario, staged, { ...run, control: c })]),
    );
    const kept = scores[CONTROL.BLINDFOLD] ?? scores[CONTROL.INTACT];
    const wiped = scores[CONTROL.AMNESIA];
    return { ...result, scores, gain: kept - wiped, reading: readProbe(kept, wiped), skipped: null };
}

/**
 * Runs every scenario, or the named ones.
 * @param {import('./memory-probe-run.js').Subject} subject the subject
 * @param {ProbeOptions & {scenarios?: readonly string[]}} [options] the probe options and the scenario names to run
 *   (default all four)
 * @returns {{scenarios: ScenarioResult[]}} the results
 * @throws {Error} on an unknown scenario name
 */
export function probeSubject(subject, options = {}) {
    const known = SCENARIOS.map((s) => s.name);
    const names = options.scenarios ?? known;
    for (const name of names) {
        if (!known.includes(name)) {
            throw new Error(`scenario: expected one of ${known.join(', ')}, got "${name}"`);
        }
    }
    return {
        scenarios: SCENARIOS.filter((s) => names.includes(s.name)).map((s) => probeScenario(s, subject, options)),
    };
}
