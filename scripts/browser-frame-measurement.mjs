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
