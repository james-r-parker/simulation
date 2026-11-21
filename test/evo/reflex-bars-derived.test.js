import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { SPEC_NAMES } from '../../js/sim/specs.js';
import { HAND_SET } from '../../js/evo/reflex-bars-hand.js';
import { herdBars, leastCruiseShare, turnAwayBars, turnShare } from '../../js/evo/reflex-bars-derived.js';
import { clearTicks } from '../../js/evo/role-budget-herd.js';
import { matrix } from '../../js/evo/role-budget-matrix.js';
import { validateModel } from '../../js/evo/role-budget-model.js';
import { roleParams } from '../../js/evo/role-budget-params.js';

const MODEL = validateModel({});
const ROWS = ['scout:predator', ...SPEC_NAMES.map((s) => `${s}:herd`)];
const rowsAt = (/** @type {Record<string, any>} */ overrides = {}) => {
    const config = createConfig(overrides);
    return { config, rows: Object.fromEntries(matrix(config, MODEL, ROWS).rows.map((r) => [r.name, r])) };
};
const read = { specs: [...SPEC_NAMES], reaction: MODEL.reactionTicks };

describe('turnShare', () => {
    it('is the swing over the swing rounded up plus the slack, and 1 with no slack on a whole swing', () => {
        expect(turnShare(10.5, 46.5)).toBeCloseTo(10.5 / 57.5, 12);
        expect(turnShare(4, 0)).toBe(1);
        expect(turnShare(10.5, 3)).toBeGreaterThan(turnShare(10.5, 30));
    });
});

describe('leastCruiseShare', () => {
    it('is the least share that clears the half-width in the ticks left, against a scan of every share', () => {
        const { config, rows } = rowsAt({ herdRunSpeed: 4 });
        const { worst } = /** @type {any} */ (rows['forager:herd']).detail;
        const p = roleParams(config, 'forager');
        const left = worst.warning - MODEL.reactionTicks - worst.turn;
        const clears = (/** @type {number} */ s) =>
            clearTicks(
                { ...p, thrust: { ...p.thrust, cruise: p.thrust.cruise * s } },
                { distance: worst.half, sprint: false },
            ) <= left;
        let naive = 0.01;
        while (!clears(naive)) {
            naive += 0.001;
        }
        const share = /** @type {number} */ (leastCruiseShare(p, worst, MODEL.reactionTicks));
        expect(Math.abs(share - naive)).toBeLessThan(0.002);
        expect(clears(share)).toBe(true);
    });

    it('is null when even the full cruise thrust is too slow: the row is met by the sprint gait', () => {
        const { config, rows } = rowsAt();
        const { worst } = /** @type {any} */ (rows['forager:herd']).detail;
        expect(leastCruiseShare(roleParams(config, 'forager'), worst, MODEL.reactionTicks)).toBeNull();
    });
});

describe('turnAwayBars', () => {
    it('derives the forager and the reproducer from the warn chain at their own turn rates', () => {
        const { config, rows } = rowsAt();
        const { turnAway, sources } = turnAwayBars(config, MODEL, rows['scout:predator']);
        expect(turnAway.forager).toBeGreaterThan(HAND_SET.role.turn);
        expect(turnAway.reproducer).toBeCloseTo(turnAway.forager, 12);
        expect(sources.map((s) => [s.bar, s.source, s.row])).toEqual([
            ['role.turnAway.forager', 'budget', 'scout:predator'],
            ['role.turnAway.reproducer', 'budget', 'scout:predator'],
        ]);
    });

    it('keeps the hand-set bar, labelled, for a body whose turn step has no slack', () => {
        const { config, rows } = rowsAt({ specialisations: { scout: { body: { callRadius: 0.05 } } } });
        const { turnAway, sources } = turnAwayBars(config, MODEL, rows['scout:predator']);
        expect(turnAway).toEqual({ forager: HAND_SET.role.turn, reproducer: HAND_SET.role.turn });
        expect(sources.every((s) => s.source === 'hand-set' && s.rowStatus === 'impossible')).toBe(true);
    });
});

describe('herdBars at the defaults', () => {
    const { config, rows } = rowsAt();
    const bars = herdBars(config, rows, read);
    const of = (/** @type {string} */ bar) => bars.sources.find((s) => s.bar === bar);

    it('derives the turn for the specs whose row is read, and the thrust where the cruise gait can clear the herd', () => {
        expect(of('role.herdTurn.forager')).toMatchObject({
            source: 'budget',
            row: 'forager:herd',
            rowStatus: 'tight',
        });
        expect(bars.herdTurn.forager).toBeCloseTo(
            turnShare(Math.PI / 2 / roleParams(config, 'forager').turnRate.start, 46.528024),
            5,
        );
        expect(of('role.herdThrust.scout')).toMatchObject({ source: 'budget', row: 'scout:herd' });
        expect(bars.herdThrust.scout).toBeGreaterThan(HAND_SET.role.herdThrust);
        expect(bars.herdThrust.scout).toBeLessThanOrEqual(1);
    });

    it('keeps the hand-set bar, with the row status, for a hunter (n/a), an impossible row and a gait the cruise cannot meet', () => {
        expect(of('role.herdTurn.predator')).toMatchObject({ source: 'hand-set', rowStatus: 'n/a' });
        expect(of('role.herdThrust.predator')?.note).toContain('can hunt');
        for (const spec of ['reproducer', 'defender']) {
            expect(of(`role.herdTurn.${spec}`)).toMatchObject({ source: 'hand-set', rowStatus: 'impossible' });
            expect(bars.herdThrust[spec]).toBe(HAND_SET.role.herdThrust);
        }
        expect(of('role.herdThrust.forager')).toMatchObject({ source: 'hand-set', rowStatus: 'tight' });
        expect(of('role.herdThrust.forager')?.note).toContain('sprint gait');
        expect(bars.herdTurn.predator).toBe(HAND_SET.role.herdTurn);
    });

    it('records two bars for each spec', () => {
        expect(bars.sources).toHaveLength(2 * SPEC_NAMES.length);
        expect(Object.keys(bars.herdTurn)).toEqual([...SPEC_NAMES]);
    });
});
