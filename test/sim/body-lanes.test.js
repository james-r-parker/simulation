import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HEAT_BAND, LANES, LANE_COUNT, NOT_LANES, bodyProblem, laneBases, laneTable } from '../../js/sim/body-lanes.js';
import { createConfig } from '../../js/sim/config.js';
import { SPECIALISATION_FIELDS } from '../../js/sim/config-spec-rules.js';
import { SPEC_NAMES } from '../../js/sim/specs.js';

const config = createConfig();

/** @returns {string[]} the keys of the body tables (class B) in the settings inventory, with their section */
function inventoryBodyKeys() {
    const text = readFileSync('evals/decisions/body-genes/settings-inventory.md', 'utf8');
    const keys = [];
    let inside = false;
    for (const line of text.split('\n')) {
        if (line.startsWith('## Class B')) {
            inside = true;
        } else if (line.startsWith('## ') && inside) {
            break;
        }
        const key = inside ? /^\| `(\w+)`/.exec(line) : null;
        if (key) {
            keys.push(key[1]);
        }
    }
    return keys;
}

describe('LANES', () => {
    it('makes every body key of the inventory a lane, except the listed non-lanes', () => {
        const keys = inventoryBodyKeys();
        expect(keys).toHaveLength(108);
        for (const key of keys) {
            const isLane = LANES.some((lane) => lane.key === key);
            expect(isLane || key in NOT_LANES, key).toBe(true);
            expect(isLane && key in NOT_LANES, key).toBe(false);
        }
    });

    it('makes every spec field a lane (the field of one, or a lane of its own) except canHunt and index', () => {
        for (const field of SPECIALISATION_FIELDS.slice(1).filter(
            (f) => f !== 'canHunt' && f !== 'body' && f !== 'genes',
        )) {
            expect(
                LANES.some((lane) => lane.field === field),
                field,
            ).toBe(true);
        }
        expect(LANES.some((lane) => lane.field === 'canHunt')).toBe(false);
    });

    it('names each lane once, after its key or else its field, with a family; the lanes moved in Phase 1 (T3, T13, T13a), by the body effects (status-effects T2) and by the pack effects (T10)', () => {
        expect(new Set(LANES.map((lane) => lane.name)).size).toBe(LANE_COUNT);
        for (const lane of LANES) {
            expect(lane.name).toBe(lane.key ?? lane.field ?? lane.name);
            expect(lane.family).toMatch(/^[a-z]+$/);
        }
        expect(LANES.filter((lane) => lane.moved && lane.kind === 'ratio').map((lane) => lane.name)).toEqual([
            'maxThrust',
            'maxTurn',
            'maxVelocity',
            'sprintCost',
            'sprintDrain',
            'sprintRefill',
            'handlingThrust',
            'grazeThrust',
            'fatSlowShare',
            'sickThrust',
            'antennaReach',
            'refugeSenseRange',
            'visionRange',
            'hearing',
            'smokeSight',
            'handlingTicks',
            'maxEnergy',
            'passiveLoss',
            'movementCost',
            'turnCost',
            'sizeEnergyLoss',
            'visionCost',
            'baseSize',
            'digestTicks',
            'juvenileBurn',
            'sickDrain',
            'diseaseDrain',
            'temperatureGainMove',
            'temperatureLossPassive',
            'temperaturePassiveLossFactor',
            'temperatureEfficiencyColdSevere',
            'temperatureEfficiencyColdModerate',
            'temperatureEfficiencyHeatModerate',
            'temperatureEfficiencyHeatSevere',
            'heatSpeedCap',
            'sprintHeat',
            'biteEnergy',
            'alarmBiteShare',
            'biteTakenMultiplier',
            'childEnergyShare',
            'alarmCost',
            'huntCallCost',
        ]);
        expect(LANES.filter((lane) => lane.kind === 'offset').every((lane) => lane.moved)).toBe(true);
        expect(LANE_COUNT).toBe(115);
        expect(LANES.filter((lane) => lane.kind === 'offset').map((lane) => lane.name)).toHaveLength(6);
    });

    it('reads only keys the config holds', () => {
        for (const lane of LANES) {
            expect(lane.key === null || lane.key in config, lane.name).toBe(true);
        }
    });
});

describe('the lanes a trait adds', () => {
    it('are hearing, smokeSight and nerve at 1, for every spec, with no key and no field (smoke passes above 1)', () => {
        const added = LANES.filter((lane) => lane.key === null && lane.field === null);
        expect(added.map((lane) => lane.name)).toEqual(['hearing', 'smokeSight', 'nerve']);
        for (const specName of SPEC_NAMES) {
            const bases = laneBases(config, specName);
            expect([bases.hearing, bases.smokeSight, bases.nerve]).toEqual([1, 1, 1]);
        }
    });
});

describe('laneBases', () => {
    it('is key x field at the defaults, for every spec', () => {
        for (const specName of SPEC_NAMES) {
            const bases = laneBases(config, specName);
            const spec = config.specialisations[specName];
            for (const lane of LANES.filter((l) => l.kind === 'ratio')) {
                const expected =
                    (lane.key === null ? 1 : config[lane.key]) *
                    (lane.field === null ? 1 : spec[lane.field]) *
                    lane.base;
                expect(bases[lane.name], `${specName}.${lane.name}`).toBe(expected);
            }
        }
    });

    it('holds the thresholds at their config values and the predator store at five times maxEnergy', () => {
        const bases = laneBases(config, 'predator');
        expect(bases.temperatureOptimalMax).toBe(config.temperatureOptimalMax);
        expect(bases.maxEnergy).toBe(config.maxEnergy * 5);
        expect(bases.maxVelocity).toBe(config.maxVelocity);
    });

    it('multiplies by the body override and shifts the thresholds by heatBand', () => {
        const body = { maxVelocity: 2, kickMultiplier: 3, [HEAT_BAND]: 4 };
        const spec = { ...config.specialisations.scout, body };
        const bases = laneBases({ ...config, specialisations: { ...config.specialisations, scout: spec } }, 'scout');
        expect(bases.maxVelocity).toBe(config.maxVelocity * 2);
        expect(bases.kickMultiplier).toBe(3);
        expect(bases.temperatureColdStress).toBe(config.temperatureColdStress + 4);
        expect(bases.temperatureEfficiencyColdSevere).toBe(config.temperatureEfficiencyColdSevere);
    });

    it('fills a table of LANE_COUNT values per spec in LANES order', () => {
        const table = laneTable(config);
        expect(table).toHaveLength(SPEC_NAMES.length * LANE_COUNT);
        const bases = laneBases(config, 'defender');
        LANES.forEach((lane, i) => expect(table[4 * LANE_COUNT + i]).toBe(bases[lane.name]));
    });
});

describe('bodyProblem', () => {
    const moved = LANES;
    const unmoved = LANES.map((lane) => ({ ...lane, moved: false }));

    it('accepts an empty body and refuses a non-object', () => {
        expect(bodyProblem({})).toBeNull();
        for (const bad of [null, 3, 'x', []]) {
            expect(bodyProblem(bad)).toMatch(/an object/);
        }
    });

    it('refuses an unknown name, an unmoved lane and a threshold named directly', () => {
        expect(bodyProblem({ speed: 1 })).toMatch(/speed is neither/);
        expect(bodyProblem({ sprintRestThrust: 1.2 })).toMatch(/no override of sprintRestThrust yet/);
        expect(bodyProblem({ temperatureColdStress: 1 }, moved)).toMatch(/shift the thresholds with heatBand/);
        expect(bodyProblem({ [HEAT_BAND]: 1 }, unmoved)).toMatch(/no heatBand override yet/);
    });

    it('accepts a moved lane above 0 and heatBand once the thresholds have moved, and refuses the rest', () => {
        const moveOnly = moved.map((lane) => (lane.kind === 'offset' ? { ...lane, moved: false } : lane));
        expect(bodyProblem({ maxThrust: 1.2 }, moved)).toBeNull();
        expect(bodyProblem({ [HEAT_BAND]: -3 }, moved)).toBeNull();
        expect(bodyProblem({ [HEAT_BAND]: -3 }, moveOnly)).toMatch(/no heatBand override yet/);
        expect(bodyProblem({ maxThrust: 0 }, moved)).toMatch(/above 0/);
        expect(bodyProblem({ maxThrust: Number.NaN }, moved)).toMatch(/finite number/);
        expect(bodyProblem({ maxThrust: '1' }, moved)).toMatch(/finite number/);
        expect(bodyProblem({ [HEAT_BAND]: 1 }, [])).toMatch(/no heatBand override yet/);
    });

    it('is the rule createConfig applies to a spec body', () => {
        expect(() => createConfig({ specialisations: { scout: { body: { sprintRestThrust: 2 } } } })).toThrow(
            /config\.specialisations\.scout\.body is .*no override of sprintRestThrust yet/,
        );
        expect(
            createConfig({ specialisations: { scout: { body: { maxThrust: 2 } } } }).specialisations.scout.body,
        ).toEqual({
            maxThrust: 2,
        });
        expect(createConfig({ specialisations: { scout: { body: {} } } }).specialisations.scout.body).toEqual({});
    });

    it('accepts a spec body override of baseSize and childEnergyShare, which are read only through their lanes', () => {
        const body = { baseSize: 1.1, childEnergyShare: 0.9 };
        expect(bodyProblem(body)).toBeNull();
        expect(createConfig({ specialisations: { scout: { body } } }).specialisations.scout.body).toEqual(body);
    });
});
