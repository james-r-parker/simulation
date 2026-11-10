// Source tests, hunters family, chases (docs/designs/metric-trust.md, T16): `scene-approach.js`, `scene-competence.js`
// and `scene-matched.js` read on the real `step`. A chase opens when the observer's prey tracker sees the hunter close
// on prey in view (thrust toward it); it ends caught (a fatal bite), escaped (a bite the prey lives through for 30 ticks)
// or given up (the closing stops for 30 ticks). The last chase of each run resolves in its final tick.

import { describe, expect, it } from 'vitest';
import { BURN_IN_TICKS } from '../../js/evo/burn-in.js';
import { FORAGER, PREDATOR, chaseSteps, huntRun, settleChases } from './helpers/hunt-scene.js';

const STILL = { maturityTicks: 100000 };

/**
 * One hunter runs the chases in order after burn-in, each against a fresh prey.
 * @param {Array<'caught' | 'escaped' | 'gaveup'>} outcomes the chases
 * @returns {Record<string, any>} the metrics
 */
function chases(outcomes) {
    const { run, spawn } = huntRun({ over: STILL });
    run.jump(BURN_IN_TICKS);
    const hunter = spawn(PREDATOR);
    for (const outcome of outcomes) {
        chaseSteps(run, { hunter, prey: spawn(FORAGER), outcome });
        settleChases(run);
    }
    return run.metrics();
}

describe('chase_catch_share, chase_escape_share, chase_giveup_share and hunt_abort_rate', () => {
    it('read one chase of each outcome as 1 in its own share', () => {
        const caught = chases(['caught']);
        expect(caught['eval.chase_catch_share']).toEqual({ value: 1 });
        expect(caught['eval.chase_giveup_share']).toEqual({ value: 0 });
        expect(caught['eval.hunt_abort_rate']).toEqual({ value: 0 });
        expect(chases(['escaped'])['eval.chase_escape_share']).toEqual({ value: 1 });
        const gaveUp = chases(['gaveup']);
        expect(gaveUp['eval.chase_giveup_share']).toEqual({ value: 1 });
        expect(gaveUp['eval.hunt_abort_rate']).toEqual({ value: 1 });
    });

    it('read a mix of two catches, one escape and one give-up as 1/2, 1/4, 1/4, and abort 1 of 4 approaches', () => {
        const m = chases(['caught', 'escaped', 'gaveup', 'caught']);
        expect(m['eval.chase_catch_share']).toEqual({ value: 0.5 });
        expect(m['eval.chase_escape_share']).toEqual({ value: 0.25 });
        expect(m['eval.chase_giveup_share']).toEqual({ value: 0.25 });
        expect(m['eval.hunt_abort_rate']).toEqual({ value: 0.25 });
    });

    it('are null before any chase resolves after burn-in', () => {
        expect(chases([])['eval.chase_catch_share']).toEqual({
            value: null,
            reason: 'no chase resolved after burn-in',
        });
    });
});
