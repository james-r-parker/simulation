import { describe, expect, it } from 'vitest';
import { sampleFramesAfterStartup } from '../../scripts/browser-frame-measurement.mjs';

describe('sampleFramesAfterStartup', () => {
    it('clears startup samples and measures new app frames inside the frame window', async () => {
        let frames = 0;
        let elapsed = 0;
        let reads = 0;
        let resets = 0;
        const result = await sampleFramesAfterStartup({
            readFrames: async () => {
                reads += 1;
                if (reads === 3) {
                    frames = 18;
                }
                if (reads > 3) {
                    frames += 3;
                }
                return frames;
            },
            resetFrames: async () => {
                resets += 1;
                frames = 0;
            },
            now: () => elapsed,
            wait: async () => {
                elapsed += 100;
            },
            minFrames: 30,
            windowMs: 5000,
            startupTimeoutMs: 3000,
        });

        expect(resets).toBe(1);
        expect(result).toEqual({ frames: 30, elapsedMs: 1000, ready: true });
    });

    it('returns the observed app frames when fewer than the minimum arrive in the window', async () => {
        let frames = 0;
        let elapsed = 0;
        let reads = 0;
        const result = await sampleFramesAfterStartup({
            readFrames: async () => {
                reads += 1;
                if (reads === 2) {
                    frames = 1;
                }
                if (reads > 2 && elapsed <= 6000) {
                    frames += 5;
                }
                return frames;
            },
            resetFrames: async () => {
                frames = 0;
            },
            now: () => elapsed,
            wait: async () => {
                elapsed += 1000;
            },
            minFrames: 30,
            windowMs: 5000,
            startupTimeoutMs: 3000,
        });

        expect(result).toEqual({ frames: 25, elapsedMs: 5000, ready: true });
    });

    it('does not let 30 or more startup samples satisfy the post-reset minimum', async () => {
        let frames = 0;
        let elapsed = 0;
        let reads = 0;
        const result = await sampleFramesAfterStartup({
            readFrames: async () => {
                reads += 1;
                frames = reads === 1 ? 40 : frames + 10;
                return frames;
            },
            resetFrames: async () => {
                frames = 0;
            },
            now: () => elapsed,
            wait: async () => {
                elapsed += 100;
            },
            minFrames: 30,
            windowMs: 5000,
            startupTimeoutMs: 3000,
        });

        expect(result).toEqual({ frames: 30, elapsedMs: 300, ready: true });
    });
});
