import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { defaultBars, reflexBars } from '../../js/evo/reflex-bars.js';
import { HAND_SET, NO_ROW, TODO_ROWS } from '../../js/evo/reflex-bars-hand.js';
import { swingTicks } from '../../js/evo/role-budget-kinematics.js';
import { roleParams } from '../../js/evo/role-budget-params.js';
import { FORAGER_TURN } from '../../js/evo/role-budget-warn.js';

const bar = (/** @type {any} */ bars, /** @type {string} */ name) =>
    bars.sources.find((/** @type {any} */ s) => s.bar === name);

describe('reflexBars at the defaults', () => {
    const bars = defaultBars();

    it('derives the forager turn away from the scout row: the swing over the swing plus the turn step slack', () => {
        const swing = swingTicks(FORAGER_TURN, roleParams(createConfig(), 'forager').turnRate.start);
        const source = bar(bars, 'role.turnAway.forager');
        expect(source).toMatchObject({ source: 'budget', row: 'scout:predator', rowStatus: 'tight' });
        expect(bars.role.turnAway.forager).toBeCloseTo(swing / (Math.ceil(swing) + 3), 12);
        expect(bars.role.turnAway.forager).toBeGreaterThan(HAND_SET.role.turn);
        expect(bars.role.turnAway.forager).toBeLessThan(1);
    });

    it('takes the alarm bar from the config rule the sim fires on', () => {
        expect(bars.role.alarm).toBe(createConfig().alarmThreshold);
        expect(bar(bars, 'role.alarm')).toMatchObject({ source: 'config', row: 'scout:predator' });
    });

    it('invents no bar from a row that is impossible: the hunter and defender bars stay hand-set and say why', () => {
        for (const name of ['predator.turn', 'predator.thrust', 'role.sprint.far', 'role.bite']) {
            expect(bar(bars, name)).toMatchObject({
                source: 'hand-set',
                row: 'predator:forager',
                rowStatus: 'impossible',
            });
        }
        expect(bar(bars, 'role.turn')).toMatchObject({
            source: 'hand-set',
            row: 'defender:predator',
            rowStatus: 'impossible',
        });
        expect(bars.predator).toEqual(HAND_SET.predator);
        expect(bars.role.sprint).toEqual(HAND_SET.role.sprint);
    });

    it('keeps a TODO bar for each row that is not on main, naming the row and the pull request', () => {
        for (const { bar: name, row, pr } of TODO_ROWS) {
            const source = bar(bars, name);
            expect(source).toMatchObject({ source: 'hand-set', row, rowStatus: 'not built' });
            expect(source.note).toContain(`TODO`);
            expect(source.note).toContain(pr);
        }
        expect(bars.role.turnAway.reproducer).toBe(HAND_SET.role.turn);
    });

    it('labels every other hand-set bar as one no row reads', () => {
        for (const { bar: name, why } of NO_ROW) {
            expect(bar(bars, name)).toMatchObject({ source: 'hand-set', rowStatus: 'n/a' });
            expect(bar(bars, name).note).toContain(why);
        }
    });

    it('is frozen and read once per config', () => {
        expect(Object.isFrozen(bars)).toBe(true);
        expect(Object.isFrozen(bars.role)).toBe(true);
        expect(reflexBars(createConfig())).toBe(bars);
    });
});

describe('a change moves a bar', () => {
    it('a slower forager turn rate needs a larger share of the turn range', () => {
        const slow = reflexBars(createConfig({ maxTurn: createConfig().maxTurn * 0.8 }));
        expect(slow.role.turnAway.forager).toBeGreaterThan(defaultBars().role.turnAway.forager);
    });

    it('a faster turn rate needs a smaller share', () => {
        const fast = reflexBars(createConfig({ maxTurn: 0.5 }));
        expect(fast.role.turnAway.forager).toBeLessThan(defaultBars().role.turnAway.forager);
        expect(bar(fast, 'role.turnAway.forager').source).toBe('budget');
    });

    it('the alarm rule moves the alarm bar, and a model option moves the turn bar through the slack it leaves', () => {
        expect(reflexBars(createConfig({ alarmThreshold: 0.4 })).role.alarm).toBe(0.4);
        const late = reflexBars(createConfig(), { reactionTicks: 3 });
        expect(late.role.turnAway.forager).toBeGreaterThan(defaultBars().role.turnAway.forager);
    });

    it('a config whose scout row leaves no turn slack falls back to the hand-set bar and records the row status', () => {
        const mute = reflexBars(createConfig({ specialisations: { scout: { body: { callRadius: 0.05 } } } }));
        const source = bar(mute, 'role.turnAway.forager');
        expect(mute.role.turnAway.forager).toBe(HAND_SET.role.turn);
        expect(source).toMatchObject({ source: 'hand-set', row: 'scout:predator', rowStatus: 'impossible' });
    });

    it('refuses a model option that is not one', () => {
        expect(() => reflexBars(createConfig(), { nope: 1 })).toThrow(/unknown option/);
    });
});
