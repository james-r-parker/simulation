// The scene reel's part of the interface: the reel over the scene counters, a rolling recorder on the canvas, and the
// tiles the Reel tab shows. The recorder starts once the canvas exists and the browser can record; the reel is read once
// a frame (a clock read and a few typed-array compares). With `?reel=1` a moment also frames itself: the follow goes to
// its subject, as the director's would. Reads; never reaches the sim.

import { createReel } from './reel.js';
import { createRollingRecorder } from './reel-recorder.js';
import { NOT_SEEN } from './ui/insights-reel.js';

/** What a scene with no on-screen signature reads (the Scenes tab's words). */
const NO_SIGNAL = 'no live signal';

/**
 * @param {readonly {id: string, name: string, signal: string | null, genomeId: number, x: number, y: number,
 *   seen: boolean}[]} rows the scene rows (`sceneRows`)
 * @param {(scene: string) => import('./reel.js').Clip | null} clipOf the reel's best clip of a scene
 * @returns {import('./ui/insights-reel.js').ReelTile[]} one tile per scene
 */
export function reelTiles(rows, clipOf) {
    return rows.map((row) => {
        const clip = clipOf(row.id);
        let status = row.seen ? 'seen, no clip yet' : NOT_SEEN;
        if (row.signal === null) {
            status = NO_SIGNAL;
        } else if (clip !== null) {
            status = `tick ${clip.tick}, ${clip.score} in 10 s`;
        }
        const live = row.seen ? { kind: 'reel', name: row.name, genomeId: row.genomeId, x: row.x, y: row.y } : null;
        return { id: row.id, name: row.name, status, url: clip?.url ?? null, live };
    });
}

/**
 * @param {Record<string, any>} deps the interface's deps: `now`, `getCamera`, `state`, `getCanvas`, `MediaRecorder`,
 *   `followTarget` and `reelMode`
 * @param {import('./scene-counters.js').SceneCounters} scenes the counters it reads
 * @returns {{tick: (nowMs: number) => void, reset: () => void, reel: ReturnType<typeof createReel>,
 *   recorder: ReturnType<typeof createRollingRecorder>}} `tick` runs once a frame; `reset` forgets a world's clips
 */
export function createReelPart(deps, scenes) {
    const recorder = createRollingRecorder({ MediaRecorder: deps.MediaRecorder, now: deps.now });
    const reel = createReel({
        scenes,
        recorder,
        onFrame: (moment) =>
            deps.reelMode === true &&
            deps.followTarget?.({ kind: 'reel', genomeId: moment.genomeId, x: moment.x, y: moment.y }),
    });
    let tried = false;
    return {
        reel,
        recorder,
        reset: reel.reset,
        tick(nowMs) {
            const canvas = deps.getCanvas?.() ?? null;
            if (!tried && canvas !== null) {
                tried = true;
                recorder.start(canvas);
            }
            const camera = deps.getCamera();
            reel.note({ nowMs, x: camera.x, y: camera.y, zoom: camera.zoom, followId: deps.state.followId });
        },
    };
}
