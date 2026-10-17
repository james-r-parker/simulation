// The family-territory lens: one world quad over a small RGBA texture. While the lens is on, each new snapshot adds
// its agents to the occupancy grid and the texture is rewritten every 250 ms; while it is off the layer does nothing.

import {
    AdditiveBlending,
    ClampToEdgeWrapping,
    DataTexture,
    LinearFilter,
    Mesh,
    PlaneGeometry,
    RGBAFormat,
    ShaderMaterial,
    UnsignedByteType,
} from 'three';
import { accumulateTerritory, createTerritory, syncSlots, territoryPixels } from '../territory.js';
import { TERRITORY_FRAGMENT, TERRITORY_VERTEX } from './territory-layer-shader.js';

/** How often the texture is rewritten, in ms. */
export const TERRITORY_REFRESH_MS = 250;

/**
 * @param {Uint8Array} data the texels
 * @param {{cols: number, rows: number}} size the grid size
 * @returns {any} a linearly filtered RGBA texture over `data`
 */
function createTexture(data, { cols, rows }) {
    const texture = new DataTexture(data, cols, rows, RGBAFormat, UnsignedByteType);
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    texture.wrapS = ClampToEdgeWrapping;
    texture.wrapT = ClampToEdgeWrapping;
    texture.needsUpdate = true;
    return texture;
}

/**
 * @param {any} texture the territory texture
 * @param {Record<string, any>} info `ready.info`
 * @returns {{mesh: any, geometry: any, material: any}} a hidden world quad that draws the texture added to the frame
 */
function createQuad(texture, info) {
    const geometry = new PlaneGeometry(1, 1);
    const material = new ShaderMaterial({
        vertexShader: TERRITORY_VERTEX,
        fragmentShader: TERRITORY_FRAGMENT,
        uniforms: { uMap: { value: texture }, uWorld: { value: [info.worldWidth, info.worldHeight] } },
        blending: AdditiveBlending,
        transparent: true,
        depthTest: false,
        depthWrite: false,
    });
    const mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.visible = false;
    return { mesh, geometry, material };
}

/**
 * @param {{info: Record<string, any>}} context `ready.info`
 * @returns {import('./scene.js').Layer} the territory layer
 */
export function createTerritoryLayer({ info }) {
    const t = createTerritory({ worldWidth: info.worldWidth, worldHeight: info.worldHeight });
    const data = new Uint8Array(t.cols * t.rows * 4);
    const texture = createTexture(data, t);
    const { mesh, geometry, material } = createQuad(texture, info);
    let lastTick = -1;
    let lastVersion = -1;
    let lastWriteMs = -Infinity;
    return {
        object: mesh,
        update(frame) {
            mesh.visible = frame.lenses.territory;
            if (!mesh.visible) {
                return;
            }
            if (frame.family.version !== lastVersion) {
                lastVersion = frame.family.version;
                syncSlots(t, frame.family);
            }
            if (frame.snapshot !== null && frame.snapshot.tick !== lastTick) {
                lastTick = frame.snapshot.tick;
                accumulateTerritory(t, frame.snapshot);
            }
            if (frame.nowMs - lastWriteMs >= TERRITORY_REFRESH_MS) {
                lastWriteMs = frame.nowMs;
                territoryPixels(t, { out: data, palette: frame.family.palette });
                texture.needsUpdate = true;
            }
        },
        dispose() {
            geometry.dispose();
            material.dispose();
            texture.dispose();
        },
    };
}
