import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = pathToFileURL(new URL('../../', import.meta.url).pathname).href;

/**
 * Runs `body` in a fresh Node with natives syntax on, so it can ask V8 whether an object is in fast-properties mode.
 * @param {string} body module code that prints one JSON value
 * @returns {any} the printed value
 */
function inFreshNode(body) {
    const out = execFileSync(process.execPath, ['--allow-natives-syntax', '--input-type=module', '-e', body], {
        encoding: 'utf8',
    });
    return JSON.parse(out);
}

// An object built by many keyed stores (`world[name] = ...`) falls into V8's dictionary mode, where every `world.x` in
// the hot loops is a hash lookup and the JIT cannot fold the field. The bench step ran 1.6 to 1.9 times slower for it
// (world-balance T63); `allocateWorld` and `createIntentState` copy their result with a spread to get a fast object.
describe('hot state objects keep V8 fast properties', () => {
    it('a created world, with every feature on', () => {
        const fast = inFreshNode(`
            const { createConfig } = await import('${ROOT}js/sim/config.js');
            const { createWorld } = await import('${ROOT}js/sim/spawn.js');
            const { cloneWithNoisePolicy } = await import('${ROOT}js/sim/birth-policy.js');
            const config = createConfig({ initialAgents: 20, minAgents: 20, maxAgents: 20, terrainLayout: 'basins', obstacleCount: 0 });
            const world = createWorld(config, cloneWithNoisePolicy());
            console.log(JSON.stringify(%HasFastProperties(world)));
        `);
        expect(fast).toBe(true);
    });

    it('the observer and its intent state', () => {
        const fast = inFreshNode(`
            const { createConfig } = await import('${ROOT}js/sim/config.js');
            const { createObserver } = await import('${ROOT}js/evo/observer.js');
            const { createRng, fork } = await import('${ROOT}js/sim/rng.js');
            const observer = createObserver(createConfig({}), fork(createRng(1), 'eval'));
            console.log(JSON.stringify([%HasFastProperties(observer), %HasFastProperties(observer.intent)]));
        `);
        expect(fast).toEqual([true, true]);
    });
});
