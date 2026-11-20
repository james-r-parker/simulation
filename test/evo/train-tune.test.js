import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ladderKey, proposeArms, withDefaults } from '../../js/evo/train-tune.js';

const ladder = [
    { name: 'nursery', plateauStop: 6, gate: [{ read: 'a', min: 1 }], minGenerations: 10 },
    { name: 'hunt-contact', plateauStop: 6, gate: [{ read: 'b', min: 1 }], minGenerations: 10 },
    { name: 'hunt-weak', preyShare: 0.9, plateauStop: 6, gate: [{ read: 'c', min: 1 }] },
    { name: 'hunt-mid', plateauStop: 3, gate: [{ read: 'd', min: 1 }] },
    { name: 'hunt', plateauStop: 6, gate: [{ read: 'e', min: 1 }] },
];
const spec = (/** @type {object} */ extra = {}) => ({
    curriculum: 'x.json',
    until: 'hunt-mid',
    tunables: [{ key: 'preyShare', stage: 'hunt-weak', values: [0.7, 1.0] }],
    ...extra,
});

describe('withDefaults', () => {
    it('lays in the defaults: 3 arms, offsets 0..120 and 128..248 by 8, 16 world seeds', () => {
        const out = withDefaults(spec());
        expect(out).toMatchObject({ maxArms: 2, worldSeeds: 16 });
        expect(out.tuneOffsets).toEqual([0, 8, 16, 24, 32, 40, 48, 56, 64, 72, 80, 88, 96, 104, 112, 120]);
        expect(out.holdoutOffsets.slice(0, 2)).toEqual([128, 136]);
        expect(out.holdoutOffsets.at(-1)).toBe(248);
    });

    it('keeps what the spec sets', () => {
        const out = withDefaults(spec({ maxArms: 1, tuneOffsets: [0, 8], holdoutOffsets: [3], worldSeeds: 2 }));
        expect(out).toMatchObject({ maxArms: 1, tuneOffsets: [0, 8], holdoutOffsets: [3], worldSeeds: 2 });
    });

    it.each([
        [{ ...spec(), curriculum: 3 }, 'curriculum'],
        [{ ...spec(), tunables: [] }, 'tunables'],
        [{ ...spec(), tunables: [{ key: 'a', values: [] }] }, 'tunable'],
        [{ ...spec(), tunables: [{ name: 'a', values: ['x'] }] }, 'tunable'],
        [{ ...spec(), tunables: [{ key: 'a', stage: 4, values: [1] }] }, 'tunable'],
        [{ ...spec(), maxArms: 0 }, 'maxArms'],
        [{ ...spec(), worldSeeds: 1.5 }, 'worldSeeds'],
        [{ ...spec(), tuneOffsets: [] }, 'tuneOffsets'],
        [{ ...spec(), holdoutOffsets: [1.5] }, 'holdoutOffsets'],
    ])('refuses a malformed spec (%#)', (bad, word) => {
        expect(() => withDefaults(/** @type {any} */ (bad))).toThrow(word);
    });

    it('refuses a missing spec', () => {
        expect(() => withDefaults(/** @type {any} */ (undefined))).toThrow('curriculum');
    });
});

describe('ladderKey', () => {
    it('is stable and changes with the ladder', () => {
        expect(ladderKey(ladder)).toBe(ladderKey(structuredClone(ladder)));
        expect(ladderKey(ladder)).toMatch(/^[0-9a-f]{8}$/);
        expect(ladderKey(ladder)).not.toBe(ladderKey(ladder.slice(1)));
    });
});

describe('proposeArms', () => {
    it('proposes a stage entry key as a stages overlay, the nearest value first', () => {
        const arms = proposeArms(spec(), ladder, []);
        expect(arms.map((a) => a.name)).toEqual(['preyShare-hunt-weak-1', 'preyShare-hunt-weak-0.7']);
        expect(arms[0]).toEqual({
            name: 'preyShare-hunt-weak-1',
            signature: 'stages.hunt-weak.preyShare=1',
            overlay: { stages: { 'hunt-weak': { preyShare: 1 } } },
        });
    });

    it('skips a value equal to the current one', () => {
        const arms = proposeArms(
            spec({ tunables: [{ key: 'preyShare', stage: 'hunt-weak', values: [0.9, 0.7] }] }),
            ladder,
            [],
        );
        expect(arms.map((a) => a.signature)).toEqual(['stages.hunt-weak.preyShare=0.7']);
    });

    it('lays a stage-less key over every gated stage up to until that differs, and skips stages already at the value', () => {
        const arms = proposeArms(spec({ tunables: [{ key: 'plateauStop', values: [3] }] }), ladder, []);
        expect(arms).toHaveLength(1);
        expect(arms[0].signature).toBe('stages.*.plateauStop=3');
        expect(Object.keys(arms[0].overlay.stages ?? {})).toEqual(['nursery', 'hunt-contact', 'hunt-weak']);
    });

    it('proposes nothing for a stage-less key every gated stage already has, or a stage that is not there', () => {
        const same = ladder.map((e) => ({ ...e, plateauStop: 3 }));
        expect(proposeArms(spec({ tunables: [{ key: 'plateauStop', values: [3] }] }), same, [])).toEqual([]);
        expect(proposeArms(spec({ tunables: [{ key: 'preyShare', stage: 'nope', values: [1] }] }), ladder, [])).toEqual(
            [],
        );
    });

    it('proposes a trainer option as a train overlay, against the spec train and the trainer defaults', () => {
        const tunables = [{ key: 'episodes', values: [16, 32, 48] }];
        const base = proposeArms(spec({ tunables }), ladder, []);
        expect(base.map((a) => a.signature)).toEqual(['train.episodes=16', 'train.episodes=48']);
        expect(base[0].overlay).toEqual({ train: { episodes: 16 } });
        const set = proposeArms(spec({ tunables, train: { episodes: 16 } }), ladder, []);
        expect(set.map((a) => a.signature)).toEqual(['train.episodes=32', 'train.episodes=48']);
        const ticks = proposeArms(spec({ tunables: [{ key: 'ticks', values: [100] }] }), ladder, []);
        expect(ticks.map((a) => a.signature)).toEqual(['train.ticks=100']);
    });

    it('goes round-robin over the tunables and stops at maxArms', () => {
        const tunables = [
            { key: 'preyShare', stage: 'hunt-weak', values: [0.7, 1.0] },
            { key: 'episodes', values: [16, 48] },
            { key: 'minGenerations', stage: 'hunt-contact', values: [5, 20] },
        ];
        const all = proposeArms(spec({ tunables, maxArms: 6 }), ladder, []).map((a) => a.signature);
        expect(all).toEqual([
            'stages.hunt-weak.preyShare=1',
            'train.episodes=16',
            'stages.hunt-contact.minGenerations=5',
            'stages.hunt-weak.preyShare=0.7',
            'train.episodes=48',
            'stages.hunt-contact.minGenerations=20',
        ]);
        expect(proposeArms(spec({ tunables }), ladder, []).map((a) => a.signature)).toEqual(all.slice(0, 2));
    });

    it('is deterministic', () => {
        const tunables = [
            { key: 'plateauStop', values: [10, 3] },
            { key: 'episodes', values: [16, 48] },
        ];
        expect(proposeArms(spec({ tunables }), ladder, [])).toEqual(proposeArms(spec({ tunables }), ladder, []));
    });

    it('skips an arm already screened at this ladder hash, but not one screened at another', () => {
        const hash = ladderKey(ladder);
        const history = [
            { ladderHash: hash, signature: 'stages.hunt-weak.preyShare=1' },
            { ladderHash: 'other', signature: 'stages.hunt-weak.preyShare=0.7' },
        ];
        expect(proposeArms(spec(), ladder, history).map((a) => a.signature)).toEqual([
            'stages.hunt-weak.preyShare=0.7',
        ]);
    });

    it('treats an unknown until as the whole ladder', () => {
        const arms = proposeArms(spec({ until: 'nope', tunables: [{ key: 'plateauStop', values: [3] }] }), ladder, []);
        expect(Object.keys(arms[0].overlay.stages ?? {})).toContain('hunt');
    });

    it('reads a frozen copy of the shipped spec and ladder: two arms, the first on the hunt-weak prey share 0.7', () => {
        const shipped = JSON.parse(readFileSync('test/fixtures/train-tune.json', 'utf8'));
        const real = JSON.parse(readFileSync('test/fixtures/train-ladder.json', 'utf8'));
        const arms = proposeArms(shipped, real, []);
        expect(arms).toHaveLength(2);
        expect(arms[0].signature).toBe('stages.hunt-weak.preyShare=0.7');
        expect(arms[1].signature).toBe('stages.hunt-contact.minGenerations=5');
    });

    it('proposes bundled tunables setting several stage or train keys at once, and skips unchanged bundles', () => {
        const tunables = [
            {
                name: 'nursery-budget',
                stage: 'nursery',
                values: [
                    { maxGenerations: 80, plateauStop: 0 },
                    { maxGenerations: 40, plateauStop: 6 },
                ],
            },
            {
                key: 'train-budget',
                values: [
                    { episodes: 32, checkpointEvery: 10 },
                    { episodes: 48, checkpointEvery: 5 },
                ],
            },
        ];
        const same = [{ name: 'nursery', maxGenerations: 40, plateauStop: 6, gate: [{ read: 'a', min: 1 }] }];
        const arms = proposeArms(spec({ tunables, maxArms: 4 }), same, []);
        expect(arms.map((a) => a.signature)).toEqual([
            'stages.nursery.maxGenerations=80,plateauStop=0',
            'train.checkpointEvery=5,episodes=48',
        ]);
        expect(arms[0].overlay).toEqual({ stages: { nursery: { maxGenerations: 80, plateauStop: 0 } } });
        expect(arms[1].overlay).toEqual({ train: { checkpointEvery: 5, episodes: 48 } });
        const hash = ladderKey(same);
        expect(
            proposeArms(spec({ tunables }), same, [{ ladderHash: hash, signature: arms[0].signature }]).map(
                (a) => a.signature,
            ),
        ).toEqual(['train.checkpointEvery=5,episodes=48']);
    });
});
