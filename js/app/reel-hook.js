// `window.__reel`: what `npm run reel` reads from the page, in development builds only (the caller decides). `clips()`
// lists the best clip of each scene seen so far (scene, tick, score, subject, file name, object URL); the script fetches
// each URL inside the page to get the bytes. `recording()` says whether the rolling recorder is running, so the script
// can tell a browser that cannot record from a world with nothing to show.

/**
 * @param {{__reel?: object}} target the window
 * @param {{production: boolean, part: {reel: {clips: () => Record<string, any>[]},
 *   recorder: {running: () => boolean}}}} options whether this is a production build, and the reel part to read
 * @returns {void}
 */
export function installReelHook(target, { production, part }) {
    if (production) {
        return;
    }
    target.__reel = {
        recording: () => part.recorder.running(),
        clips: () =>
            part.reel.clips().map(({ scene, tick, score, genomeId, name, url }) => ({
                scene,
                tick,
                score,
                genomeId,
                name,
                url,
            })),
    };
}
