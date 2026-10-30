// Pins the code against the Sensory schema tables of docs/designs/brain-capacity-and-memory.md, so the doc and the
// layout change in one commit (natural-selection.md Phase 4 T37). `sensory-schema.test.js` pins the values the sensors
// write; this file reads the doc's tables and checks the constants and the genome sizes they name.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
    BODY_INPUT,
    EXTRA_INPUTS,
    HIT_STRIDE,
    POOLED_CHANNELS,
    POOLED_STRIDE,
    POOLED_VALUES,
    brainLayout,
    inputOffsets,
} from '../../js/sim/brain-layout.js';
import { createConfig } from '../../js/sim/config.js';

const DOC = readFileSync(new URL('../../docs/designs/brain-capacity-and-memory.md', import.meta.url), 'utf8');

/**
 * @param {string} heading the `###` heading the table sits under
 * @returns {string[][]} the table's body rows, each a list of trimmed cells with backticks and thousands commas removed
 */
function table(heading) {
    const start = DOC.indexOf(`### ${heading}\n`);
    if (start < 0) {
        throw new Error(`no "### ${heading}" in the doc`);
    }
    const lines = DOC.slice(start).split('\n');
    const first = lines.findIndex((line) => line.startsWith('|'));
    const rows = [];
    for (let i = first + 2; i < lines.length && lines[i].startsWith('|'); i++) {
        rows.push(
            lines[i]
                .split('|')
                .slice(1, -1)
                .map((cell) => cell.trim().replaceAll('`', '').replaceAll(',', '')),
        );
    }
    return rows;
}

describe('the Sensory schema tables', () => {
    it('name the pooled channels in order, each at its index x the pooled stride', () => {
        const rows = table('Pooled channels');
        expect(rows.map((r) => r[0])).toEqual([...POOLED_CHANNELS]);
        const pooled = inputOffsets(createConfig()).pooled;
        for (const [name, offset] of rows) {
            expect(Number(offset), name).toBe(POOLED_CHANNELS.indexOf(name) * POOLED_STRIDE);
            expect(pooled[name], name).toBe(Number(offset));
        }
    });

    it('give each hit its three values in order', () => {
        const rows = table('Values of one hit');
        expect(rows.map((r) => [r[0], Number(r[1])])).toEqual([
            ['strength', 0],
            ['cos', 1],
            ['sin', 2],
        ]);
        expect(HIT_STRIDE).toBe(rows.length);
    });

    it('lay the body groups end to end over the body block, with the named offsets where the code has them', () => {
        const rows = table('Body inputs').map(([group, offset, count]) => ({
            group,
            offset: Number(offset),
            count: Number(count),
        }));
        let next = 0;
        for (const row of rows) {
            expect(row.offset, row.group).toBe(next);
            next += row.count;
        }
        expect(next).toBe(EXTRA_INPUTS);
        const at = Object.fromEntries(rows.map((r) => [r.group, r.offset]));
        expect(at['Antennae scent']).toBe(BODY_INPUT.SCENT);
        expect(at['Hunt scent']).toBe(BODY_INPUT.HUNT_SCENT);
        expect(at['Heard alarm']).toBe(BODY_INPUT.HEARD_ALARM);
        expect(at['Heard hunt call']).toBe(BODY_INPUT.HEARD_HUNT);
        expect(at.Sex).toBe(BODY_INPUT.SEX);
        expect(at['Memory read-back']).toBe(BODY_INPUT.MEMORY_A);
        expect(BODY_INPUT.MEMORY_B).toBe(BODY_INPUT.MEMORY_A + 1);
    });

    it('give the built row its input count, pooled values and genome size at each hidden width', () => {
        const [header, ...rows] = [
            [
                'Step',
                'Change',
                'Inputs',
                'Pooled values',
                '16 hidden',
                '24 hidden',
                '32 hidden',
                '48 hidden',
                '64 hidden',
            ],
            ...table('Planned extensions'),
        ];
        const built = rows.find((r) => r[0] === 'Built');
        expect(built).toBeDefined();
        const row = /** @type {string[]} */ (built);
        expect(Number(row[2])).toBe(POOLED_VALUES + EXTRA_INPUTS);
        expect(Number(row[3])).toBe(POOLED_VALUES);
        for (let col = 4; col < header.length; col++) {
            const brainHidden = parseInt(header[col], 10);
            const layout = brainLayout(createConfig({ brainHidden }));
            expect(layout.inputCount).toBe(Number(row[2]));
            expect(layout.weightCount, header[col]).toBe(Number(row[col]));
        }
    });
});
