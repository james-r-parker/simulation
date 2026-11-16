import { describe, expect, it } from 'vitest';
import {
    AGES,
    HABITATS,
    independence,
    playCondition,
    releaseMatrix,
    reportByCondition,
} from '../../js/evo/crossplay-release.js';
import { COMBAT_CONTROLLERS } from '../../js/evo/scripted-combat.js';
import { createRng, fork } from '../../js/sim/rng.js';

/**
 * @param {'hunter' | 'stand'} kind a scripted predator that closes and bites, or one that stands
 * @param {number} spec the specialisation
 * @param {string} [name] the subject's name
 * @returns {import('../../js/evo/memory-probe-run.js').Subject} a reference subject (a controller per world)
 */
function scripted(kind, spec, name = kind) {
    const made = new WeakMap();
    const act = (/** @type {any} */ world) => {
        if (!made.has(world)) {
            made.set(world, COMBAT_CONTROLLERS.hunter({ world, rng: fork(createRng(9), 'test') }));
        }
        made.get(world)(world);
    };
    return { name, id: 0, spec, weights: null, act: kind === 'stand' ? () => {} : act };
}

const ME = { run: 'sha:cur:0', seedOffset: 0 };
const candidate = { provenance: ME, poolRuns: ['sha:cur:0', 'sha:pool:64'] };

describe('independence', () => {
    it('is independent only from another run, outside the pool, on another seed offset', () => {
        expect(independence(candidate, { run: 'sha:other:128', seedOffset: 128 })).toEqual({
            independent: true,
            reason: null,
        });
        expect(independence(candidate, ME).independent).toBe(false);
        expect(independence(candidate, { run: 'sha:pool:64', seedOffset: 64 }).reason).toMatch(/pool/);
        expect(independence(candidate, { run: 'sha:x:0', seedOffset: 0 }).reason).toMatch(/seed offset/);
    });
});

describe('playCondition', () => {
    const prey = scripted('stand', 0);
    const hunter = scripted('hunter', 1);
    const trials = 6;

    it.each(AGES)(
        'has a hunter that closes and bites kill a standing %s in the open, and one that stands never',
        (age) => {
            const open = playCondition(hunter, prey, { age, habitat: 'open', trials });
            const stander = playCondition(scripted('stand', 1), prey, { age, habitat: 'open', trials });
            expect(open.kills).toBeGreaterThan(trials - 2);
            expect(open.failedCost).toBeNull();
            expect(stander.kills).toBe(0);
            expect(stander.failedCost).toBeGreaterThan(0);
        },
    );

    it.each(AGES)('makes sparse encounters (the %s prey at the edge of sight) catch less than open ground', (age) => {
        const open = playCondition(hunter, prey, { age, habitat: 'open', trials });
        const sparse = playCondition(hunter, prey, { age, habitat: 'sparse', trials });
        expect(sparse.kills).toBeLessThan(open.kills);
    });

    it('does not let cover (a rock ring around the prey) catch more than open ground', () => {
        const open = playCondition(hunter, prey, { age: 'mature', habitat: 'open', trials });
        const cover = playCondition(hunter, prey, { age: 'mature', habitat: 'cover', trials });
        expect(cover.kills).toBeLessThanOrEqual(open.kills);
    });

    it('stages a depleted patch with a predator holding the least energy a staged agent has', () => {
        const stander = playCondition(scripted('stand', 1), prey, { age: 'mature', habitat: 'depleted', trials: 2 });
        expect(stander).toMatchObject({ kills: 0, trials: 2 });
        expect(stander.failedCost).toBeGreaterThan(0);
    });

    it('replays bit for bit', () => {
        const again = playCondition(hunter, prey, { age: 'mature', habitat: 'sparse', trials });
        expect(again).toEqual(playCondition(hunter, prey, { age: 'mature', habitat: 'sparse', trials }));
    });
});

describe('releaseMatrix and reportByCondition', () => {
    const opponents = [
        { subject: scripted('stand', 0, 'forager-a'), provenance: { run: 'sha:other:128', seedOffset: 128 } },
        { subject: scripted('stand', 3, 'scout-b'), provenance: ME },
    ];
    const rows = releaseMatrix(scripted('hunter', 1), { candidate, opponents, trials: 3 });

    it('plays every opponent in every age and habitat and tags the guild and the independence', () => {
        expect(rows).toHaveLength(opponents.length * AGES.length * HABITATS.length);
        expect(new Set(rows.map((r) => r.guild))).toEqual(new Set(['forager', 'scout']));
        expect(rows.filter((r) => r.independent).every((r) => r.opponent === 'forager-a')).toBe(true);
        expect(rows.find((r) => !r.independent)?.notIndependent).toMatch(/own run/);
    });

    it('pools the rows per condition with Wilson bounds and the failed-pursuit cost', () => {
        const byHabitat = reportByCondition(rows, ['habitat']);
        expect(byHabitat.map((g) => g.key.habitat)).toEqual([...HABITATS]);
        for (const group of byHabitat) {
            expect(group.trials).toBe(opponents.length * AGES.length * 3);
            expect(group.low).toBeLessThanOrEqual(group.killShare);
            expect(group.high).toBeGreaterThanOrEqual(group.killShare);
        }
        const sparse = byHabitat.find((g) => g.key.habitat === 'sparse');
        const open = byHabitat.find((g) => g.key.habitat === 'open');
        expect(sparse?.killShare).toBeLessThan(open?.killShare ?? 0);
        expect(sparse?.failedCost).not.toBeNull();
    });

    it('reports independent opponents apart from the rest', () => {
        const byIndependence = reportByCondition(rows, ['independent']);
        expect(byIndependence.map((g) => [g.key.independent, g.trials])).toEqual([
            [true, AGES.length * HABITATS.length * 3],
            [false, AGES.length * HABITATS.length * 3],
        ]);
    });
});
