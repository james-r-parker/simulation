import { describe, expect, it, vi } from 'vitest';
import { MERIT_PREVIEW, configOverrides, readParams } from '../../js/app/url-params.js';
import { LOOK_ALL, LOOK_ITEMS } from '../../js/app/renderer/quality.js';

describe('readParams', () => {
    it('reads every parameter', () => {
        expect(
            readParams('?seed=42&agents=300&speed=4&quality=1&scale=0.75&tv=1&audio=true&policy=map-elites-v6&merit=1'),
        ).toEqual({
            seed: 42,
            agents: 300,
            speed: 4,
            quality: 1,
            scale: 0.75,
            look: LOOK_ALL,
            tv: true,
            audio: true,
            policy: 'map-elites-v6',
            merit: true,
        });
    });

    it('defaults to nulls and false', () => {
        expect(readParams('')).toEqual({
            seed: null,
            agents: null,
            speed: null,
            quality: null,
            scale: null,
            look: LOOK_ALL,
            tv: false,
            audio: false,
            policy: null,
            merit: false,
        });
    });

    it('ignores invalid values rather than throwing', () => {
        const p = readParams('?seed=-1&agents=0&speed=3&quality=5&tv=yes&audio=0&merit=yes&policy=Not%20A%20Name');
        expect(p).toEqual({
            seed: null,
            agents: null,
            speed: null,
            quality: null,
            scale: null,
            look: LOOK_ALL,
            tv: false,
            audio: false,
            policy: null,
            merit: false,
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

describe('readParams look', () => {
    it('reads a comma list of look items as a mask', () => {
        const mask = readParams('?look=rocks,finish').look;
        expect(mask).toBe((1 << LOOK_ITEMS.indexOf('rocks')) | (1 << LOOK_ITEMS.indexOf('finish')));
    });

    it('reads all and none', () => {
        expect(readParams('?look=all').look).toBe(LOOK_ALL);
        expect(readParams('?look=none').look).toBe(0);
    });

    it('reads every item on its own', () => {
        LOOK_ITEMS.forEach((item, bit) => expect(readParams(`?look=${item}`).look).toBe(1 << bit));
    });

    it('ignores an unknown item, draws everything and logs the allowed list', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        expect(readParams('?look=rocks,sparkles').look).toBe(LOOK_ALL);
        expect(readParams('?look=').look).toBe(LOOK_ALL);
        expect(warn).toHaveBeenCalledTimes(2);
        const record = warn.mock.calls[0][0];
        expect(record).toMatchObject({ level: 'warn', event: 'LookParamIgnored', value: 'rocks,sparkles' });
        expect(record.allowed).toBe(`all,none,${LOOK_ITEMS.join(',')}`);
        warn.mockRestore();
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

describe('policy and merit', () => {
    it('reads a policy name of lower-case letters, digits and hyphens', () => {
        expect(readParams('?policy=map-elites-v6').policy).toBe('map-elites-v6');
        expect(readParams('?policy=natural-v1').policy).toBe('natural-v1');
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
            meritEnabled: true,
            meritMateWeight: 0.05,
            meritBirthBoost: 0.25,
            splitDeliberateMin: 200,
        });
        const { createConfig } = await import('../../js/sim/config.js');
        expect(createConfig({ ...MERIT_PREVIEW, seed: 1 }).meritEnabled).toBe(true);
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
