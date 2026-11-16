import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
    PARTITION_SPAN,
    assertDisjoint,
    freezeCandidate,
    partitionManifest,
    partitionRange,
    partitionSeed,
    recordAccess,
} from '../../js/evo/partitions.js';

const TRAIN_SEEDS = JSON.parse(readFileSync(new URL('../../evals/train-seeds.json', import.meta.url), 'utf8'));
const EVAL_SEEDS = JSON.parse(readFileSync(new URL('../../evals/seeds.json', import.meta.url), 'utf8'));

describe('partitionRange and partitionSeed', () => {
    it('gives training, validation and each release its own range, none overlapping', () => {
        const names = ['training', 'validation', 'release-1', 'release-2'];
        const ranges = names.map(partitionRange);
        ranges.forEach((r, i) => {
            expect(r.end - r.start).toBe(PARTITION_SPAN);
            expect(i === 0 || r.start === ranges[i - 1].end).toBe(true);
        });
        expect(partitionSeed('validation', 5)).toBe(PARTITION_SPAN + 5);
    });

    it('keeps the committed training and eval seeds in the training partition, away from validation and release', () => {
        const training = partitionRange('training');
        for (const seed of [...TRAIN_SEEDS, ...EVAL_SEEDS]) {
            expect(seed >= training.start && seed < training.end).toBe(true);
        }
    });

    it('refuses an unknown partition and an index outside it', () => {
        expect(() => partitionRange('test')).toThrow(/unknown "test"/);
        expect(() => partitionRange('release-0')).toThrow(/unknown/);
        expect(() => partitionSeed('validation', PARTITION_SPAN)).toThrow(/outside/);
        expect(() => partitionSeed('validation', -1)).toThrow(/outside/);
    });
});

describe('partitionManifest and assertDisjoint', () => {
    it('records the exact seeds and a hash of the scenarios, stable across key order', () => {
        const a = partitionManifest('validation', { count: 64, scenarios: [{ heading: 90, food: 3 }] });
        const b = partitionManifest('validation', { count: 64, scenarios: [{ food: 3, heading: 90 }] });
        expect(a).toEqual({ partition: 'validation', start: PARTITION_SPAN, count: 64, scenarioHash: b.scenarioHash });
        expect(partitionManifest('validation', { count: 64, scenarios: [] }).scenarioHash).not.toBe(a.scenarioHash);
        expect(() => partitionManifest('validation', { count: PARTITION_SPAN + 1, scenarios: [] })).toThrow(/outside/);
    });

    it('rejects manifests whose seeds overlap, naming both', () => {
        const ok = ['training', 'validation', 'release-1'].map((p) =>
            partitionManifest(p, { count: 10, scenarios: [] }),
        );
        expect(() => assertDisjoint(ok)).not.toThrow();
        const clash = { ...ok[1], partition: 'tuning', start: ok[1].start + 5 };
        expect(() => assertDisjoint([...ok, clash])).toThrow(/validation and tuning share seeds/);
    });
});

describe('recordAccess', () => {
    const frozen = freezeCandidate({ set: 's1', code: 'abc', rulesHash: 'r', curriculumHash: 'c', founders: [1, 2] });

    it('hashes a candidate by its fields', () => {
        expect(frozen.hash).toMatch(/^[0-9a-f]{16}$/);
        expect(freezeCandidate({ ...frozen, set: 's2' }).hash).not.toBe(frozen.hash);
    });

    it('lets training read training, gates read validation, and records every use, resume included', () => {
        let ledger = recordAccess([], { purpose: 'train', partition: 'training' });
        ledger = recordAccess(ledger, { purpose: 'resume', partition: 'training' });
        ledger = recordAccess(ledger, { purpose: 'gate', partition: 'validation' });
        expect(ledger.map((u) => u.purpose)).toEqual(['train', 'resume', 'gate']);
    });

    it('refuses a purpose on the wrong partition: a gate never reads training or release seeds', () => {
        expect(() => recordAccess([], { purpose: 'gate', partition: 'training' })).toThrow(/reads validation seeds/);
        expect(() => recordAccess([], { purpose: 'gate', partition: 'release-1' })).toThrow(/reads validation/);
        expect(() => recordAccess([], { purpose: 'train', partition: 'validation' })).toThrow(/reads training/);
        expect(() => recordAccess([], { purpose: 'exam', partition: 'validation', freeze: 'x' })).toThrow(
            /reads release/,
        );
        expect(() => recordAccess([], { purpose: 'peek', partition: 'training' })).toThrow(/unknown purpose/);
    });

    it('opens a release partition only for a frozen candidate, and for one candidate only', () => {
        expect(() => recordAccess([], { purpose: 'exam', partition: 'release-1' })).toThrow(/needs a frozen candidate/);
        const opened = recordAccess([], { purpose: 'exam', partition: 'release-1', freeze: frozen.hash });
        expect(recordAccess(opened, { purpose: 'exam', partition: 'release-1', freeze: frozen.hash })).toHaveLength(2);
        const revised = freezeCandidate({ ...frozen, set: 's2' }).hash;
        expect(() => recordAccess(opened, { purpose: 'exam', partition: 'release-1', freeze: revised })).toThrow(
            /another candidate; use a new release partition/,
        );
        expect(recordAccess(opened, { purpose: 'exam', partition: 'release-2', freeze: revised })).toHaveLength(2);
    });
});
