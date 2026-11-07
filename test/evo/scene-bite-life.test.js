// The per-life bite detectors (hunter-practice.md T22, T23) on hand-built worlds and ledger records.

import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { updateSize } from '../../js/sim/energy.js';
import { createEventRing, EVENT_TYPE, pushEvent } from '../../js/sim/events.js';
import { feed } from '../../js/sim/feeding.js';
import { buildHash, createSpatialHash } from '../../js/sim/spatial-hash.js';
import { splitHunterIncome } from '../../js/evo/hunter-income-split.js';
import {
    BITE_LIFE_DIRECTIONS,
    biteLifeMetrics,
    createBiteLifeScene,
    noteBiteLifeRecord,
    tickRecoil,
} from '../../js/evo/scene-bite-life.js';
import { addBlob, lifeWorld } from '../sim/helpers/life-world.js';

const NONE = { kills: 0, carcass: 0, kill: 0, bite: 0 };

/**
 * @param {Record<string, any>} scene the scene
 * @param {{kills: number, carcass: number, kill: number, bite: number}} life a dead hunter's ledger
 * @returns {void}
 */
function die(scene, { kills, carcass, kill, bite }) {
    const ring = createEventRing(1);
    const o = pushEvent(ring, EVENT_TYPE.HUNTER_LEDGER, 1);
    ring.data[o + 4] = kills * 64;
    ring.data[o + 5] = carcass;
    ring.data[o + 9] = kill;
    ring.data[o + 10] = bite;
    noteBiteLifeRecord(scene, ring.data, 0);
}

/**
 * @param {Array<{kills: number, carcass: number, kill: number, bite: number}>} alive hunters alive at the last tick
 * @returns {Record<string, any>} a hand-built world at tick 10
 */
function world(alive = []) {
    const n = Math.max(alive.length, 1);
    const w = {
        tick: 10,
        alive: new Uint8Array(n),
        spec: new Uint8Array(n).fill(1),
        huntBySpec: new Float64Array([0, 1]),
        recoilStamp: new Uint32Array(n),
        ledgerKills: new Float64Array(n),
        ledgerCarcass: new Float64Array(n),
        ledgerKillEnergy: new Float64Array(n),
        ledgerBiteGain: new Float64Array(n),
    };
    alive.forEach((l, i) => {
        w.alive[i] = 1;
        w.ledgerKills[i] = l.kills;
        w.ledgerCarcass[i] = l.carcass;
        w.ledgerKillEnergy[i] = l.kill;
        w.ledgerBiteGain[i] = l.bite;
    });
    return w;
}

describe('eval.hunter_carrion_idle_share', () => {
    it('equals the split of the same records: dead lives plus the living at their end age', () => {
        const scene = createBiteLifeScene();
        die(scene, { kills: 0, carcass: 60, kill: 0, bite: 0 });
        die(scene, { kills: 2, carcass: 10, kill: 20, bite: 10 });
        const split = splitHunterIncome([
            { kills: 0, carcassEnergy: 60, killEnergy: 0, biteGainEnergy: 0 },
            { kills: 2, carcassEnergy: 10, killEnergy: 20, biteGainEnergy: 10 },
            { kills: 0, carcassEnergy: 30, killEnergy: 0, biteGainEnergy: 0 },
        ]);
        const living = { kills: 0, carcass: 30, kill: 0, bite: 0 };
        const value = biteLifeMetrics(scene, world([living]))['eval.hunter_carrion_idle_share'].value;
        expect(value).toBe(split.zeroKillCarcassOfIncome);
        expect(value).toBeCloseTo(90 / 130, 12);
    });

    it('is null with no income', () => {
        const m = biteLifeMetrics(createBiteLifeScene(), world())['eval.hunter_carrion_idle_share'];
        expect(m.value).toBeNull();
    });
});

describe('eval.hunter_recoil_per_life', () => {
    it('counts a stamp equal to world.tick once per hunter and divides by the lives', () => {
        const scene = createBiteLifeScene();
        const w = world([NONE, NONE]);
        w.recoilStamp[0] = w.tick;
        w.recoilStamp[1] = w.tick - 1;
        tickRecoil(scene, w);
        expect(scene.recoilTicks).toBe(1);
        die(scene, NONE);
        expect(biteLifeMetrics(scene, w)['eval.hunter_recoil_per_life'].value).toBeCloseTo(1 / 3, 12);
    });

    it('is null with no lives', () => {
        expect(biteLifeMetrics(createBiteLifeScene(), world())['eval.hunter_recoil_per_life'].value).toBeNull();
    });

    it('counts a kin lunge through the real feed phase and not a lunge at prey', () => {
        const run = (/** @type {boolean} */ kin) => {
            const w = lifeWorld({ biteArc: Math.PI, biteCost: 0, recoilEnergy: 20, predatorKillEnergy: 0 });
            const hunter = addBlob(w, { spec: 1, energy: 500, x: 100, y: 100, angle: 0 });
            const other = addBlob(w, { spec: 0, energy: 500, x: 110, y: 100, angle: 0 });
            [hunter, other].forEach((slot) => updateSize(w, slot));
            w.outputs[hunter * OUTPUT_COUNT + OUTPUT_INDEX.BITE] = 1;
            if (kin) {
                w.parentA[other] = w.genomeId[hunter];
            }
            w.contacts[0] = hunter;
            w.contacts[1] = other;
            w.contactCount = 1;
            const hash = createSpatialHash(w.config);
            buildHash(hash, w);
            feed(w, hash);
            w.tick += 1; // `step` ends with this increment
            const scene = createBiteLifeScene();
            tickRecoil(scene, w);
            return scene.recoilTicks;
        };
        expect(run(true)).toBe(1);
        expect(run(false)).toBe(0);
    });
});

describe('the directions', () => {
    it('name the two metrics', () => {
        expect(BITE_LIFE_DIRECTIONS['eval.hunter_carrion_idle_share']).toBe('lower');
        expect(BITE_LIFE_DIRECTIONS['eval.hunter_recoil_per_life']).toBe('watch');
    });
});
