import { describe, expect, it } from 'vitest';
import { ablateUnit, editTrials } from '../../js/evo/brain-ablation.js';
import { DRILLS } from '../../js/evo/drill-scenarios.js';
import { brainLayout } from '../../js/sim/brain-layout.js';
import { createConfig } from '../../js/sim/config.js';
import { createRng, nextFloat } from '../../js/sim/rng.js';
import { KNOCKOUT_LEAK_GENE } from '../../js/sim/traits.js';

const PREY_AHEAD = /** @type {any} */ (DRILLS.find((drill) => drill.name === 'prey-ahead'));
const CONFIG = createConfig();
const LAYOUT = brainLayout(CONFIG);

describe('unit knockout vs runtime ablation', () => {
    it('matches ablateUnit trial for trial on prey-ahead for units 0, 13 and 31', () => {
        const rng = createRng(7);
        const weights = new Float32Array(LAYOUT.weightCount);
        for (let i = 0; i < LAYOUT.traitStart; i++) {
            weights[i] = (nextFloat(rng) * 2 - 1) * 2;
        }
        const subject = { name: 'random-predator', id: 1, spec: PREY_AHEAD.spec, weights, act: null };

        for (const unit of [0, 13, 31]) {
            const ablated = ablateUnit({ subject, drill: PREY_AHEAD, unit, seed: 1, trials: 16 });
            const knocked = editTrials({
                subject,
                drill: PREY_AHEAD,
                edits: [{ op: 'set', block: 'leak', col: unit, value: KNOCKOUT_LEAK_GENE }],
                seed: 1,
                trials: 16,
            });
            expect(knocked.map(({ won, ticks }) => ({ won, ticks }))).toEqual(
                ablated.map(({ won, ticks }) => ({ won, ticks })),
            );
        }
    });
});
