import { describe, expect, it } from 'vitest';
import { defaultPrefs, loadPrefs, PREFS_KEY, sanitizePrefs, savePrefs } from '../../js/app/prefs.js';

/** @returns {{store: Map<string, string>, getItem: (k: string) => string | null, setItem: (k: string, v: string) => void}} */
function memory() {
    const store = new Map();
    return { store, getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v) };
}

describe('prefs', () => {
    it('shows the follow plate by default and keeps only a boolean choice', () => {
        expect(defaultPrefs().followPlate).toBe(true);
        expect(sanitizePrefs({ followPlate: false }).followPlate).toBe(false);
        expect(sanitizePrefs({ followPlate: 'no' }).followPlate).toBe(true);
    });

    it('keeps tvIdleMinutes at 5 by default, accepts 0 to a day and rejects the rest', () => {
        expect(defaultPrefs().tvIdleMinutes).toBe(5);
        expect(sanitizePrefs({ tvIdleMinutes: 0 }).tvIdleMinutes).toBe(0);
        expect(sanitizePrefs({ tvIdleMinutes: 30 }).tvIdleMinutes).toBe(30);
        for (const bad of [-1, 1441, 2.5, '5', null, Number.NaN]) {
            expect(sanitizePrefs({ tvIdleMinutes: bad }).tvIdleMinutes).toBe(5);
        }
    });

    it('keeps dim at auto by default, accepts auto or a level from 0.3 to 1 and rejects the rest', () => {
        expect(defaultPrefs().dim).toBe('auto');
        expect(sanitizePrefs({ dim: 'auto' }).dim).toBe('auto');
        expect(sanitizePrefs({ dim: 0.3 }).dim).toBe(0.3);
        expect(sanitizePrefs({ dim: 0.7 }).dim).toBe(0.7);
        expect(sanitizePrefs({ dim: 1 }).dim).toBe(1);
        for (const bad of [0.29, 1.01, 0, -1, '0.5', 'dark', null, Number.NaN]) {
            expect(sanitizePrefs({ dim: bad }).dim).toBe('auto');
        }
    });

    it('keeps the insights tab to a known tab, the world by default', () => {
        expect(defaultPrefs().insightsTab).toBe('world');
        for (const tab of ['world', 'scenes', 'families', 'records', 'export', 'reel']) {
            expect(sanitizePrefs({ insightsTab: tab }).insightsTab).toBe(tab);
        }
        for (const bad of ['nope', '', 3, null]) {
            expect(sanitizePrefs({ insightsTab: bad }).insightsTab).toBe('world');
        }
    });

    it('round trips through a storage', () => {
        const storage = memory();
        const prefs = { ...defaultPrefs(), lenses: [true, false, true, false], hud: false, volume: 0.25 };
        expect(savePrefs(storage, prefs)).toBe(true);
        expect(storage.store.has(PREFS_KEY)).toBe(true);
        expect(loadPrefs(storage)).toEqual(prefs);
    });

    it('gives the defaults for no storage, nothing stored, junk and a storage that throws', () => {
        expect(loadPrefs(null)).toEqual(defaultPrefs());
        expect(loadPrefs(memory())).toEqual(defaultPrefs());
        const junk = memory();
        junk.store.set(PREFS_KEY, '{not json');
        expect(loadPrefs(junk)).toEqual(defaultPrefs());
        const throwing = {
            getItem() {
                throw new Error('blocked');
            },
            setItem() {
                throw new Error('blocked');
            },
        };
        expect(loadPrefs(throwing)).toEqual(defaultPrefs());
        expect(savePrefs(throwing, defaultPrefs())).toBe(false);
        expect(savePrefs(null, defaultPrefs())).toBe(false);
    });

    it('replaces each bad field with its own default and keeps the good ones', () => {
        const out = sanitizePrefs({ lenses: [true], hud: 'yes', director: true, audio: 1, volume: 7, wakeLock: true });
        expect(out).toEqual({ ...defaultPrefs(), director: true, wakeLock: true });
        expect(sanitizePrefs({ lenses: [1, true, 0, true] }).lenses).toEqual([false, true, false, true]);
        expect(sanitizePrefs(42)).toEqual(defaultPrefs());
    });

    it('keeps a valid uiScale, palette and seen, and defaults the invalid ones', () => {
        expect(sanitizePrefs({ uiScale: 1.5, palette: 'cvd-safe', seen: true })).toMatchObject({
            uiScale: 1.5,
            palette: 'cvd-safe',
            seen: true,
        });
        expect(sanitizePrefs({ uiScale: 3, palette: 'neon', seen: 'yes' })).toMatchObject({
            uiScale: 'auto',
            palette: 'default',
            seen: false,
        });
    });
});
