import { describe, expect, it } from 'vitest';
import { configOverrides, readParams } from '../../js/app/url-params.js';

describe('readParams', () => {
    it('reads every parameter', () => {
        expect(readParams('?seed=42&agents=300&speed=4&quality=1&scale=0.75&tv=1&audio=true')).toEqual({
            seed: 42,
            agents: 300,
            speed: 4,
            quality: 1,
            scale: 0.75,
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
            scale: null,
            tv: false,
            audio: false,
        });
    });

    it('ignores invalid values rather than throwing', () => {
        const p = readParams('?seed=-1&agents=0&speed=3&quality=5&tv=yes&audio=0');
        expect(p).toEqual({
            seed: null,
            agents: null,
            speed: null,
            quality: null,
            scale: null,
            tv: false,
            audio: false,
        });
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

describe('configOverrides', () => {
    it('is empty without an agents parameter', () => {
        expect(configOverrides(readParams(''))).toEqual({});
    });

    it('raises the agent cap above the default and keeps the floor', () => {
        expect(configOverrides(readParams('?agents=800'))).toEqual({
            initialAgents: 800,
            maxAgents: 800,
            minAgents: 100,
        });
    });

    it('keeps the default cap and lowers the floor for a small start', () => {
        expect(configOverrides(readParams('?agents=40'))).toEqual({
            initialAgents: 40,
            maxAgents: 500,
            minAgents: 40,
        });
    });
});

describe('scale', () => {
    it('reads a render scale from 0.25 to 1', () => {
        expect(readParams('?scale=1').scale).toBe(1);
        expect(readParams('?scale=0.5').scale).toBe(0.5);
        expect(readParams('?scale=.25').scale).toBe(0.25);
    });

    it('ignores a missing or out-of-range scale', () => {
        for (const bad of ['', '?scale=0.2', '?scale=1.5', '?scale=abc', '?scale=-1']) {
            expect(readParams(bad).scale, bad).toBeNull();
        }
    });
});
