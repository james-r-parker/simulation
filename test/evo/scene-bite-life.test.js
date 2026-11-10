// The per-life bite detectors (hunter-practice.md T22, T23) on hand-built worlds and ledger records.

import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { updateSize } from '../../js/sim/energy.js';
import { BORN_CAUSE, createEventRing, EVENT_TYPE, pushEvent } from '../../js/sim/events.js';
import { feed } from '../../js/sim/feeding.js';
import { buildHash, createSpatialHash } from '../../js/sim/spatial-hash.js';
import { splitHunterIncome } from '../../js/evo/hunter-income-split.js';
import { biteLifeMetrics, createBiteLifeScene, noteBiteLifeRecord, tickRecoil } from '../../js/evo/scene-bite-life.js';
import { addBlob, lifeWorld } from '../sim/helpers/life-world.js';
import { directionOf } from './helpers/metric-registry.js';

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
        recoilEnergyLife: new Float64Array(n),
        biteSkipParent: new Uint8Array(n),
        thrustSkipParent: new Uint8Array(n),
        ledgerKills: new Float64Array(n),
        ledgerCarcass: new Float64Array(n),
        ledgerKillEnergy: new Float64Array(n),
        ledgerBiteGain: new Float64Array(n),
        genomeId: new Uint32Array(n),
        ageTicks: new Uint32Array(n),
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
        const value = biteLifeMetrics(scene, world([living]))['eval.hunter_carrion_idle_share']?.value;
        expect(value).toBe(split.zeroKillCarcassOfIncome);
        expect(value).toBeCloseTo(90 / 130, 12);
    });

    it('is null with no income', () => {
        const m = biteLifeMetrics(createBiteLifeScene(), world())['eval.hunter_carrion_idle_share'];
        expect(m?.value).toBeNull();
    });
});

describe('eval.hunter_recoil_per_life', () => {
    it('takes the median energy charged per hunter life, including the death-tick summary', () => {
        const scene = createBiteLifeScene();
        const w = world([NONE, NONE]);
        w.recoilEnergyLife[0] = 12;
        w.recoilEnergyLife[1] = 40;
        const ring = createEventRing(1);
        const o = pushEvent(ring, EVENT_TYPE.HUNTER_RECOIL_LIFE, 10);
        ring.data[o + 3] = 100;
        noteBiteLifeRecord(scene, ring.data, o);
        expect(biteLifeMetrics(scene, w)['eval.hunter_recoil_per_life']?.value).toBe(40);
    });

    it('is null with no lives', () => {
        expect(biteLifeMetrics(createBiteLifeScene(), world())['eval.hunter_recoil_per_life']?.value).toBeNull();
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
            return w.recoilEnergyLife[hunter];
        };
        expect(run(true)).toBe(20);
        expect(run(false)).toBe(0);
    });
});

describe('hunter reflex column crossover metrics', () => {
    it('ignores a mating event when no world is supplied', () => {
        const scene = createBiteLifeScene();
        const births = createEventRing(1);
        const o = pushEvent(births, EVENT_TYPE.AGENT_BORN, 1);
        births.data[o + 8] = BORN_CAUSE.MATE;
        noteBiteLifeRecord(scene, births.data, o);
        expect(scene.reflexMateBirths).toBe(0);
    });

    it('ignores a mating birth from a non-hunter and a kill outside the tracked cohorts', () => {
        const scene = createBiteLifeScene();
        const w = world([NONE]);
        w.spec[0] = 0;
        const birth = createEventRing(1);
        let o = pushEvent(birth, EVENT_TYPE.AGENT_BORN, 1);
        birth.data[o + 2] = 0;
        birth.data[o + 8] = BORN_CAUSE.MATE;
        noteBiteLifeRecord(scene, birth.data, o, w);
        const kill = createEventRing(1);
        o = pushEvent(kill, EVENT_TYPE.HUNTER_KILL, 2);
        kill.data[o + 2] = 999;
        noteBiteLifeRecord(scene, kill.data, o, w);
        expect(scene.reflexMateBirths).toBe(0);
    });

    it('reads mating births and pairs the split-child share with each cohort kill rate', () => {
        const scene = createBiteLifeScene();
        const w = world([NONE, NONE]);
        w.genomeId.set([1, 2]);
        w.ageTicks.set([100, 200]);
        w.ledgerKills.set([1, 0]);
        w.biteSkipParent[0] = 0;
        w.thrustSkipParent[0] = 1;
        w.biteSkipParent[1] = 0;
        w.thrustSkipParent[1] = 0;
        const births = createEventRing(1);
        let o = pushEvent(births, EVENT_TYPE.AGENT_BORN, 1);
        births.data[o + 2] = 0;
        births.data[o + 3] = 1;
        births.data[o + 8] = BORN_CAUSE.MATE;
        noteBiteLifeRecord(scene, births.data, o, w);
        const kill = createEventRing(1);
        o = pushEvent(kill, EVENT_TYPE.HUNTER_KILL, 2);
        kill.data[o + 2] = 1;
        noteBiteLifeRecord(scene, kill.data, o, w);
        const second = createEventRing(1);
        o = pushEvent(second, EVENT_TYPE.AGENT_BORN, 1);
        second.data[o + 2] = 1;
        second.data[o + 3] = 2;
        second.data[o + 8] = BORN_CAUSE.MATE;
        noteBiteLifeRecord(scene, second.data, o, w);
        const deaths = createEventRing(1);
        o = pushEvent(deaths, EVENT_TYPE.HUNTER_LEDGER, 10);
        deaths.data[o + 2] = 1;
        deaths.data[o + 3] = 100;
        deaths.data[o + 4] = 64;
        noteBiteLifeRecord(scene, deaths.data, o, w);
        const secondDeath = createEventRing(1);
        o = pushEvent(secondDeath, EVENT_TYPE.HUNTER_LEDGER, 10);
        secondDeath.data[o + 2] = 2;
        secondDeath.data[o + 3] = 200;
        noteBiteLifeRecord(scene, secondDeath.data, o, w);
        w.alive.fill(0);
        w.alive[0] = 1;
        const m = biteLifeMetrics(scene, w);
        expect(m['eval.hunter_reflex_column_split_share']).toEqual({ value: 0.5 });
        expect(m['eval.hunter_reflex_column_split_kill_rate']).toEqual({ value: 10 });
        expect(m['eval.hunter_reflex_column_same_kill_rate']).toEqual({ value: 0 });
    });
});

describe('the directions', () => {
    it('name the two metrics', () => {
        expect(directionOf('eval.hunter_carrion_idle_share')).toBe('lower');
        expect(directionOf('eval.hunter_recoil_per_life')).toBe('watch');
    });
});
