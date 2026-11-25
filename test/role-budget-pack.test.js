// reads: scripts/role-budget.mjs
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { preStep5Arena } from './helpers/pre-step5.js';
import { BUILT_ROWS } from '../js/evo/role-budget-matrix.js';
import { MODEL_DEFAULTS } from '../js/evo/role-budget-model.js';
import { parseArgs, runBudget } from '../scripts/role-budget.mjs';
import { readAmplifiers, splitRows } from '../scripts/lib/role-budget-pack-report.mjs';
import { scaleTimeout } from '../scripts/lib/test-timeout.mjs';

/** Runs the budget with its output captured and its log in a temporary directory. */
async function run(/** @type {string[]} */ argv) {
    const lines = /** @type {string[]} */ ([]);
    const logDir = mkdtempSync(join(tmpdir(), 'role-budget-pack-'));
    const done = await runBudget(parseArgs(argv), { logDir, print: (text) => lines.push(text) });
    return { ...done, text: lines.join('\n') };
}

describe('splitRows', () => {
    it('reads every amplifier beside the gate on a default run', () => {
        expect(splitRows(undefined, BUILT_ROWS)).toEqual({ gate: BUILT_ROWS, amplifiers: ['pack:forager'] });
    });

    it('takes only the rows named with --rows, the amplifiers apart from the gated ones', () => {
        expect(splitRows(['predator:forager', 'pack:forager'], BUILT_ROWS)).toEqual({
            gate: ['predator:forager'],
            amplifiers: ['pack:forager'],
        });
        expect(splitRows(['predator:forager'], BUILT_ROWS).amplifiers).toEqual([]);
    });
});

describe('readAmplifiers', () => {
    it('reads nothing when no amplifier was asked for', () => {
        expect(readAmplifiers(preStep5Arena({}), MODEL_DEFAULTS, [])).toBeNull();
    });

    it('says at neutral numbers that packGain is 0 by construction', () => {
        const read = /** @type {any} */ (readAmplifiers(preStep5Arena({}), MODEL_DEFAULTS, ['pack:forager']));
        expect(read.data['pack:forager'].packGain).toBe(0);
        expect(read.text).toMatch(/pack:forager {2}hearer at rallied=1/);
        expect(read.text).toMatch(/packGain \+0\.0 px/);
        expect(read.text).toMatch(/packGain is 0 by construction/);
    });

    it('prints the gain of a planted rally and no neutral note', () => {
        const config = preStep5Arena({ rallyThrust: 0.5, rallyBurn: 0.2 });
        const read = /** @type {any} */ (readAmplifiers(config, MODEL_DEFAULTS, ['pack:forager']));
        expect(read.data['pack:forager'].packGain).toBeGreaterThan(0);
        expect(read.text).not.toMatch(/by construction/);
        expect(read.text).toMatch(/lone -102\.3 {2}rallied \+/);
    });
});

describe('role:budget with the pack row', () => {
    it(
        'prints the pack row after the gated matrix on a default run, and leaves the gated rows as they were',
        async () => {
            const withPack = await run([]);
            expect(withPack.result.rows.map((r) => r.name)).toEqual(BUILT_ROWS);
            expect(withPack.text).toMatch(/amplifiers: read with the effects on/);
            expect(withPack.text.indexOf('amplifiers:')).toBeGreaterThan(withPack.text.indexOf('predator:forager'));
        },
        scaleTimeout(60_000),
    );

    it('reads only the pack row with --rows pack:forager, and puts it in the JSON under amplifiers', async () => {
        const done = await run(['--rows', 'pack:forager', '--set', 'rallyThrust=0.5', '--json']);
        expect(done.result.rows).toEqual([]);
        const json = JSON.parse(done.text);
        expect(json.amplifiers['pack:forager'].packGain).toBeGreaterThan(0);
        expect(json.rows).toEqual([]);
    });
});
