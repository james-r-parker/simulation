// Generated liveness readings are exported for registry families to consume.

import { describe, expect, it } from 'vitest';
import { LIVENESS } from '../../../js/evo/metric-registry/liveness.js';

describe('generated metric liveness', () => {
    it('starts empty until a reference eval report is recorded', () => {
        expect(LIVENESS).toEqual({});
        expect(Object.isFrozen(LIVENESS)).toBe(true);
    });
});
