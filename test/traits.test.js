// `npm run traits` (docs/designs/body-genes.md, "The table"): the rows against the naive formula, the rendering, the
// command line and the committed docs/trait-table.md.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createConfig } from '../js/sim/config.js';
import { laneBases } from '../js/sim/body-lanes.js';
import { SPEC_NAMES } from '../js/sim/specs.js';
import { renderTraitTable, traitRows } from '../scripts/lib/trait-table.mjs';
import { applySetting, main, parseArgs } from '../scripts/traits.mjs';

const DOC = new URL('../docs/trait-table.md', import.meta.url);

/** @type {string[]} */
const dirs = [];
afterEach(() => {
    vi.restoreAllMocks();
    for (const dir of dirs.splice(0)) {
        rmSync(dir, { recursive: true, force: true });
    }
});

/** @returns {string} a fresh temporary directory */
function tmp() {
    const dir = mkdtempSync(join(tmpdir(), 'traits-'));
    dirs.push(dir);
    return dir;
}

/**
 * @param {() => number} run a call of `main`
 * @returns {{code: number, out: string, err: string}} its exit code and what it wrote
 */
function capture(run) {
    let out = '';
    let err = '';
    vi.spyOn(process.stdout, 'write').mockImplementation((text) => ((out += text), true));
    vi.spyOn(process.stderr, 'write').mockImplementation((text) => ((err += text), true));
    const code = run();
    return { code, out, err };
}

describe('traitRows', () => {
    const config = createConfig({
        specialisations: { predator: { genes: { speed: 0.2, size: 0, heatBand: 10 } } },
    });
    const rows = traitRows(config, 'predator');

    it('gives each lane of a trait the base times 1 - span, 1 and 1 + span', () => {
        const base = laneBases(config, 'predator');
        const speed = rows.filter((row) => row.trait === 'speed');
        expect(speed.map((row) => row.lane)).toEqual(['maxVelocity', 'maxThrust']);
        for (const row of speed) {
            const [min, mid, max] = row.values;
            expect(mid).toBeCloseTo(base[row.lane], 12);
            expect(min).toBeCloseTo(base[row.lane] * 0.8, 12);
            expect(max).toBeCloseTo(base[row.lane] * 1.2, 12);
        }
    });

    it('shifts the thresholds of an offset trait by plus or minus its span', () => {
        const base = laneBases(config, 'predator');
        const heat = rows.filter((row) => row.trait === 'heatBand');
        expect(heat).toHaveLength(6);
        for (const row of heat) {
            expect(row.values.map((value) => value - base[row.lane])).toEqual([-10, 0, 10]);
        }
    });

    it('lists the cost lanes of a trait after its effect lanes, at the cost exponent', () => {
        const fake = {
            name: 'speed',
            index: 4,
            kind: /** @type {const} */ ('ratio'),
            effects: [{ lane: 'maxVelocity', power: 1 }],
            costs: [{ lane: 'movementCost', exponentKey: 'costKey', sign: /** @type {const} */ (1) }],
        };
        const costly = /** @type {any} */ ({ ...config, costKey: 2 });
        const out = traitRows(costly, 'predator', /** @type {any} */ ([fake]));
        expect(out.map((row) => row.lane)).toEqual(['maxVelocity', 'movementCost (cost)']);
        const base = laneBases(config, 'predator').movementCost;
        expect(out[1].values[2]).toBeCloseTo(base * 1.2 ** 2, 12);
        expect(out[1].values[0]).toBeCloseTo(base * 0.8 ** 2, 12);
    });

    it('leaves out a trait whose span is 0 and the raw trait', () => {
        const names = new Set(rows.map((row) => row.trait));
        expect(names.has('size')).toBe(false);
        expect(names.has('learn')).toBe(false);
        expect(names.has('vision')).toBe(true);
    });
});

describe('renderTraitTable', () => {
    it('has a section for every spec, and says so when none of its traits varies', () => {
        const none = createConfig({
            specialisations: Object.fromEntries(
                SPEC_NAMES.map((name) => [name, { genes: { size: 0, vision: 0, childShare: 0, learn: 0 } }]),
            ),
        });
        const text = renderTraitTable(none);
        for (const name of SPEC_NAMES) {
            expect(text).toContain(`## ${name}\n`);
        }
        expect(text.match(/No trait varies\./g)).toHaveLength(SPEC_NAMES.length);
        expect(text.endsWith('\n')).toBe(true);
    });

    it('lists a varied trait with its span and lane in a table', () => {
        const text = renderTraitTable(createConfig({ specialisations: { scout: { genes: { speed: 0.25 } } } }));
        expect(text).toMatch(/\| `speed` +\| 0\.25 +\| `maxVelocity` +\|/);
    });
});

describe('the command line', () => {
    it('reads --set as JSON, falling back to text, into a nested path', () => {
        const target = {};
        applySetting(target, 'specialisations.predator.genes.speed=0.2');
        applySetting(target, 'a.b=text');
        expect(target).toEqual({ specialisations: { predator: { genes: { speed: 0.2 } } }, a: { b: 'text' } });
        expect(() => applySetting({}, 'nopath')).toThrow(/a\.b\.c=value/);
        expect(() => applySetting({}, 'a..b=1')).toThrow(/a\.b\.c=value/);
    });

    it('reads --config from a file and refuses an unknown flag or a flag without its value', () => {
        const file = join(tmp(), 'over.json');
        writeFileSync(file, JSON.stringify({ baseSize: 30 }));
        expect(parseArgs(['--config', file, '--set', 'maxAgents=50', '--check'])).toEqual({
            overrides: { baseSize: 30, maxAgents: 50 },
            doc: ['--check'],
        });
        expect(() => parseArgs(['--nope'])).toThrow(/unknown argument/);
        expect(() => parseArgs(['--set'])).toThrow(/needs a value/);
    });

    it('prints the table of the config it is given', () => {
        const { code, out } = capture(() => main(['--set', 'specialisations.scout.genes.speed=0.25']));
        expect(code).toBe(0);
        expect(out).toContain('## scout');
        expect(out).toContain('0.25');
    });

    it('writes and then checks a doc, and says when it is stale', () => {
        const path = join(tmp(), 'trait-table.md');
        expect(capture(() => main(['--check'], { path })).code).toBe(1);
        expect(capture(() => main(['--write'], { path })).code).toBe(0);
        expect(readFileSync(path, 'utf8')).toBe(readFileSync(DOC, 'utf8'));
        expect(capture(() => main(['--check'], { path })).code).toBe(0);
        writeFileSync(path, 'old');
        const stale = capture(() => main(['--check'], { path }));
        expect(stale.code).toBe(1);
        expect(stale.err).toContain('node scripts/traits.mjs --write');
    });

    it('refuses --write or --check with an override, and a bad argument', () => {
        expect(capture(() => main(['--write', '--set', 'maxAgents=50'])).code).toBe(2);
        const bad = capture(() => main(['--nope']));
        expect(bad.code).toBe(2);
        expect(bad.err).toContain('unknown argument');
        expect(capture(() => main(['--config', join(tmp(), 'missing.json')])).code).toBe(2);
    });
});

describe('docs/trait-table.md', () => {
    it('is the table the registry and the default config generate', () => {
        expect(capture(() => main(['--check'])).code).toBe(0);
    });
});
