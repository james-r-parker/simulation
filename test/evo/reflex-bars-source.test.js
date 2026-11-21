import { describe, expect, it } from 'vitest';
import { source } from '../../js/evo/reflex-bars-source.js';

describe('source', () => {
    it('is a hand-set bar with no row until told otherwise', () => {
        expect(source('role.bite', 0, {})).toEqual({
            bar: 'role.bite',
            value: 0,
            source: 'hand-set',
            row: '',
            rowStatus: 'not built',
            note: '',
        });
    });

    it('takes the rest of the record from the caller', () => {
        const record = source('role.alarm', 0.65, { source: 'config', row: 'scout:predator', rowStatus: 'tight' });
        expect(record).toMatchObject({ source: 'config', row: 'scout:predator', rowStatus: 'tight', value: 0.65 });
    });
});
