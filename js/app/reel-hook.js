// `window.__reel`: what `npm run reel` reads from the page (installed only with `?reel=1`, in every build: the browser smoke runs the
// reel against the production build). `clips()` lists the best clip of each scene seen so far (scene, tick, score,
// subject, file name, object URL); the script fetches each URL inside the page to get the bytes. `recording()` says
// whether the rolling recorder is running, so the script can tell a browser that cannot record from a world with nothing
// to show; `pending()` says whether a clip is still waiting for its 4 s after the moment.

/**
 * @param {{__reel?: object}} target the window
 * @param {{reel: {clips: () => Record<string, any>[], pending: () => unknown},
 *   recorder: {running: () => boolean}}} part the reel part to read
 * @returns {void}
 */
export function installReelHook(target, part) {
    target.__reel = {
        recording: () => part.recorder.running(),
        pending: () => part.reel.pending() !== null,
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
