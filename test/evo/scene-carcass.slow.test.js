// trackCarcasses skips slots that held no tracked meat and hold none now. The skip must change no metric: the hashes
// below were recorded from the loop over every slot (origin/main before the skip), live policy, seed 1, 20000 ticks,
// and re-pinned when pooled-v6 and its pooled body sense (body-genes T7, T31) changed every world, then moved to seed 2
// when the trait genes' inheritance (body-genes T33) left seed 1 with no carcass meal (its precondition read null), and
// re-pinned for the herd centroid fix, the body lanes (body-genes T3 to T13a) the hunter-choice metrics (T22) and the gene metrics (T9),
// and again for the effect registry (status-effects T2: the factors multiply on the lane in registry order, so thrust and
// cost round differently; carcass meal share 0.148 and scavenge events 0.378 per 1k as before), and for the 13 effect
// metrics of status-effects T12 and main's defender_bite_break_share (two causes: with the 13 removed the digest is main's
// pin, e37bdd9b; the world hash is unchanged), and again when the huddle pass stopped counting at huddleWarmth 0 (the
// huddled share reads 0). The digest then covered every metric and moved for unrelated ones (agent-workflow.md T44), so
// it now covers only the carcass and scavenge metrics (CARCASS_KEY): what the skip can change. Their entries are
// unchanged since the whole-set pin, which the world hash (every world state) still backs. Both re-pinned for the step 5
// defaults (the sprint store, the shove and the status effects are on): the world steps differently, and the unskipped loop
// (the skip disabled) gives the same world hash and digest as the skip.

import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { LIVE_POLICY } from '../../js/evo/policies/index.js';
import { runSeed } from '../../scripts/eval-worker.mjs';
import { scaleTimeout } from '../../scripts/lib/test-timeout.mjs';

const RECORDED_WORLD_HASH = 'e3310c8df373f4c2';
const CARCASS_KEY = /carcass|scavenge/;
const RECORDED_METRICS_SHA256 = '34d638495a3bdeaa07cc91d338562b3162b32e17246ee59418a508c3deeb7be7';

describe('trackCarcasses skipping empty slots', () => {
    it(
        'leaves every metric of a 20000-tick seed identical to the unskipped loop',
        { timeout: scaleTimeout(120_000) },
        () => {
            const result = runSeed({ seed: 2, ticks: 20000, policy: LIVE_POLICY, overrides: {} });
            expect(result.metrics['eval.carcass_meal_share'].value).toBeGreaterThan(0);
            expect(result.metrics['eval.reward_events_per_1k.scavenge'].value).toBeGreaterThan(0);
            expect(result.worldHash).toBe(RECORDED_WORLD_HASH);
            // The digest pins the metrics recorded before the pooled twins (metric-noise T3); a `_pooled` twin is pinned
            // by its own source test.
            const carcass = Object.entries(result.metrics).filter(
                ([key]) => CARCASS_KEY.test(key) && !key.endsWith('_pooled'),
            );
            expect(carcass.length).toBeGreaterThanOrEqual(10);
            const digest = createHash('sha256')
                .update(JSON.stringify(Object.fromEntries(carcass)))
                .digest('hex');
            expect(digest).toBe(RECORDED_METRICS_SHA256);
        },
    );
});
