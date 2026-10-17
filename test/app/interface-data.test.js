import { describe, expect, it } from 'vitest';
import { columns } from '../../js/app/history.js';
import { createChartData } from '../../js/app/interface-data.js';
import { selectedWorld } from './helpers/inspect-world.js';

const { ready } = selectedWorld();

describe('createChartData', () => {
    it('has no data before the first world and ignores stats', () => {
        const data = createChartData();
        expect(data.data()).toBeNull();
        expect(() => data.stats({ tick: 1 }, 0)).not.toThrow();
    });

    it('records stats into the history and empties it for the next world, keeping the same history', () => {
        const data = createChartData();
        const first = data.ready(ready);
        data.stats({ tick: 7, bySpec: [1, 2, 3, 4, 5] }, 0);
        expect(Array.from(columns(first.history).t)).toEqual([7]);
        const second = data.ready(ready);
        expect(second.history).toBe(first.history);
        expect(columns(second.history).t).toHaveLength(0);
        expect(data.data()).toBe(second);
    });
});
