import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkSchemaConstants, rustConstants } from '../scripts/lib/wasm-constants.mjs';

const SENSE = readFileSync(new URL('../wasm/src/sense.rs', import.meta.url), 'utf8');
const BRAIN = readFileSync(new URL('../wasm/src/brain.rs', import.meta.url), 'utf8');

describe('rustConstants', () => {
    it('reads numeric top-level constants of any type and ignores the rest', () => {
        const found = rustConstants(
            [
                'const A: usize = 4;',
                'pub const B_2: f64 = 4294967296.0;',
                'const C: i32 = -1;',
                'const D: u32 = 1_000;',
                'const E: &str = "x";',
                '    const INDENTED: u32 = 3;',
            ].join('\n'),
        );
        expect([...found]).toEqual([
            ['A', 4],
            ['B_2', 4294967296],
            ['C', -1],
            ['D', 1000],
        ]);
    });

    it('finds the hit kinds of the committed sense kernel', () => {
        const found = rustConstants(SENSE);
        expect([found.get('FOOD'), found.get('AGENT'), found.get('HERD')]).toEqual([0, 1, 5]);
    });
});

describe('checkSchemaConstants', () => {
    it('accepts the committed kernels', () => {
        expect(checkSchemaConstants({ sense: SENSE, brain: BRAIN })).toEqual([]);
    });

    it('names a hit kind that differs from ray-gather.js and one that is missing', () => {
        const edited = SENSE.replace('const SMOKE: f64 = 4.0;', 'const SMOKE: f64 = 7.0;').replace(
            /const LOCAL_STRIDE: usize = 4;\n/,
            '',
        );
        const problems = checkSchemaConstants({ sense: edited, brain: BRAIN });
        expect(problems).toEqual([
            'wasm: sense.rs SMOKE is 7, js/sim/ray-gather.js says 4 - change both',
            'wasm: sense.rs LOCAL_STRIDE is missing, js/sim/ray-gather.js says 4 - change both',
        ]);
    });

    it('checks a CH_ constant of either file against the channel schema', () => {
        const ok = checkSchemaConstants({
            sense: `${SENSE}\nconst CH_KIN: usize = 5;`,
            brain: `${BRAIN}\nconst CH_WALL: usize = 6;`,
        });
        expect(ok).toEqual([]);
        const bad = checkSchemaConstants({
            sense: SENSE,
            brain: `${BRAIN}\nconst CH_KIN: usize = 4;\nconst CH_NONE: usize = 1;`,
        });
        expect(bad).toEqual([
            'wasm: brain.rs CH_KIN is 4, BRAIN_IO.channels puts it at 5 - change both',
            'wasm: brain.rs CH_NONE is 1, BRAIN_IO.channels puts it at -1 - change both',
        ]);
    });
});
