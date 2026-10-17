import { describe, expect, it } from 'vitest';
import { LENSES, lensUniforms, toggleLens, wantsRays } from '../../../js/app/ui/lenses.js';

const flags = () => ({ temperature: false, scent: false, territory: false, vision: false, calls: false });

describe('lenses', () => {
    it('has four lenses, each with its own action', () => {
        expect(LENSES.map((l) => l.id)).toEqual(['temperature', 'scent', 'territory', 'vision']);
        expect(new Set(LENSES.map((l) => l.action)).size).toBe(4);
    });

    it('toggles one lens at a time and says its new state', () => {
        const on = [false, false, false, false];
        expect(toggleLens(on, 2)).toBe(true);
        expect(on).toEqual([false, false, true, false]);
        expect(toggleLens(on, 2)).toBe(false);
        expect(() => toggleLens(on, 4)).toThrow(/no lens 4/);
        expect(() => toggleLens(on, 1.5)).toThrow(/no lens/);
    });

    it('writes each lens into its flag, and the vision lens into calls too, reusing the object', () => {
        const out = flags();
        expect(lensUniforms([true, false, true, false], out)).toBe(out);
        expect(out).toEqual({ temperature: true, scent: false, territory: true, vision: false, calls: false });
        lensUniforms([false, true, false, true], out);
        expect(out).toEqual({ temperature: false, scent: true, territory: false, vision: true, calls: true });
    });

    it('asks for rays under the vision lens or with a selection', () => {
        expect(wantsRays([false, false, false, false], 0)).toBe(false);
        expect(wantsRays([false, false, false, true], 0)).toBe(true);
        expect(wantsRays([true, true, true, false], 7)).toBe(true);
    });
});
