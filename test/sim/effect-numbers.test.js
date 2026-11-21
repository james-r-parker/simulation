// The numbers that switch the social effects on (docs/designs/status-effects.md): off at every default, and the stored
// stacks they make are hashed, and zeroed with a freed slot, only when a world has one on.

import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import {
    SOCIAL_KEYS,
    callEffectsOn,
    chilledOn,
    panicOn,
    socialEffectsOn,
    woundOn,
} from '../../js/sim/effect-numbers.js';
import { applyEffect } from '../../js/sim/effect-appliers.js';
import { EFFECT } from '../../js/sim/effects.js';
import { freeAgent } from '../../js/sim/world.js';
import { hashWorld } from '../../js/sim/world-hash.js';
import { allocBody } from './helpers/body.js';
import { smallWorld } from './helpers/small-world.js';

describe('socialEffectsOn', () => {
    it('is false at the defaults, and true for any one key above 0', () => {
        expect(socialEffectsOn(createConfig())).toBe(false);
        for (const key of SOCIAL_KEYS) {
            expect(socialEffectsOn({ [key]: 0.1 }), key).toBe(true);
            expect(socialEffectsOn({ [key]: 0 }), key).toBe(false);
        }
    });

    it('is true for a hoarseFactor above 1, whose neutral value is 1', () => {
        expect(socialEffectsOn({ hoarseFactor: 1 })).toBe(false);
        expect(socialEffectsOn({ hoarseFactor: 2 })).toBe(true);
    });

    it('names only keys the config knows, each 0 by default', () => {
        const config = createConfig();
        for (const key of SOCIAL_KEYS.filter((k) => k in config)) {
            expect(config[key], key).toBe(0);
        }
    });
});

describe('callEffectsOn', () => {
    it('is off at the defaults, and on once a number of rallied or answered is above 0 or hoarse above 1', () => {
        expect(callEffectsOn(createConfig())).toBe(false);
        for (const key of ['rallyThrust', 'rallyBurn', 'answeredBite']) {
            expect(callEffectsOn({ [key]: 0.1, hoarseFactor: 1 }), key).toBe(true);
        }
        expect(callEffectsOn({ hoarseFactor: 1.5 })).toBe(true);
        expect(callEffectsOn({ alertBoost: 0.1, huddleWarmth: 0.1, hoarseFactor: 1 })).toBe(false);
    });
});

describe('the stacks a body keeps', () => {
    it('are off at the defaults, and each on once one of its own numbers is above 0', () => {
        const config = createConfig();
        expect([chilledOn(config), woundOn(config), panicOn(config)]).toEqual([false, false, false]);
        expect(chilledOn({ coldStackRate: 0.1 })).toBe(true);
        expect(woundOn({ woundThrust: 0.1 })).toBe(true);
        for (const key of ['panicThrust', 'panicBurn', 'shakenThrust']) {
            expect(panicOn({ panicThrust: 0, panicBurn: 0, shakenThrust: 0, [key]: 0.1 }), key).toBe(true);
        }
        const others = { coldStackRate: 0, woundThrust: 0, panicThrust: 0, panicBurn: 0, shakenThrust: 0 };
        expect(chilledOn({ ...others, woundThrust: 0.1, panicThrust: 0.1 })).toBe(false);
        expect(woundOn({ ...others, coldStackRate: 0.1, panicThrust: 0.1 })).toBe(false);
        expect(panicOn({ ...others, coldStackRate: 0.1, woundThrust: 0.1 })).toBe(false);
    });
});

describe('the stored stacks of the registry in worldHash', () => {
    it.each(['chilled', 'wounded', 'panicked', 'shaken'])('hash %s only with a social number on', (name) => {
        const effect = EFFECT[name.toUpperCase()];
        /** @type {[Record<string, number>, boolean][]} */
        const cases = [
            [{}, false],
            [{ woundThrust: 0.1 }, true],
        ];
        for (const [over, hashed] of cases) {
            const world = smallWorld({ maxAgents: 4, ...over });
            const slot = allocBody(world, 0);
            if (name !== 'chilled') {
                const before = hashWorld(world);
                applyEffect(world, slot, effect, 0);
                expect(hashWorld(world) !== before, `${name} ${JSON.stringify(over)}`).toBe(hashed);
            }
            world[`effect.${name}.stacks`][slot] = 2;
            world[`effect.${name}.ticks`][slot] = 7;
            const stacked = hashWorld(world);
            world[`effect.${name}.ticks`][slot] += 1;
            expect(hashWorld(world) !== stacked).toBe(hashed);
        }
    });

    it('are zeroed when the slot frees', () => {
        const world = smallWorld({ maxAgents: 4 });
        const slot = allocBody(world, 0);
        for (const name of ['chilled', 'wounded', 'panicked', 'shaken']) {
            world[`effect.${name}.stacks`][slot] = 2;
            world[`effect.${name}.ticks`][slot] = 7;
        }
        freeAgent(world, slot);
        for (const name of ['chilled', 'wounded', 'panicked', 'shaken']) {
            expect([world[`effect.${name}.stacks`][slot], world[`effect.${name}.ticks`][slot]], name).toEqual([0, 0]);
        }
    });
});
