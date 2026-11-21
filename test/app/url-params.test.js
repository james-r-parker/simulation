import { describe, expect, it } from 'vitest';
import { MERIT_PREVIEW, configOverrides, readParams } from '../../js/app/url-params.js';

describe('readParams', () => {
    it('reads every parameter', () => {
        expect(
            readParams(
                '?seed=42&agents=300&speed=4&backend=webgl2&gputime=1&tv=1&audio=true&policy=map-elites-v6&merit=1&hold=1&dim=0.6',
            ),
        ).toEqual({
            seed: 42,
            agents: 300,
            speed: 4,
            backend: 'webgl2',
            gputime: true,
            tv: true,
            dim: 0.6,
            audio: true,
            policy: 'map-elites-v6',
            merit: true,
            hold: true,
        });
    });

    it('defaults to nulls and false', () => {
        expect(readParams('')).toEqual({
            seed: null,
            agents: null,
            speed: null,
            backend: null,
            gputime: false,
            tv: false,
            dim: null,
            audio: false,
            policy: null,
            merit: false,
            hold: false,
        });
    });

    it('ignores invalid values rather than throwing', () => {
        const p = readParams('?seed=-1&agents=0&speed=3&backend=vulkan&tv=yes&audio=0&merit=yes&policy=Not%20A%20Name');
        expect(p).toEqual({
            seed: null,
            agents: null,
            speed: null,
            backend: null,
            gputime: false,
            tv: false,
            dim: null,
            audio: false,
            policy: null,
            merit: false,
            hold: false,
        });
        expect(readParams('?seed=4294967296').seed).toBeNull();
        expect(readParams('?seed=4294967295').seed).toBe(4294967295);
        expect(readParams('?agents=4097').agents).toBeNull();
        expect(readParams('?seed=abc&speed=fast').seed).toBeNull();
    });

    it('reads dim as auto or a level from 0.3 to 1, and ignores the rest', () => {
        expect(readParams('?dim=auto').dim).toBe('auto');
        expect(readParams('?dim=0.3').dim).toBe(0.3);
        expect(readParams('?dim=.5').dim).toBe(0.5);
        expect(readParams('?dim=1').dim).toBe(1);
        for (const bad of ['0.29', '1.5', '0', '-0.5', 'night', '', '0.5x']) {
            expect(readParams(`?dim=${bad}`).dim, bad).toBeNull();
        }
    });

    it('accepts the fractional speeds and either backend', () => {
        expect(readParams('?speed=0.25').speed).toBe(0.25);
        expect(readParams('?speed=16').speed).toBe(16);
        expect(readParams('?backend=webgpu').backend).toBe('webgpu');
    });

    it('ignores the removed quality, scale and look parameters', () => {
        const p = /** @type {Record<string, any>} */ (readParams('?quality=1&scale=0.5&look=none'));
        expect(p.quality).toBeUndefined();
        expect(p.scale).toBeUndefined();
        expect(p.look).toBeUndefined();
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

    it('holds the population at the start with `hold`: the floor refills to it whenever it drops below', () => {
        expect(configOverrides(readParams('?agents=1000&hold=1'))).toEqual({
            initialAgents: 1000,
            maxAgents: 1000,
            minAgents: 1000,
            floorTrigger: 1000,
        });
        expect(configOverrides(readParams('?hold=1'))).toEqual({});
    });

    it('keeps the default cap and lowers the floor for a small start', () => {
        expect(configOverrides(readParams('?agents=40'))).toEqual({
            initialAgents: 40,
            maxAgents: 500,
            minAgents: 40,
        });
    });
});

describe('policy and merit', () => {
    it('reads a policy name of lower-case letters, digits and hyphens', () => {
        expect(readParams('?policy=map-elites-v6').policy).toBe('map-elites-v6');
        expect(readParams('?policy=map-elites-v6').policy).toBe('map-elites-v6');
    });

    it('does not judge whether the policy exists: the worker rejects an unknown name', () => {
        expect(readParams('?policy=no-such-policy').policy).toBe('no-such-policy');
    });

    it('ignores an empty or malformed policy', () => {
        for (const bad of ['?policy=', '?policy=-x', '?policy=a_b', '?policy=A', `?policy=${'a'.repeat(65)}`]) {
            expect(readParams(bad).policy, bad).toBeNull();
        }
    });

    it('adds the merit preview settings to the overrides, beside the agents ones', () => {
        expect(configOverrides(readParams('?merit=1'))).toEqual(MERIT_PREVIEW);
        expect(configOverrides(readParams('?merit=1&agents=40'))).toEqual({
            initialAgents: 40,
            maxAgents: 500,
            minAgents: 40,
            ...MERIT_PREVIEW,
        });
        expect(configOverrides(readParams('?merit=0'))).toEqual({});
    });

    it('previews the T25 bench values, and they make a valid config', async () => {
        expect(MERIT_PREVIEW).toEqual({
            meritBirthBoost: 0.25,
            splitDeliberateMin: 200,
        });
        const { createConfig } = await import('../../js/sim/config.js');
        expect(createConfig({ ...MERIT_PREVIEW, seed: 1 }).meritBirthBoost).toBe(0.25);
    });
});
