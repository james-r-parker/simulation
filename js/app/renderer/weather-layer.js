// The season's weather: one instanced mesh of motes (2400 at level 0, 1200 at level 1, none at level 2) whose seeds are
// written once; the shader drifts and wraps them in the view. The season and its cross-fade come from the playhead tick
// and `ready.info.seasonLength`, the same formula as `seasonAt` in the sim, so the weather turns with the world.

import { AdditiveBlending, InstancedBufferAttribute, ShaderMaterial, Vector3, Vector4 } from 'three';
import { viewBounds } from '../camera.js';
import { createPrng } from '../prng.js';
import { PALETTE, WEATHER_MAX_LUMINANCE } from './colors.js';
import { createQuadGeometry, createQuadMesh } from './instanced.js';
import { LOOK_OFF } from './quality.js';
import { WEATHER_FRAGMENT, WEATHER_VERTEX } from './weather-shader.js';

/** Motes at quality levels 0, 1 and 2. */
export const WEATHER_COUNT = Object.freeze([2400, 1200, 0]);
/** The share of a season at each end over which the weather cross-fades into the neighbouring season's. */
export const SEASON_BLEND = 0.1;
const SEASONS = 4;
/** Each mode's hue before it is scaled to `WEATHER_MAX_LUMINANCE`: pollen, glints, leaves, snow. */
const MODE_HUES = Object.freeze([[0.8, 0.95, 0.45], PALETTE.heat, [1.0, 0.5, 0.12], PALETTE.coolWhite]);

/**
 * @param {number} tick the playhead tick
 * @param {number} seasonLength ticks per season
 * @param {{a: number, b: number, mix: number}} out the season's mode, the neighbour it blends with, and the share of B
 * @returns {{a: number, b: number, mix: number}} `out`: 0.5 at a boundary, 0 from `SEASON_BLEND` inside a season
 */
export function seasonWeights(tick, seasonLength, out) {
    const phase = (((tick / seasonLength) % SEASONS) + SEASONS) % SEASONS;
    const a = Math.floor(phase);
    const f = phase - a;
    out.a = a;
    if (f > 1 - SEASON_BLEND) {
        out.b = (a + 1) % SEASONS;
        out.mix = (f - (1 - SEASON_BLEND)) / (2 * SEASON_BLEND);
    } else if (f < SEASON_BLEND) {
        out.b = (a + SEASONS - 1) % SEASONS;
        out.mix = 0.5 - f / (2 * SEASON_BLEND);
    } else {
        out.b = a;
        out.mix = 0;
    }
    return out;
}

/**
 * @param {readonly number[]} rgb a linear colour
 * @returns {any} the colour scaled to `WEATHER_MAX_LUMINANCE`
 */
function weatherColor(rgb) {
    const y = 0.2126729 * rgb[0] + 0.7151522 * rgb[1] + 0.072175 * rgb[2];
    const k = WEATHER_MAX_LUMINANCE / y;
    return new Vector3(rgb[0] * k, rgb[1] * k, rgb[2] * k);
}

/**
 * @param {number} count motes
 * @param {number} seed the world seed
 * @returns {any} the geometry with one seed vec4 per mote
 */
function weatherGeometry(count, seed) {
    const geometry = createQuadGeometry(count, []);
    const prng = createPrng(seed ^ 0x5eed);
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < seeds.length; i++) {
        seeds[i] = prng.next();
    }
    geometry.setAttribute('iSeed', new InstancedBufferAttribute(seeds, 4));
    return geometry;
}

/**
 * @param {Record<string, {value: any}>} uniforms the layer's uniforms
 * @returns {any} the additive mote material
 */
function weatherMaterial(uniforms) {
    return new ShaderMaterial({
        vertexShader: WEATHER_VERTEX,
        fragmentShader: WEATHER_FRAGMENT,
        uniforms,
        blending: AdditiveBlending,
        transparent: true,
        depthTest: false,
        depthWrite: false,
    });
}

const SEASON = { a: 0, b: 0, mix: 0 };
const VIEW = { left: 0, right: 0, top: 0, bottom: 0 };

/**
 * @param {{info: Record<string, any>, seed: number}} context `ready.info` and the world seed
 * @returns {import('./scene.js').Layer & {uniforms: Record<string, {value: any}>}} the layer
 */
export function createWeatherLayer({ info, seed }) {
    const uniforms = {
        uView: { value: new Vector4(0, 0, 1, 1) },
        uTime: { value: 0 },
        uZoom: { value: 1 },
        uModeA: { value: 0 },
        uModeB: { value: 0 },
        uMix: { value: 0 },
        uColdMargin: { value: info.terrain?.coldMarginWidth ?? 0 },
        uWorldHeight: { value: info.worldHeight },
        uColors: { value: MODE_HUES.map(weatherColor) },
    };
    const material = weatherMaterial(uniforms);
    const geometry = weatherGeometry(WEATHER_COUNT[0], seed);
    const mesh = createQuadMesh(geometry, material, WEATHER_COUNT[0]);
    let count = WEATHER_COUNT[0];
    let on = true;
    return {
        object: mesh,
        uniforms,
        setQuality(level) {
            count = WEATHER_COUNT[level] ?? 0;
        },
        setLook(look) {
            on = look.weather !== undefined && look.weather !== LOOK_OFF;
            count = on ? WEATHER_COUNT[look.weather ?? 0] : 0;
        },
        update(frame) {
            seasonWeights(frame.tick, info.seasonLength, SEASON);
            const v = viewBounds(frame.camera, VIEW);
            uniforms.uView.value.set(v.left, v.bottom, v.right - v.left, v.top - v.bottom);
            uniforms.uTime.value = frame.nowMs / 1000;
            uniforms.uZoom.value = frame.camera.zoom;
            uniforms.uModeA.value = SEASON.a;
            uniforms.uModeB.value = SEASON.b;
            uniforms.uMix.value = SEASON.mix;
            mesh.count = on ? count : 0;
            mesh.visible = mesh.count > 0;
        },
        dispose() {
            geometry.dispose();
            material.dispose();
            mesh.dispose();
        },
    };
}
