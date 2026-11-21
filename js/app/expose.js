// What the page exposes on `window` for the browser smoke and the scripts: `__blob` (frames and tick) and `__reel` (the
// scene reel's clips) always, and in development builds `__perf` (the frame times). A browser shell's wiring: the
// readers it hands over are in `liveness.js`, `perf.js` and `reel-hook.js`.

import { clearFrameStats } from './frame-stats.js';
import { createAppLiveness, readAppPerf, startReporting } from './liveness.js';
import { installReelHook } from './reel-hook.js';

/**
 * @param {{app: any, target: any, production: boolean, frames: number}} options the live app, the window, whether this is
 *   a production build and the frame ring's length
 * @returns {void}
 */
export function exposeApp({ app, target, production, frames }) {
    target.__blob = createAppLiveness({
        readFrames: () => app.stats.drawCalls,
        readTick: () => app.supervisor.tick(),
        resetFrames: () => clearFrameStats(app.stats, frames),
    });
    startReporting({
        target,
        production,
        read: () => readAppPerf(app),
        reset: () => {
            clearFrameStats(app.stats, frames);
            app.deps.gpuTimer?.reset();
        },
    });
    installReelHook(target, app.iface.reel);
}
