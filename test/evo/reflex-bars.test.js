import { describe, expect, it } from 'vitest';
import { createPreStep5Config } from '../helpers/pre-step5.js';
import { reflexBars } from '../../js/evo/reflex-bars.js';
import { HAND_SET, NO_ROW } from '../../js/evo/reflex-bars-hand.js';
import { swingTicks } from '../../js/evo/role-budget-kinematics.js';
import { roleParams } from '../../js/evo/role-budget-params.js';
import { FORAGER_TURN } from '../../js/evo/role-budget-warn.js';

const defaultBars = () => reflexBars(createPreStep5Config());
const bar = (/** @type {any} */ bars, /** @type {string} */ name) =>
    bars.sources.find((/** @type {any} */ s) => s.bar === name);

describe('reflexBars at the defaults', () => {
    const bars = defaultBars();

    it('derives the forager turn away from the scout row: the swing over the swing plus the turn step slack', () => {
        const swing = swingTicks(FORAGER_TURN, roleParams(createPreStep5Config(), 'forager').turnRate.start);
        const source = bar(bars, 'role.turnAway.forager');
        expect(source).toMatchObject({ source: 'budget', row: 'scout:predator', rowStatus: 'ok' });
        expect(bars.role.turnAway.forager).toBeCloseTo(swing / (Math.ceil(swing) + 16), 12);
        expect(bars.role.turnAway.forager).toBeGreaterThan(HAND_SET.role.turn);
        expect(bars.role.turnAway.forager).toBeLessThan(1);
    });

    it('takes the alarm bar from the config rule the sim fires on', () => {
        expect(bars.role.alarm).toBe(createPreStep5Config().alarmThreshold);
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

    it('derives the reproducer flight and the herd bars the rows of PRs 602 and 603 give, and keeps no TODO bar', () => {
        expect(bar(bars, 'role.turnAway.reproducer')).toMatchObject({ source: 'budget', row: 'scout:predator' });
        expect(bars.role.turnAway.reproducer).toBeGreaterThan(HAND_SET.role.turn);
        expect(bar(bars, 'role.herdTurn.forager')).toMatchObject({ source: 'budget', row: 'forager:herd' });
        expect(bar(bars, 'role.herdThrust.scout')).toMatchObject({ source: 'budget', row: 'scout:herd' });
        expect(bars.role.herdThrust.scout).toBeGreaterThan(HAND_SET.role.herdThrust);
        expect(bars.sources.some((s) => s.note.includes('TODO'))).toBe(false);
        expect(bar(bars, 'forager.fleeThrust')).toMatchObject({ source: 'hand-set', rowStatus: 'n/a' });
    });

    it('has a source for every bar of a spec, and each bar a source names is one of the bars', () => {
        const names = bars.sources.map((s) => s.bar);
        expect(new Set(names).size).toBe(names.length);
        for (const spec of ['forager', 'predator', 'reproducer', 'scout', 'defender']) {
            for (const kind of ['herdTurn', 'herdThrust']) {
                expect(names).toContain(`role.${kind}.${spec}`);
                expect(typeof (/** @type {any} */ (bars.role)[kind][spec])).toBe('number');
            }
        }
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
        expect(reflexBars(createPreStep5Config())).toBe(bars);
    });
});

describe('a change moves a bar', () => {
    it('a slower forager turn rate needs a larger share of the turn range', () => {
        const slow = reflexBars(createPreStep5Config({ maxTurn: createPreStep5Config().maxTurn * 0.8 }));
        expect(slow.role.turnAway.forager).toBeGreaterThan(defaultBars().role.turnAway.forager);
    });

    it('a faster turn rate needs a smaller share', () => {
        const fast = reflexBars(createPreStep5Config({ maxTurn: 0.5 }));
        expect(fast.role.turnAway.forager).toBeLessThan(defaultBars().role.turnAway.forager);
        expect(bar(fast, 'role.turnAway.forager').source).toBe('budget');
    });

    it('the alarm rule moves the alarm bar, and a model option moves the turn bar through the slack it leaves', () => {
        expect(reflexBars(createPreStep5Config({ alarmThreshold: 0.4 })).role.alarm).toBe(0.4);
        const late = reflexBars(createPreStep5Config(), { reactionTicks: 3 });
        expect(late.role.turnAway.forager).toBeGreaterThan(defaultBars().role.turnAway.forager);
    });

    it('a config whose scout row leaves no turn slack falls back to the hand-set bar and records the row status', () => {
        const mute = reflexBars(createPreStep5Config({ specialisations: { scout: { body: { callRadius: 0.05 } } } }));
        const source = bar(mute, 'role.turnAway.forager');
        expect(mute.role.turnAway.forager).toBe(HAND_SET.role.turn);
        expect(source).toMatchObject({ source: 'hand-set', row: 'scout:predator', rowStatus: 'impossible' });
    });

    it('a faster herd moves the thrust bars, and a quicker turn rate the herd turn bars', () => {
        const slow = reflexBars(createPreStep5Config({ herdRunSpeed: 4 }));
        expect(slow.role.herdThrust.scout).toBeLessThan(defaultBars().role.herdThrust.scout);
        expect(bar(slow, 'role.herdThrust.forager').source).toBe('budget');
        const quick = reflexBars(createPreStep5Config({ maxTurn: 0.5 }));
        expect(quick.role.herdTurn.forager).toBeLessThan(defaultBars().role.herdTurn.forager);
        expect(quick.role.herdTurn.scout).toBeLessThan(defaultBars().role.herdTurn.scout);
        expect(quick.role.turnAway.reproducer).toBeLessThan(defaultBars().role.turnAway.reproducer);
    });

    it('a thrust the config gives more of needs a smaller share to clear the herd', () => {
        const strong = reflexBars(createPreStep5Config({ maxThrust: 0.9 }));
        expect(strong.role.herdThrust.scout).toBeLessThan(defaultBars().role.herdThrust.scout);
    });

    it('refuses a model option that is not one', () => {
        expect(() => reflexBars(createPreStep5Config(), { nope: 1 })).toThrow(/unknown option/);
    });
});
