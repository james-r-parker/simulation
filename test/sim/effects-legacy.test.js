// The Phase 1 rows of docs/designs/status-effects.md: for each modifier the sim had before the registry, the effect gives the
// number the replaced function gave, over a grid of inputs. The old functions are written out here as the references.

import { describe, expect, it } from 'vitest';
import { EFFECT, effectFactor, gateOpen, GATE, levelOf, liveOf } from '../../js/sim/effects.js';
import { allocBody } from './helpers/body.js';
import { smallWorld } from './helpers/small-world.js';

const TEMPERATURES = [0, 10, 29.99, 30, 35, 39.99, 40, 52.5, 65, 65.01, 70, 77.5, 84.99, 85, 85.01, 100];

/**
 * @param {Record<string, any>} [over] config overrides
 * @returns {{world: any, slot: number}} a world with one forager at its lane bases
 */
function bodyWorld(over = {}) {
    const world = smallWorld({ maxAgents: 4, ...over });
    const slot = allocBody(world, 0);
    world.alive[slot] = 1;
    world.energy[slot] = 50;
    world.temperature[slot] = 50;
    return { world, slot };
}

describe('fat', () => {
    it('slows thrust and turn by `1 - fatSlowShare x energy / maxEnergy`, and not at all at 0', () => {
        for (const fatSlowShare of [0, 0.25, 0.5, 0.9]) {
            const { world, slot } = bodyWorld({ fatSlowShare });
            for (const energy of [0, 1, 37.5, 100, world.lanes.maxEnergy[slot]]) {
                world.energy[slot] = energy;
                const old = fatSlowShare === 0 ? 1 : 1 - (fatSlowShare * energy) / world.lanes.maxEnergy[slot];
                expect(liveOf(world, slot, 'maxThrust') / world.lanes.maxThrust[slot]).toBeCloseTo(old, 12);
                expect(liveOf(world, slot, 'maxTurn') / world.lanes.maxTurn[slot]).toBeCloseTo(old, 12);
            }
        }
    });
});

describe('the temperature effects', () => {
    it('gives the efficiency, the passive ramp and the mating block of the band the function gave', () => {
        const config = { temperaturePassiveLossFactor: 3, temperatureEfficiencyHeatModerate: 0.8 };
        const { world, slot } = bodyWorld(config);
        const c = world.config;
        for (const degrees of TEMPERATURES) {
            world.temperature[slot] = degrees;
            const t = world.temperature[slot];
            const efficiency =
                t < c.temperatureColdStress
                    ? c.temperatureEfficiencyColdSevere
                    : t < c.temperatureColdModerate
                      ? c.temperatureEfficiencyColdModerate
                      : t <= c.temperatureOptimalMax
                        ? 1
                        : t < c.temperatureHeatStress
                          ? c.temperatureEfficiencyHeatModerate
                          : c.temperatureEfficiencyHeatSevere;
            const extra = c.temperaturePassiveLossFactor - 1;
            const ramp =
                t < c.temperatureOptimalMin
                    ? 1 + ((c.temperatureOptimalMin - t) / c.temperatureOptimalMin) * extra
                    : t > c.temperatureOptimalMax
                      ? 1 + ((t - c.temperatureOptimalMax) / (c.temperatureMax - c.temperatureOptimalMax)) * extra
                      : 1;
            const blocks = t < c.temperatureColdStress || t > c.temperatureHeatStress;
            const thrust =
                effectFactor(world, slot, EFFECT.COLD_BAND, 'maxThrust') *
                effectFactor(world, slot, EFFECT.HEAT_BAND, 'maxThrust');
            const standing = liveOf(world, slot, 'passiveLoss') / world.lanes.passiveLoss[slot];
            expect(thrust, `efficiency at ${t}`).toBe(efficiency);
            expect(standing, `passive ramp at ${t}`).toBeCloseTo(ramp, 12);
            expect(gateOpen(world, slot, GATE.MATE), `mating at ${t}`).toBe(!blocks);
        }
    });

    it('scales the size and vision terms by the same ramp', () => {
        const { world, slot } = bodyWorld({ temperaturePassiveLossFactor: 2 });
        world.temperature[slot] = 20;
        const ramp = 1 + (world.lanes.temperatureOptimalMin[slot] - 20) / world.lanes.temperatureOptimalMin[slot];
        for (const lane of ['sizeEnergyLoss', 'visionCost']) {
            expect(liveOf(world, slot, lane) / world.lanes[lane][slot]).toBeCloseTo(ramp, 12);
        }
    });
});

describe('juvenile', () => {
    it('burns the standing, movement, turn and sprint cost lanes by `juvenileBurn` while a hunter is under `juvenileTicks`', () => {
        const lanes = ['passiveLoss', 'sizeEnergyLoss', 'visionCost', 'movementCost', 'turnCost', 'sprintCost'];
        const { world, slot } = bodyWorld({ juvenileBurn: 0.5, juvenileTicks: 100 });
        world.spec[slot] = 1;
        for (const age of [0, 99, 100, 5000]) {
            world.ageTicks[slot] = age;
            const burn = age < 100 ? 0.5 : 1;
            for (const lane of lanes) {
                expect(effectFactor(world, slot, EFFECT.JUVENILE, lane), `${lane} at ${age}`).toBe(burn);
            }
        }
        world.spec[slot] = 0;
        world.ageTicks[slot] = 0;
        expect(levelOf(world, slot, EFFECT.JUVENILE)).toBe(0);
    });
});

describe('spent', () => {
    it('is 0 with the store off and `1 - level / sprintFloor` under the floor with it on', () => {
        const { world, slot } = bodyWorld({ sprintStoreEnabled: true, sprintFloor: 0.4 });
        for (const level of [1, 0.4, 0.39, 0.2, 0]) {
            world.sprintStore.level[slot] = level;
            const old = level >= 0.4 ? 1 : level / 0.4;
            expect(levelOf(world, slot, EFFECT.SPENT)).toBeCloseTo(1 - old, 12);
            expect(effectFactor(world, slot, EFFECT.SPENT, 'sprintBoost')).toBeCloseTo(old, 12);
        }
        const off = bodyWorld({ sprintStoreEnabled: false });
        expect(levelOf(off.world, off.slot, EFFECT.SPENT)).toBe(0);
    });
});
