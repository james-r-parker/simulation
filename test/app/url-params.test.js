import { describe, expect, it } from 'vitest';
import { readParams } from '../../js/app/url-params.js';

describe('readParams', () => {
    it('reads every parameter', () => {
        expect(readParams('?seed=42&agents=300&speed=4&quality=1&tv=1&audio=true')).toEqual({
            seed: 42,
            agents: 300,
            speed: 4,
            quality: 1,
            tv: true,
            audio: true,
        });
    });

    it('defaults to nulls and false', () => {
        expect(readParams('')).toEqual({
            seed: null,
            agents: null,
            speed: null,
            quality: null,
            tv: false,
            audio: false,
        });
    });

    it('ignores invalid values rather than throwing', () => {
        const p = readParams('?seed=-1&agents=0&speed=3&quality=5&tv=yes&audio=0');
        expect(p).toEqual({ seed: null, agents: null, speed: null, quality: null, tv: false, audio: false });
        expect(readParams('?seed=4294967296').seed).toBeNull();
        expect(readParams('?seed=4294967295').seed).toBe(4294967295);
        expect(readParams('?agents=4097').agents).toBeNull();
        expect(readParams('?seed=abc&speed=fast').seed).toBeNull();
    });

    it('accepts the fractional speeds and quality 0', () => {
        expect(readParams('?speed=0.25').speed).toBe(0.25);
        expect(readParams('?speed=16').speed).toBe(16);
        expect(readParams('?quality=0').quality).toBe(0);
    });
});
