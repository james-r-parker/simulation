// What a click in the insights drawer does: follow the genome it names, else glide the camera to the place it names.
// The follow is the `F` key's: `state.followId` set and the entry zoom framed, so the director's handoff takes over when
// the subject dies. A row with neither (a scene seen before any participant was known) does nothing.

import { appLog } from './app-log.js';
import { moveCameraTo } from './camera.js';
import { frameFollow } from './follow.js';
import { FOCUS_ZOOM } from './director/moment-log.js';

/**
 * @typedef {object} InsightTarget
 * @property {string} [kind] `scene`, `family` or `record`, for the log
 * @property {number} [genomeId] the genome to follow, 0 or absent for none
 * @property {number} [x] where to go when there is no genome
 * @property {number} [y] where to go when there is no genome
 */

/**
 * @param {{state: import('./actions.js').AppState, camera: import('./camera.js').CameraController}} app the shared state
 *   and the view
 * @param {InsightTarget} target what the row names
 * @returns {'follow' | 'camera' | 'none'} what was done
 */
export function followInsight({ state, camera }, target) {
    const genomeId = target.genomeId ?? 0;
    const where = { x: target.x ?? NaN, y: target.y ?? NaN };
    let done = /** @type {'follow' | 'camera' | 'none'} */ ('none');
    if (genomeId > 0) {
        state.followId = genomeId;
        frameFollow(camera);
        done = 'follow';
    } else if (Number.isFinite(where.x) && Number.isFinite(where.y)) {
        state.followId = 0;
        moveCameraTo(camera, { ...where, zoom: Math.max(camera.zoom, FOCUS_ZOOM) });
        done = 'camera';
    }
    appLog('info', 'InsightsFollow', { kind: target.kind ?? '', done, genomeId });
    return done;
}

/**
 * @param {{state: import('./actions.js').AppState, camera: import('./camera.js').CameraController,
 *   params: {board: boolean, reel: boolean}, loop: {agents: () => import('./interpolate.js').Interpolated},
 *   deps: {refs: {player: any}}}} app the page
 * @returns {{board: boolean, reelMode: boolean, getCamera: () => import('./camera.js').CameraController, getFollowView: () => {agents: any, player: any},
 *   getAgents: () => import('./interpolate.js').Interpolated, getPursuits: () => any,
 *   followTarget: (target: InsightTarget) => void, copyText: (text: string) => Promise<void> | undefined}} what the
 *   interface reads of the view and how it moves it: the camera, the frame's agents and effects player, the renderer's
 *   pursuit table, the follow an insights row asks for, and the clipboard the export copies to
 */
export function viewDeps(app) {
    return {
        board: app.params.board,
        reelMode: app.params.reel,
        getCamera: () => app.camera,
        getFollowView: () => ({ agents: app.loop.agents(), player: app.deps.refs.player }),
        getAgents: () => app.loop.agents(),
        getPursuits: () => app.deps.refs.player?.flee?.pursuits ?? null,
        followTarget: (target) => void followInsight(app, target),
        copyText: (text) => navigator.clipboard?.writeText(text),
    };
}
