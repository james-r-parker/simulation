// Adaptive difficulty in the trainer (docs/designs/training-loop.md, Adaptive difficulty): what the checkpoint asks of the
// steering drill, how the episodes' world is laid over by the stage's current value, and how a checkpoint's reading moves it.
import { nextDifficulty, withPreySprint } from '../../js/evo/adaptive-difficulty.js';
import { needsGate } from '../../js/evo/curriculum.js';

/**
 * @param {import('./train-state.mjs').StageInfo} stage the stage whose world ran the last generation
 * @param {import('../../js/evo/stage-run.js').RunState} state the state before the generation
 * @returns {{drill: string, value: number} | undefined} the steering read this checkpoint takes (`runCheckpoint`'s
 *   `options.steer`): the adaptive stage's drill at its current value; undefined for a stage with no `adapt`, a review or a
 *   checkpoint that reads no gate
 */
export function steerOptions(stage, state) {
    if (stage.adapt === undefined || state.difficulty === null || !needsGate(state)) {
        return undefined;
    }
    return { drill: stage.adapt.drill, value: state.difficulty };
}

/**
 * @param {Record<string, any>} overrides a stage's config overrides
 * @param {number | null} difficulty the value of `adapt.param` the episodes run at (`episodeDifficulty`; null: none)
 * @returns {Record<string, any>} the overrides the episodes run under: the stage's own when there is no value, else the
 *   value laid over them. The stage's `rulesHash` is taken from its own overrides, never from this.
 */
export function episodeOverrides(overrides, difficulty) {
    return difficulty === null ? overrides : withPreySprint(overrides, difficulty);
}

/**
 * Moves the stage's value on a checkpoint's steering read, and logs `TrainDifficulty` when it changes. The value stays put
 * when the step moved the run to another stage, into a review, or when no steering read was taken.
 * @param {{before: import('../../js/evo/stage-run.js').RunState, after: import('../../js/evo/stage-run.js').RunState,
 *   steer: {drill: string, value: number, winShare: number | null} | null | undefined}} step the state before and after the
 *   generation, and the checkpoint's steering read
 * @param {import('../../js/sim/log.js').SimLog} log receives `TrainDifficulty`
 * @returns {import('../../js/evo/stage-run.js').RunState} the state after, with the next value
 */
export function applySteer({ before, after, steer }, log) {
    const adapt = /** @type {any} */ (before.stages[before.index]).adapt;
    if (!steer || adapt === undefined || after.index !== before.index || after.review !== null) {
        return after;
    }
    const next = nextDifficulty(adapt, steer.value, steer.winShare);
    if (next !== steer.value) {
        log.log('info', 'TrainDifficulty', {
            stage: before.stages[before.index].name,
            generation: after.generation,
            param: adapt.param,
            from: steer.value,
            to: next,
            winShare: steer.winShare,
        });
    }
    return { ...after, difficulty: next };
}
