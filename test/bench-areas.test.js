import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { INFO_DIR as FIXTURE_INFO_DIR } from '../bench/micro/brain-fixture.js';
import { INFO_DIR, benchAreas, benchFiles, readInfo, vitestFilter } from '../scripts/lib/micro-bench.mjs';

const FILES = ['brain.bench.js', 'brain-parts.bench.js', 'brain-sweep.bench.js', 'sense-ray-march.bench.js'];

/** @type {string[]} */
const trees = [];

/**
 * @returns {string} an empty temporary tree
 */
function tree() {
    const dir = mkdtempSync(join(tmpdir(), 'bench-areas-test-'));
    trees.push(dir);
    return dir;
}

afterEach(() => {
    for (const dir of trees.splice(0)) {
        rmSync(dir, { recursive: true, force: true });
    }
});

describe('benchAreas', () => {
    it('names each area once: the file name up to the first dash', () => {
        expect(benchAreas(FILES)).toEqual(['brain', 'sense']);
    });
});

describe('vitestFilter', () => {
    it('passes the filter through without an area', () => {
        expect(vitestFilter(null, 'hebbian', FILES)).toBe('hebbian');
        expect(vitestFilter(null, null, FILES)).toBeNull();
    });

    it('selects the area, and within it the files named <area>-<filter>', () => {
        expect(vitestFilter('brain', null, FILES)).toBe('bench/micro/brain');
        expect(vitestFilter('brain', 'sweep', FILES)).toBe('bench/micro/brain-sweep');
    });

    it('names the known areas when the area has no file', () => {
        expect(() => vitestFilter('food', null, FILES)).toThrow(/no bench area "food"; areas: brain, sense/);
    });
});

describe('benchFiles and readInfo', () => {
    it('lists the bench files in name order, none for a tree without the directory', () => {
        const dir = tree();
        expect(benchFiles(dir)).toEqual([]);
        mkdirSync(join(dir, 'bench/micro'), { recursive: true });
        writeFileSync(join(dir, 'bench/micro/b.bench.js'), '');
        writeFileSync(join(dir, 'bench/micro/a.bench.js'), '');
        writeFileSync(join(dir, 'bench/micro/fixture.js'), '');
        expect(benchFiles(dir)).toEqual(['a.bench.js', 'b.bench.js']);
    });

    it('prints one line per recorded fact, none when no suite wrote any', () => {
        const dir = tree();
        expect(readInfo(dir)).toEqual([]);
        mkdirSync(join(dir, INFO_DIR));
        writeFileSync(join(dir, INFO_DIR, 'brain-sweep.json'), JSON.stringify({ 'real world': 26.9 }));
        expect(readInfo(dir)).toEqual(['brain-sweep: real world: 26.9']);
    });

    it('uses the directory the bench fixture writes to', () => {
        expect(INFO_DIR).toBe(FIXTURE_INFO_DIR);
    });
});
