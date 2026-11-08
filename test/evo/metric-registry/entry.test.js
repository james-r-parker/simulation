// The registry entry helper: the unmeasured fields start empty and the entry is frozen.

import { describe, expect, it } from 'vitest';
import { entry } from '../../../js/evo/metric-registry/entry.js';

describe('entry', () => {
    const built = entry('core', {
        module: 'js/evo/metrics.js',
        meaning: 'm',
        counts: 'c',
        unit: 'ticks',
        direction: 'higher',
        nullWhen: ['none'],
        arithmetic: 'test/evo/metrics.test.js',
    });

    it('keeps what the author wrote and names the family', () => {
        expect(built).toMatchObject({ family: 'core', unit: 'ticks', nullWhen: ['none'] });
        expect(built.tests).toEqual({ arithmetic: 'test/evo/metrics.test.js', source: '' });
    });

    it('starts every unmeasured field empty', () => {
        expect(built).toMatchObject({
            expectedFlat: null,
            renamedFrom: [],
            deprecated: null,
            liveness: null,
            power: null,
            minSeeds: null,
        });
    });

    it('takes the source test and the deprecation reason when the author gives them', () => {
        const given = entry('core', {
            module: 'js/evo/metrics.js',
            meaning: 'm',
            counts: 'c',
            unit: 'ticks',
            direction: 'higher',
            nullWhen: [],
            source: 'test/evo/metric-source-core.test.js',
            deprecated: 'no plantable answer',
        });
        expect(given.tests.source).toBe('test/evo/metric-source-core.test.js');
        expect(given.deprecated).toBe('no plantable answer');
    });

    it('is frozen', () => {
        expect(Object.isFrozen(built)).toBe(true);
    });
});
