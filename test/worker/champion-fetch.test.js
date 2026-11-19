import { describe, expect, it, vi } from 'vitest';
import { createChampionGate, fetchChampionFiles } from '../../js/worker/champion-fetch.js';

const BASE = 'https://x.test/champions/v1/';

/**
 * @param {Record<string, any>} files path under the base to its JSON; a missing path answers 404
 * @returns {(url: string) => Promise<any>} a fetch over them
 */
function fakeFetch(files) {
    return async (url) => {
        const name = url.slice(BASE.length);
        return Object.hasOwn(files, name)
            ? { ok: true, status: 200, json: async () => files[name] }
            : { ok: false, status: 404, json: async () => ({}) };
    };
}

describe('fetchChampionFiles', () => {
    it('fetches the index and every file it lists, in index order', async () => {
        const files = await fetchChampionFiles(
            fakeFetch({
                'index.json': { champions: [{ file: 'b.json' }, { file: 'a.json' }] },
                'a.json': { name: 'a' },
                'b.json': { name: 'b' },
            }),
            BASE,
        );
        expect(files).toEqual([{ name: 'b' }, { name: 'a' }]);
    });

    it('names the URL and the export command when the directory is not published', async () => {
        await expect(fetchChampionFiles(fakeFetch({}), BASE)).rejects.toThrow(
            /champions\/v1\/index\.json answered 404; publish the champions with npm run train:export/,
        );
    });

    it('fails when a listed file is missing or the index lists none', async () => {
        await expect(
            fetchChampionFiles(fakeFetch({ 'index.json': { champions: [{ file: 'gone.json' }] } }), BASE),
        ).rejects.toThrow(/gone\.json answered 404/);
        await expect(fetchChampionFiles(fakeFetch({ 'index.json': { champions: [] } }), BASE)).rejects.toThrow(
            /lists no champions/,
        );
        await expect(fetchChampionFiles(fakeFetch({ 'index.json': {} }), BASE)).rejects.toThrow(/lists no champions/);
    });
});

/**
 * @param {() => Promise<any[]>} load the loader
 * @returns {{gate: ReturnType<typeof createChampionGate>, seen: any[]}} a gate and the messages the host received
 */
function rig(load) {
    /** @type {any[]} */
    const seen = [];
    return { gate: createChampionGate({ receive: (m) => seen.push(m), load }), seen };
}

describe('createChampionGate', () => {
    it('passes any message straight through when no champions are needed', () => {
        const load = vi.fn(async () => []);
        const { gate, seen } = rig(load);
        gate.receive({ type: 'init', policy: 'map-elites-v6' });
        gate.receive({ type: 'init' });
        gate.receive({ type: 'pause' });
        expect(seen.map((m) => m.type)).toEqual(['init', 'init', 'pause']);
        expect(load).not.toHaveBeenCalled();
    });

    it('loads before an init or reset for champions-v1 and keeps the order of what follows', async () => {
        const files = [{ name: 'a' }];
        const { gate, seen } = rig(async () => files);
        gate.receive({ type: 'init', policy: 'champions-v1' });
        gate.receive({ type: 'setSpeed' });
        gate.receive({ type: 'reset', policy: 'champions-v1' });
        expect(seen).toEqual([]);
        await vi.waitFor(() => expect(seen).toHaveLength(3));
        expect(seen.map((m) => m.type)).toEqual(['init', 'setSpeed', 'reset']);
        expect(gate.files()).toBe(files);
        gate.receive({ type: 'pause' });
        expect(seen).toHaveLength(4);
    });

    it('loads once and answers later resets at once', async () => {
        const load = vi.fn(async () => [{ name: 'a' }]);
        const { gate, seen } = rig(load);
        gate.receive({ type: 'init', policy: 'champions-v1' });
        await vi.waitFor(() => expect(seen).toHaveLength(1));
        await Promise.resolve();
        gate.receive({ type: 'reset', policy: 'champions-v1' });
        expect(seen).toHaveLength(2);
        expect(load).toHaveBeenCalledTimes(1);
    });

    it('hands the host the message anyway on a failed load, and files() throws the load error', async () => {
        const { gate, seen } = rig(async () => {
            throw new Error('404 on index');
        });
        gate.receive({ type: 'init', policy: 'champions-v1' });
        await vi.waitFor(() => expect(seen).toHaveLength(1));
        expect(() => gate.files()).toThrow('404 on index');
    });

    it('wraps a non-Error load failure, and says so when nothing was loaded', async () => {
        const { gate, seen } = rig(async () => {
            throw 'offline';
        });
        expect(() => gate.files()).toThrow(/were not loaded/);
        gate.receive({ type: 'init', policy: 'champions-v1' });
        await vi.waitFor(() => expect(seen).toHaveLength(1));
        expect(() => gate.files()).toThrow('offline');
    });
});
