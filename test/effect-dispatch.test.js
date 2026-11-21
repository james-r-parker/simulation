import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EFFECTS } from '../js/sim/effect-list.js';
import { CASES_PER_PART, main, renderDispatch } from '../scripts/effect-dispatch.mjs';

describe('renderDispatch', () => {
    it('matches the committed js/sim/effect-dispatch.js, so the switch and the effect list cannot differ', () => {
        const committed = readFileSync(new URL('../js/sim/effect-dispatch.js', import.meta.url), 'utf8');
        expect(committed).toBe(renderDispatch());
        expect(main(['--check'])).toBe(0);
    });

    it('gives each effect one case, reading a stored row in order and calling a reader by name', () => {
        const source = renderDispatch();
        let row = 0;
        EFFECTS.forEach((effect, i) => {
            const lastOfPart = i % CASES_PER_PART === CASES_PER_PART - 1 && i < EFFECTS.length - 1;
            expect(source).toContain(lastOfPart ? `default: // ${i}, ${effect.name}` : `case ${i}: // ${effect.name}`);
            if (effect.level === 'stacks') {
                expect(source).toContain(`LEVEL[0] = world.effectStacks[${row++}][slot];`);
            } else {
                expect(source).toContain(`${/** @type {Function} */ (effect.read).name}(world, slot)`);
            }
        });
        expect(source.match(/switch \(effect\)/g)).toHaveLength(Math.ceil(EFFECTS.length / CASES_PER_PART));
    });

    it('changes with the list: a renamed or reordered effect renders another module', () => {
        const swapped = [EFFECTS[1], EFFECTS[0], ...EFFECTS.slice(2)];
        expect(renderDispatch(swapped)).not.toBe(renderDispatch());
    });
});
