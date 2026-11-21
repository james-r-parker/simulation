// The insights drawer's Scenes tab: the 15 scenes of docs/principles.md, each with how often it showed on screen in the
// last four seasons, or `no live signal` for a scene that has no on-screen signature. A scene that has been seen is
// clickable: the click hands its newest participant to `onPick` so the camera follows a live instance.

import { mountNote, mountTable } from './insights-table.js';

/** The columns of the Scenes tab's table. */
export const SCENE_COLUMNS = Object.freeze(['scene', 'last 4 seasons']);

/** What a scene with no on-screen signature reads. */
export const NO_SIGNAL = 'no live signal';

/**
 * @typedef {object} SceneRowView
 * @property {string} name the scene
 * @property {string | null} signal what is counted, null when nothing is
 * @property {number | null} count the count over the last four seasons, null for a scene with no signal
 * @property {number} genomeId its newest participant, 0 for none
 * @property {number} x where its newest instance was
 * @property {number} y where its newest instance was
 * @property {boolean} seen whether it has had an instance
 */

/**
 * @param {readonly SceneRowView[]} scenes the scene rows
 * @returns {import('./insights-table.js').TableRow[]} the table rows: the scene and its count, clickable once it has an
 *   instance to follow
 */
export function sceneTableRows(scenes) {
    return scenes.map((scene) => ({
        cells: [scene.name, scene.count === null ? NO_SIGNAL : String(scene.count)],
        muted: scene.count === null,
        pick: scene.count !== null && scene.seen,
        target: { kind: 'scene', name: scene.name, genomeId: scene.genomeId, x: scene.x, y: scene.y },
    }));
}

/**
 * @param {{createElement: (tag: string) => any}} doc the document
 * @param {any} panel the tab's element
 * @param {import('./insights.js').InsightsHooks} hooks `onPick` hears a click on a scene
 * @returns {{update: (view: readonly SceneRowView[]) => void}} `update` shows the scenes
 */
export function mountScenesTab(doc, panel, hooks) {
    const table = mountTable(doc, panel, {
        title: 'Scenes in the last 4 seasons',
        columns: SCENE_COLUMNS,
        onPick: hooks.onPick,
    });
    mountNote(doc, panel, 'Click a scene that has been seen to follow a live instance.');
    return { update: (scenes) => table.update(sceneTableRows(scenes)) };
}
