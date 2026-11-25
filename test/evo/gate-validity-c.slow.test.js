// The committed ladder's gates against the scripted references (training-stages.md, Gates, Validity) at a gate checkpoint's
// trial count: the drills of group `c` (test/evo/helpers/gate-validity-ladder.js).

import { describe, expect, it } from 'vitest';
import { scaleTimeout } from '../../scripts/lib/test-timeout.mjs';
import { GROUPS, checkedRows } from './helpers/gate-validity-ladder.js';

describe('a frozen copy of the committed ladder, the prey-ahead and prey-crossing drills', () => {
    it(
        'has a reference that passes each drill condition and random brains that fail it, on the gate seed',
        () => {
            const rows = checkedRows(GROUPS.c);
            expect(rows.length).toBeGreaterThan(0);
        },
        scaleTimeout(120000),
    );
});
