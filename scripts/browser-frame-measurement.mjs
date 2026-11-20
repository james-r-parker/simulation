/**
 * The smoke's liveness bar: 30 completed app draws, counted from the first draw, before the ceiling. The ceiling is
 * not a rate: the sampler returns the moment 30 draws arrive, so a fast renderer pays nothing for it. SwiftShader on a
 * 2 to 4 vCPU runner draws the app at 4 to 9 fps (measured: about 8 fps on a 32-core box, about 5 fps on hosted CI),
 * so 30 draws take 3.5 to 7 s there; the ceiling is set at 15 s (a floor of 2 fps), where only a stalled loop fails.
 * Rasteriser speed is measured by `npm run perf:browser` on a GPU, not here.
 */
export const SMOKE_FRAME_BAR = Object.freeze({ minFrames: 30, windowMs: 15_000, startupTimeoutMs: 10_000 });

/**
 * Waits for one rendered app frame, resets startup samples, then counts new samples in a fixed window.
 * @param {{readFrames: () => Promise<number>, resetFrames: () => Promise<void>, now: () => number,
 *   wait: () => Promise<void>, minFrames: number, windowMs: number, startupTimeoutMs: number}} options
 * @returns {Promise<{frames: number, elapsedMs: number, ready: boolean}>} the post-startup sample and readiness
 */
export async function sampleFramesAfterStartup({
    readFrames,
    resetFrames,
    now,
    wait,
    minFrames,
    windowMs,
    startupTimeoutMs,
}) {
    const startupStarted = now();
    const startupDeadline = startupStarted + startupTimeoutMs;
    let frames = await readFrames();
    while (frames <= 0 && now() < startupDeadline) {
        await wait();
        frames = await readFrames();
    }
    if (frames <= 0) {
        return { frames, elapsedMs: now() - startupStarted, ready: false };
    }

    await resetFrames();
    frames = 0;
    const started = now();
    let elapsedMs = 0;
    while (elapsedMs < windowMs && frames < minFrames) {
        await wait();
        frames = await readFrames();
        elapsedMs = now() - started;
    }

    return { frames, elapsedMs, ready: true };
}
