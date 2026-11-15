// Interface range check (docs/designs/senses-and-motor.md, T1): over 2000 ticks of a default world every input of every
// alive agent is finite and inside its range. The range is [-1, 1] except where the doc records a wider one: the two
// velocity inputs (a sprint lifts the speed cap to `1 + sprintMultiplier x sprintBoost` of `maxVelocity`) and the size
// input (the size trait scales a body up to `TRAIT_MAX`). The velocity range is finding F1 in sim-notes.md (the pooled-row doc says [-1, 1]), recorded, not fixed.
import { describe, expect, it } from 'vitest';
import { POOLED_VALUES } from '../../js/sim/brain-layout.js';
import { cloneWithNoisePolicy } from '../../js/sim/birth-policy.js';
import { createConfig } from '../../js/sim/config.js';
import { createWorld } from '../../js/sim/spawn.js';
import { step } from '../../js/sim/step.js';
import { TRAIT_MAX } from '../../js/sim/traits.js';
import { scaleTimeout } from '../../scripts/lib/test-timeout.mjs';

const TICKS = 2000;
const FORWARD = POOLED_VALUES + 1;
const LATERAL = POOLED_VALUES + 2;
const SIZE = POOLED_VALUES + 4;

describe('the brain inputs of a default world', () => {
    it(
        'are finite and inside their ranges for 2000 ticks',
        () => {
            const policy = cloneWithNoisePolicy();
            const w = createWorld(createConfig({ checkInvariants: false }), policy);
            const { inputCount: n } = w.layout;
            const boosts = Object.values(w.config.specialisations).map((s) => /** @type {any} */ (s).sprintBoost);
            const speed = 1 + w.config.sprintMultiplier * Math.max(...boosts);
            const limit = (/** @type {number} */ k) =>
                k === FORWARD || k === LATERAL ? speed : k === SIZE ? TRAIT_MAX : 1;
            /** @type {string[]} */
            const outside = [];
            for (let t = 0; t < TICKS; t++) {
                step(w, policy);
                for (let slot = 0; slot < w.alive.length; slot++) {
                    for (let k = 0; w.alive[slot] === 1 && k < n; k++) {
                        const v = w.pooled[slot * n + k];
                        if (!(Math.abs(v) <= limit(k) + 1e-6)) {
                            outside.push(`tick ${t} slot ${slot} input ${k} = ${v}`);
                        }
                    }
                }
            }
            expect(outside.slice(0, 5)).toEqual([]);
        },
        scaleTimeout(60_000),
    );
});
