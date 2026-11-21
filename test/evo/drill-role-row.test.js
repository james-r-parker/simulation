import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { DEFEND_GOALS } from '../../js/evo/drill-role-defend.js';
import { barOf, rowOf } from '../../js/evo/drill-role-row.js';

const SHOVE = { defenderRepelEnergy: 40, defenderRepelImpulse: 4 };
/** The defender row's own search at the shove arm: slowing the damping makes the defence reachable. */
const REACHABLE = { ...SHOVE, damping: 0.7125 };

describe('rowOf', () => {
    it('is the budget row of the config, and the same object for the same config object', () => {
        const config = createConfig();
        const row = rowOf('scout:predator', config);
        expect(row.name).toBe('scout:predator');
        expect(rowOf('scout:predator', config)).toBe(row);
        expect(rowOf('defender:predator', config)).not.toBe(row);
        expect(rowOf('scout:predator', createConfig())).not.toBe(row);
    });
});

describe('barOf', () => {
    it('reads the scout row at the defaults as tight and passable, with 3 ticks of slack', () => {
        expect(barOf('scout:predator', createConfig())).toEqual({
            row: 'scout:predator',
            status: 'tight',
            binding: 'turn',
            passable: true,
            slackTicks: 3,
        });
    });

    it('reads the defender row at the defaults as impossible: the shove is off, so there is no passable bar', () => {
        const bar = barOf('defender:predator', createConfig(), DEFEND_GOALS);
        expect(bar).toEqual({
            row: 'defender:predator',
            status: 'impossible',
            binding: 'repel: off',
            passable: false,
            slackTicks: null,
        });
        expect(barOf('defender:predator', createConfig(SHOVE), DEFEND_GOALS).passable).toBe(false);
    });

    it('takes the defence as a goal apart from the smoke: the row is impossible but the defence can be reached', () => {
        const bar = barOf('defender:predator', createConfig(REACHABLE), DEFEND_GOALS);
        expect(bar).toMatchObject({ status: 'impossible', passable: true, slackTicks: 30 });
        expect(barOf('defender:predator', createConfig(REACHABLE)).passable).toBe(false);
    });

    it('leaves out the steps the row does not read: a goal of only those is no goal', () => {
        const config = createConfig();
        expect(rowOf('defender:predator', config).cells.turn.status).toBe('n/a');
        expect(barOf('defender:predator', config, [['turn']]).passable).toBe(false);
        expect(barOf('defender:predator', config, [['turn'], ['hear']])).toMatchObject({
            passable: true,
            slackTicks: 51,
        });
    });
});
