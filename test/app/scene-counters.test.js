import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createInterpolated } from '../../js/app/interpolate.js';
import {
    advanceSeason,
    createSceneCounters,
    noteFrame,
    noteSceneEffect,
    resetSceneCounters,
    SCENES,
    SEASON_WINDOW,
    sceneRows,
} from '../../js/app/scene-counters.js';
import { ready } from './helpers/interface-setup.js';

const KIND = ready.layout.effectKinds;
const SEASON = ready.info.seasonLength;
const BORN = ready.layout.bornCauses;
const DEATH = ready.layout.deathCauses;
const PACK_FLAG = 65536;

/** @returns {ReturnType<typeof createSceneCounters>} counters for the fixture world */
function started() {
    const c = createSceneCounters();
    resetSceneCounters(c, ready);
    return c;
}

/**
 * @param {number} kind an effect kind
 * @param {Record<string, number>} [more] the effect's other fields
 * @returns {any} an effect record
 */
const effect = (kind, more = {}) => ({ kind, tick: 10, x: 1, y: 2, a: 7, b: 0, c: 0, d: 0, ...more });

/** @param {ReturnType<typeof createSceneCounters>} c the counters @param {string} id a scene @returns {any} its row */
const row = (c, id) => sceneRows(c, c.tick).find((r) => r.id === id);

describe('the scene list', () => {
    it('names the 15 scenes of docs/principles.md, in its order', () => {
        const text = readFileSync(new URL('../../docs/principles.md', import.meta.url), 'utf8');
        const section = text.slice(text.indexOf('## Scenes'), text.indexOf('## What to refuse'));
        const names = [...section.matchAll(/^\| ([^|]+?) +\|/gm)]
            .map((m) => m[1])
            .filter((n) => n !== 'Scene' && !n.startsWith('-'));
        expect(SCENES.map((s) => s.name)).toEqual(names);
        expect(SCENES).toHaveLength(15);
    });

    it('gives a signal to nine scenes and none to the other six', () => {
        expect(SCENES.filter((s) => s.signal !== null).map((s) => s.id)).toEqual([
            'chase',
            'abort',
            'call',
            'pack',
            'refuge',
            'scavenge',
            'cross',
            'parent',
            'boom',
        ]);
        const c = started();
        const rows = sceneRows(c, 0);
        expect(rows.filter((r) => r.count === null).map((r) => r.id)).toEqual([
            'patch',
            'condition',
            'season',
            'custom',
            'climate',
            'unnamed',
        ]);
        expect(rows.filter((r) => r.count !== null).every((r) => r.count === 0 && !r.seen)).toBe(true);
    });
});

describe('effects', () => {
    it.each([
        ['ALARM', 'call'],
        ['PACK_CALL', 'pack'],
        ['HERD_DIED', 'scavenge'],
        ['STRAIN_EMERGED', 'boom'],
        ['PATCH_WILTED', 'boom'],
    ])('counts a %s for the %s scene, with who and where', (kind, scene) => {
        const c = started();
        noteSceneEffect(c, effect(KIND[kind], { a: 33, x: 4, y: 5, tick: 12 }));
        expect(row(c, scene)).toMatchObject({ count: 1, genomeId: 33, x: 4, y: 5, seen: true });
    });

    it('counts a birth from a mother for the mother, but not a founder, a floor birth or a motherless one', () => {
        const c = started();
        noteSceneEffect(c, effect(KIND.BORN, { a: 50, c: 9, d: BORN.MATE }));
        noteSceneEffect(c, effect(KIND.BORN, { a: 51, c: 8, d: BORN.SPLIT }));
        noteSceneEffect(c, effect(KIND.BORN, { a: 52, c: 0, d: BORN.MATE }));
        noteSceneEffect(c, effect(KIND.BORN, { a: 53, c: 7, d: BORN.FLOOR }));
        expect(row(c, 'parent')).toMatchObject({ count: 2, genomeId: 8 });
    });

    it('counts a pack kill for the killer, but not a lone kill or a pack death of another cause', () => {
        const c = started();
        const died = (/** @type {number} */ cause, /** @type {number} */ flags, killer = 6) =>
            effect(KIND.DIED, { b: killer, c: cause * 256 + flags });
        noteSceneEffect(c, died(DEATH.EATEN, PACK_FLAG));
        noteSceneEffect(c, died(DEATH.EATEN, 0));
        noteSceneEffect(c, died(DEATH.STARVED, PACK_FLAG));
        noteSceneEffect(c, died(DEATH.EATEN, PACK_FLAG, 0));
        expect(row(c, 'pack')).toMatchObject({ count: 1, genomeId: 6 });
    });

    it('ignores an effect no scene reads, a kind beyond the table and a bite', () => {
        const c = started();
        noteSceneEffect(c, effect(KIND.POLLINATED));
        noteSceneEffect(c, effect(9999));
        noteSceneEffect(c, effect(-1));
        noteSceneEffect(c, effect(KIND.BITE));
        expect(c.counts.every((n) => n === 0)).toBe(true);
    });

    it('works with a world whose layout names nothing', () => {
        const c = createSceneCounters();
        resetSceneCounters(c, {});
        noteSceneEffect(c, effect(KIND.ALARM));
        expect(c.counts.every((n) => n === 0)).toBe(true);
        expect(c.seasonLength).toBe(1);
    });

    it('keeps the newest instance of a scene for the follow, not an older effect that arrives late', () => {
        const c = started();
        noteSceneEffect(c, effect(KIND.ALARM, { a: 1, tick: 100 }));
        noteSceneEffect(c, effect(KIND.ALARM, { a: 2, tick: 50 }));
        expect(row(c, 'call')).toMatchObject({ count: 2, genomeId: 1 });
    });
});

describe('the last four seasons', () => {
    it('sums the current season and the three before, and drops the fourth back', () => {
        const c = started();
        for (let season = 0; season < SEASON_WINDOW + 1; season++) {
            noteSceneEffect(c, effect(KIND.ALARM, { tick: season * SEASON + 1 }));
        }
        expect(row(c, 'call').count).toBe(SEASON_WINDOW);
    });

    it('empties seasons that pass with no effect, when the tick advances', () => {
        const c = started();
        noteSceneEffect(c, effect(KIND.ALARM, { tick: 1 }));
        expect(sceneRows(c, 3 * SEASON).find((r) => r.id === 'call')?.count).toBe(1);
        expect(sceneRows(c, 4 * SEASON).find((r) => r.id === 'call')?.count).toBe(0);
        advanceSeason(c, 40 * SEASON);
        expect(c.season).toBe(40);
    });

    it('does not count an effect from before the window', () => {
        const c = started();
        advanceSeason(c, 10 * SEASON);
        noteSceneEffect(c, effect(KIND.ALARM, { tick: SEASON }));
        expect(row(c, 'call').count).toBe(0);
    });

    it('starts over for a new world', () => {
        const c = started();
        noteSceneEffect(c, effect(KIND.ALARM, { tick: 3 * SEASON }));
        resetSceneCounters(c, ready);
        expect(row(c, 'call')).toMatchObject({ count: 0, seen: false, genomeId: 0 });
        expect(c.season).toBe(0);
    });
});

describe('the frame', () => {
    it('counts the pursuits, aborts, stacks and crossings the frame shows, at the tick the counters know', () => {
        const c = createSceneCounters();
        resetSceneCounters(c, {
            ...ready,
            info: { ...ready.info, terrain: { wallX: 500, refuges: [{ x: 100, y: 100, radius: 50 }] } },
        });
        advanceSeason(c, 5);
        const agents = createInterpolated(16);
        const place = (/** @type {number} */ i, /** @type {number} */ x, /** @type {number} */ genome, spec = 0) => {
            agents.x[i] = x;
            agents.y[i] = 100;
            agents.genomeId[i] = genome;
            agents.spec[i] = spec;
            agents.slot[i] = i;
        };
        agents.count = 4;
        place(0, 100, 11);
        place(1, 101, 12);
        place(2, 102, 13);
        place(3, 450, 90, 1);
        const pursuits = { count: 1, hunter: Int32Array.of(3) };
        noteFrame(c, { agents, pursuits, nowMs: 0, tick: 0 });
        place(3, 550, 90, 1);
        noteFrame(c, { agents, pursuits, nowMs: 300, tick: 300 });
        noteFrame(c, { agents, pursuits: { count: 0, hunter: new Int32Array(1) }, nowMs: 5000, tick: 5000 });
        expect(row(c, 'chase')).toMatchObject({ count: 1, genomeId: 90 });
        expect(row(c, 'abort')).toMatchObject({ count: 1, genomeId: 90 });
        expect(row(c, 'refuge')).toMatchObject({ count: 1, genomeId: 11, x: 100, y: 100 });
        expect(row(c, 'cross')).toMatchObject({ count: 1, genomeId: 90 });
    });
});
