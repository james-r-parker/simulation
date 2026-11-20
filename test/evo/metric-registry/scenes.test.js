// The closed set of scene names and the `scenes` field of a registry entry.

import { describe, expect, it } from 'vitest';
import { entry } from '../../../js/evo/metric-registry/entry.js';
import { FAILURES, GOALS, PRINCIPLE_SCENES, SCENES } from '../../../js/evo/metric-registry/scenes.js';

describe('SCENES', () => {
    it('holds the 15 scenes, the 5 failures and the 4 goals, each once, frozen', () => {
        expect(PRINCIPLE_SCENES).toHaveLength(15);
        expect(FAILURES).toHaveLength(5);
        expect(GOALS).toHaveLength(4);
        expect(SCENES).toHaveLength(24);
        expect(new Set(SCENES).size).toBe(24);
        expect(Object.isFrozen(SCENES)).toBe(true);
    });
});

describe('entry scenes field', () => {
    const fields = {
        module: 'js/evo/metrics.js',
        meaning: 'm',
        counts: 'c',
        unit: 'ticks',
        direction: /** @type {const} */ ('higher'),
        nullWhen: ['none'],
    };

    it('is absent unless the author writes it', () => {
        expect(entry('core', fields)).not.toHaveProperty('scenes');
    });

    it('keeps the scenes the author wrote', () => {
        expect(entry('core', { ...fields, scenes: ['A real chase', 'G3'] }).scenes).toEqual(['A real chase', 'G3']);
    });
});
