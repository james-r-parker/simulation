// trackCarcasses skips slots that held no tracked meat and hold none now. The skip must change no metric: the hashes
// below were recorded from the loop over every slot (origin/main before the skip), live policy, seed 1, 20000 ticks,
// and re-pinned when pooled-v6 and its pooled body sense (body-genes T7, T31) changed every world, then moved to seed 2
// when the trait genes' inheritance (body-genes T33) left seed 1 with no carcass meal (its precondition read null), and
// re-pinned for the herd centroid fix, the body lanes (body-genes T3 to T13a) the hunter-choice metrics (T22) and the gene metrics (T9),
// and again for the effect registry (status-effects T2: the factors multiply on the lane in registry order, so thrust and
// cost round differently; carcass meal share 0.148 and scavenge events 0.378 per 1k as before).

import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { LIVE_POLICY } from '../../js/evo/policies/index.js';
import { runSeed } from '../../scripts/eval-worker.mjs';
import { scaleTimeout } from '../../scripts/lib/test-timeout.mjs';

const RECORDED_WORLD_HASH = 'af220e7209361ae7';
const RECORDED_METRICS_SHA256 = 'e37bdd9bfc1d45796949f1dee995cf43e061f66909e8c5edabed3a3f9a932a0a';

describe('trackCarcasses skipping empty slots', () => {
    it(
        'leaves every metric of a 20000-tick seed identical to the unskipped loop',
        { timeout: scaleTimeout(120_000) },
        () => {
            const result = runSeed({ seed: 2, ticks: 20000, policy: LIVE_POLICY, overrides: {} });
            expect(result.metrics['eval.carcass_meal_share'].value).toBeGreaterThan(0);
            expect(result.metrics['eval.reward_events_per_1k.scavenge'].value).toBeGreaterThan(0);
            expect(result.worldHash).toBe(RECORDED_WORLD_HASH);
            const digest = createHash('sha256').update(JSON.stringify(result.metrics)).digest('hex');
            expect(digest).toBe(RECORDED_METRICS_SHA256);
        },
    );
});
