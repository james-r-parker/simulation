// The field lenses as crisp contour lines: the scent lens draws iso-lines of the danger, attack and hunt pheromone grids,
// the territory lens iso-lines of each family's territory in its colour. A world-sized quad samples the field texture
// and draws `CONTOUR_LEVELS` lines per channel, each `CONTOUR_PX` device px wide and anti-aliased with `fwidth`; nothing
// is filled and nothing is blurred.

import {
    AdditiveBlending,
    ClampToEdgeWrapping,
    DataTexture,
    LinearFilter,
    Mesh,
    MeshBasicNodeMaterial,
    PlaneGeometry,
    RGBAFormat,
    UnsignedByteType,
} from 'three/webgpu';
import { abs, float, fract, fwidth, max, smoothstep, texture, uv, vec3 } from 'three/tsl';
import { accumulateTerritory, createTerritory, syncSlots, territoryPixels } from '../territory.js';
import { NEON } from './palette.js';

/** Iso-lines per channel, line width in device px and how often the territory texture is rewritten. */
export const CONTOUR_LEVELS = 4;
export const CONTOUR_PX = 1.5;
export const TERRITORY_REFRESH_MS = 250;
/** The saturation rate of `1 - exp(-RATE x value / pheromoneMax)`. */
export const SATURATION_RATE = 1.6;

/**
 * @param {number} levels lines per unit of the field
 * @returns {Float32Array} the field values the lines sit at, ascending, in (0, 1)
 */
export function contourLevels(levels) {
    const out = new Float32Array(levels);
    for (let k = 0; k < levels; k++) {
        out[k] = (k + 1) / (levels + 1);
    }
    return out;
}

/**
 * Converts a `field` message into texels: red danger, green attack, blue hunt, each `1 - exp(-1.6 x value / max)` in
 * 0 to 255.
 * @param {Float32Array} field the three grids back to back, `cols x rows` each
 * @param {{cols: number, rows: number, pheromoneMax: number}} grid the grid
 * @param {Uint8Array} out `cols x rows x 4` bytes
 * @returns {Uint8Array} `out`
 */
export function packScent(field, grid, out) {
    const cells = grid.cols * grid.rows;
    const scale = -SATURATION_RATE / grid.pheromoneMax;
    for (let i = 0; i < cells; i++) {
        out[i * 4] = Math.round(255 * (1 - Math.exp(scale * field[i])));
        out[i * 4 + 1] = Math.round(255 * (1 - Math.exp(scale * field[cells + i])));
        out[i * 4 + 2] = Math.round(255 * (1 - Math.exp(scale * field[2 * cells + i])));
        out[i * 4 + 3] = 255;
    }
    return out;
}

/** @param {Uint8Array} data texels @param {number} cols width @param {number} rows height @returns {any} a filtered texture */
function fieldTexture(data, cols, rows) {
    const t = new DataTexture(data, cols, rows, RGBAFormat, UnsignedByteType);
    t.minFilter = LinearFilter;
    t.magFilter = LinearFilter;
    t.wrapS = ClampToEdgeWrapping;
    t.wrapT = ClampToEdgeWrapping;
    t.needsUpdate = true;
    return t;
}

/** @param {any} value a float node 0 to 1 @returns {any} the coverage of its iso-lines at this pixel */
function isoLines(value) {
    const scaled = value.mul(CONTOUR_LEVELS + 1);
    const distance = abs(fract(scaled.sub(0.5)).sub(0.5)).div(max(fwidth(scaled), 1e-5));
    const inside = smoothstep(float(0.02), float(0.06), value);
    return smoothstep(float(CONTOUR_PX / 2 + 0.5), float(CONTOUR_PX / 2 - 0.5), distance).mul(inside);
}

/**
 * @param {any} map the field texture
 * @param {Record<string, any>} info `ready.info` (the world size)
 * @param {(sample: any) => any} paint the colour of a sampled texel's lines
 * @returns {any} a hidden world quad
 */
function contourQuad(map, info, paint) {
    const geometry = new PlaneGeometry(info.worldWidth, info.worldHeight);
    geometry.translate(info.worldWidth / 2, info.worldHeight / 2, 0);
    const material = new MeshBasicNodeMaterial();
    material.transparent = true;
    material.depthTest = false;
    material.depthWrite = false;
    material.blending = AdditiveBlending;
    material.colorNode = paint(texture(map, uv()));
    const mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.visible = false;
    return mesh;
}

const rgb = (/** @type {readonly number[]} */ c) => vec3(c[0], c[1], c[2]);

/**
 * @param {{info: Record<string, any>}} context `ready.info` (`cols`, `rows`, `pheromoneMax`, world size)
 * @returns {import('./stage.js').Layer & {pushField: (field: Float32Array, nowMs: number) => void}} the scent lens;
 *   `pushField` takes each newly arrived field
 */
export function createScentContours({ info }) {
    const grid = { cols: info.cols, rows: info.rows, pheromoneMax: info.pheromoneMax };
    const data = new Uint8Array(grid.cols * grid.rows * 4);
    const map = fieldTexture(data, grid.cols, grid.rows);
    const mesh = contourQuad(map, info, (s) =>
        rgb(NEON.alarm)
            .mul(isoLines(s.r))
            .add(rgb(NEON.hunter).mul(isoLines(s.g)))
            .add(rgb(NEON.huntCall).mul(isoLines(s.b))),
    );
    return {
        object: mesh,
        pushField(field) {
            packScent(field, grid, data);
            map.needsUpdate = true;
        },
        update(frame) {
            mesh.visible = frame.lenses.scent;
        },
        dispose() {
            mesh.geometry.dispose();
            mesh.material.dispose();
            map.dispose();
        },
    };
}

/**
 * @param {{info: Record<string, any>}} context `ready.info` (world size)
 * @returns {import('./stage.js').Layer} the territory lens: each family's territory outlined in its colour
 */
export function createTerritoryContours({ info }) {
    const t = createTerritory({ worldWidth: info.worldWidth, worldHeight: info.worldHeight });
    const data = new Uint8Array(t.cols * t.rows * 4);
    const map = fieldTexture(data, t.cols, t.rows);
    const mesh = contourQuad(map, info, (s) => s.rgb.mul(isoLines(s.a)).mul(2));
    const seen = { tick: -1, version: -1, writeMs: -Infinity };
    return {
        object: mesh,
        update(frame) {
            mesh.visible = frame.lenses.territory;
            if (!mesh.visible) {
                return;
            }
            if (frame.family.version !== seen.version) {
                seen.version = frame.family.version;
                syncSlots(t, frame.family);
            }
            if (frame.snapshot !== null && frame.snapshot.tick !== seen.tick) {
                seen.tick = frame.snapshot.tick;
                accumulateTerritory(t, frame.snapshot);
            }
            if (frame.nowMs - seen.writeMs >= TERRITORY_REFRESH_MS) {
                seen.writeMs = frame.nowMs;
                territoryPixels(t, { out: data, palette: frame.family.palette });
                map.needsUpdate = true;
            }
        },
        dispose() {
            mesh.geometry.dispose();
            mesh.material.dispose();
            map.dispose();
        },
    };
}
