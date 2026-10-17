// The selected agent's overlays and the trails: its rays at their hit lengths, its two antennae, its call range, the trails
// of the selected agent and the leading lineage, and the follow marker, all as line segments in one preallocated buffer.

import {
    AdditiveBlending,
    BufferAttribute,
    BufferGeometry,
    DynamicDrawUsage,
    LineBasicMaterial,
    LineSegments,
} from 'three';
import { createSections, readSections } from '../snapshot-view.js';
import { PALETTE } from './colors.js';
import { clearLines, createLineBuffer, pushCircle, pushRay, pushVertex, setLineColor } from './line-buffer.js';
import { createTrails, recordTrails, trackTrails, TRAIL_AGENTS, TRAIL_POINTS, trailIndex } from './trails.js';

const RAY_COLOR = [0.75, 0.92, 1.0];
const ANTENNA_COLOR = [1.0, 0.8, 0.45];
const MARKER_COLOR = [0.9, 0.97, 1.0];
const CIRCLE_SIDES = 48;
const MARKER_SIDES = 32;
const SECTIONS = createSections();

/**
 * @param {import('../interpolate.js').Interpolated} agents the blended agents
 * @param {number} genomeId the agent
 * @returns {number} its index, -1 when it is not alive
 */
export function findAgent(agents, genomeId) {
    if (genomeId === 0) {
        return -1;
    }
    for (let i = 0; i < agents.count; i++) {
        if (agents.genomeId[i] === genomeId) {
            return i;
        }
    }
    return -1;
}

/**
 * @param {import('../interpolate.js').Interpolated} agents the blended agents
 * @param {{selectedId: number, leadLineageId: number}} pick the selection and the leading lineage
 * @param {Uint32Array} out receives the genome ids to track: the selected agent first
 * @returns {number} how many were written, at most `out.length`
 */
export function trackedIds(agents, pick, out) {
    let n = 0;
    if (pick.selectedId !== 0 && n < out.length) {
        out[n++] = pick.selectedId;
    }
    for (let i = 0; i < agents.count && n < out.length; i++) {
        if (
            pick.leadLineageId !== 0 &&
            agents.lineageId[i] === pick.leadLineageId &&
            agents.genomeId[i] !== pick.selectedId
        ) {
            out[n++] = agents.genomeId[i];
        }
    }
    return n;
}

const RAY = { angle: 0, length: 0 };

/**
 * Adds the rays at their hit lengths: ray `k` points `2 PI k / rayCount` from the heading and reaches
 * `visionRange x (1 - proximity)`.
 * @param {import('./line-buffer.js').LineBuffer} lines the buffer
 * @param {{x: number, y: number, angle: number, vision: number}} agent the agent
 * @param {{f32: Float32Array, start: number, count: number}} rays the proximities and where they start
 * @returns {void}
 */
export function pushRays(lines, agent, rays) {
    for (let k = 0; k < rays.count; k++) {
        const proximity = rays.f32[rays.start + k];
        setLineColor(lines, RAY_COLOR, 0.12 + 0.5 * proximity);
        RAY.angle = agent.angle + (2 * Math.PI * k) / rays.count;
        RAY.length = agent.vision * (1 - proximity);
        pushRay(lines, agent.x, agent.y, RAY);
    }
}

/**
 * Adds a trail, fading from its tail to its head.
 * @param {import('./line-buffer.js').LineBuffer} lines the buffer
 * @param {import('./trails.js').Trails} trails the trails
 * @param {{t: number, rgb: ArrayLike<number>, alpha: number}} style the trail and its colour and peak alpha
 * @returns {void}
 */
export function pushTrail(lines, trails, style) {
    const n = trails.length[style.t];
    for (let k = 1; k < n; k++) {
        const a = trailIndex(trails, style.t, k - 1);
        const b = trailIndex(trails, style.t, k);
        setLineColor(lines, style.rgb, (style.alpha * (k - 1)) / n);
        pushVertex(lines, trails.xs[a], trails.ys[a]);
        setLineColor(lines, style.rgb, (style.alpha * k) / n);
        pushVertex(lines, trails.xs[b], trails.ys[b]);
    }
}

/**
 * @param {import('./scene.js').Frame} frame the frame
 * @param {Record<string, any>} info `ready.info`
 * @param {import('./line-buffer.js').LineBuffer} lines the buffer
 * @returns {void}
 */
function pushSelected(frame, info, lines) {
    const { agents } = frame;
    const i = findAgent(agents, frame.selectedId);
    if (i < 0) {
        return;
    }
    const me = {
        x: agents.x[i],
        y: agents.y[i],
        angle: agents.angle[i],
        vision: info.specs[agents.spec[i]]?.visionRange ?? 0,
    };
    if (frame.snapshot !== null) {
        const s = readSections(frame.snapshot.u32, SECTIONS);
        if (s.rayCount > 0) {
            pushRays(lines, me, { f32: frame.snapshot.f32, start: s.rayStart + i * s.rayCount, count: s.rayCount });
        }
    }
    setLineColor(lines, ANTENNA_COLOR, 0.55);
    RAY.length = info.antennaReach;
    RAY.angle = me.angle - info.antennaAngle;
    pushRay(lines, me.x, me.y, RAY);
    RAY.angle = me.angle + info.antennaAngle;
    pushRay(lines, me.x, me.y, RAY);
    setLineColor(lines, PALETTE.alarmRing, 0.14);
    pushCircle(lines, { x: me.x, y: me.y, radius: info.callRadius, sides: CIRCLE_SIDES });
}

/**
 * @param {import('./scene.js').Frame} frame the frame
 * @param {import('./line-buffer.js').LineBuffer} lines the buffer
 * @param {{id: number, alpha: number, scale: number}} marker the agent to ring, and how strongly and how wide
 * @returns {void}
 */
function pushMarker(frame, lines, marker) {
    const { agents } = frame;
    const i = findAgent(agents, marker.id);
    if (i >= 0) {
        setLineColor(lines, MARKER_COLOR, marker.alpha);
        const radius = agents.size[i] * marker.scale + 6 / frame.camera.zoom;
        pushCircle(lines, { x: agents.x[i], y: agents.y[i], radius, sides: MARKER_SIDES });
    }
}

/**
 * @param {{info: Record<string, any>}} context `ready.info`
 * @returns {import('./scene.js').Layer} the overlays
 */
export function createOverlays({ info }) {
    const capacity = info.rayCount + 2 + CIRCLE_SIDES + 2 * MARKER_SIDES + TRAIL_AGENTS * (TRAIL_POINTS - 1);
    const lines = createLineBuffer(capacity);
    const trails = createTrails();
    const wanted = new Uint32Array(TRAIL_AGENTS);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(lines.position, 3).setUsage(DynamicDrawUsage));
    geometry.setAttribute('color', new BufferAttribute(lines.color, 4).setUsage(DynamicDrawUsage));
    const material = new LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: AdditiveBlending,
    });
    const object = new LineSegments(geometry, material);
    object.frustumCulled = false;
    let lastTick = -1;
    return {
        object,
        update(frame) {
            if (frame.snapshot !== null && frame.snapshot.tick !== lastTick) {
                lastTick = frame.snapshot.tick;
                const n = trackedIds(frame.agents, frame, wanted);
                trackTrails(trails, wanted, n);
                recordTrails(trails, frame.agents);
            }
            clearLines(lines);
            for (let t = 0; t < TRAIL_AGENTS; t++) {
                const mine = trails.ids[t] === frame.selectedId;
                if (trails.ids[t] !== 0) {
                    pushTrail(lines, trails, { t, rgb: MARKER_COLOR, alpha: mine ? 0.5 : 0.1 });
                }
            }
            pushSelected(frame, info, lines);
            pushMarker(frame, lines, { id: frame.selectedId, alpha: 0.4, scale: 1.7 });
            pushMarker(frame, lines, { id: frame.followId, alpha: 0.8, scale: 2.2 });
            geometry.getAttribute('position').needsUpdate = true;
            geometry.getAttribute('color').needsUpdate = true;
            geometry.setDrawRange(0, lines.vertices);
        },
        dispose() {
            geometry.dispose();
            material.dispose();
        },
    };
}
