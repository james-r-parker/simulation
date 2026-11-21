// The per-slot state contract (docs/designs/registries.md, Per-slot state): every array a world allocates per agent is
// hashed or says why it is not, the hash order and the arena's field order are the ones of today, and each kernel's
// parameter table holds exactly the agent arrays `agentSpecs` says it takes.

import { describe, expect, it } from 'vitest';
import {
    HASHED_AGENT_ARRAYS,
    KERNEL_ORDER,
    OPTIONAL_AGENT_ARRAYS,
    UNHASHED_ROWS,
    agentArrayInfo,
    agentSpecs,
    ownerOf,
} from '../../js/sim/agent-arrays.js';
import { createConfig } from '../../js/sim/config.js';
import { DISEASE_AGENT_ARRAYS } from '../../js/sim/disease-state.js';
import { meritSpecs } from '../../js/sim/merit-state.js';
import { createWorld } from '../../js/sim/spawn.js';
import { WORLD_FIELDS } from '../../js/sim/wasm-arena.js';
import { PARAM_ARRAYS } from '../../js/sim/wasm-brain.js';
import { HASH_ARRAYS } from '../../js/sim/wasm-hash.js';
import { PHYSICS_ARRAYS } from '../../js/sim/wasm-physics.js';
import { SENSE_ARRAYS } from '../../js/sim/wasm-sense.js';
import { hashWorld } from '../../js/sim/world-hash.js';
import { testPolicy } from './helpers/test-policy.js';
import { SIMPLE_WORLD } from '../helpers/simple-world.js';

/** The hash order of the first block before `agentSpecs` declared it: the World state table. */
const TODAYS_HASH_ORDER = [
    'alive',
    'spec',
    'x',
    'y',
    'vx',
    'vy',
    'angle',
    'turnRate',
    'size',
    'energy',
    'foodEnergy',
    'biteEnergy',
    'ageTicks',
    'cooldown',
    'pregnancy',
    'ateTimer',
    'bittenTimer',
    'lastLoss',
    'temperature',
    'dose',
    'pollenPatch',
    'pollenSerial',
    'pollenTicks',
    'genomeId',
    'lineageId',
    'parentA',
    'parentB',
    'lastBiter',
    'lastHerdId',
    'weights',
    'fatherWeights',
    'fatherId',
    'fatherLineage',
    'lastBiteTick',
    'prevBiter',
    'prevBiteTick',
    'alarmTimer',
    'huntTimer',
    'smokeTimer',
    'heard',
];

/** The world fields the arena takes over, in the order before the lists were derived. */
const TODAYS_WORLD_FIELDS = [
    'alive',
    'weights',
    'hidden',
    'inputs',
    'pooled',
    'outputs',
    'leakRate',
    'fastOut',
    'rayHue',
    'raySize',
    'raySpeed',
    'rayClosing',
    'rayCos',
    'raySin',
    'x',
    'y',
    'size',
    'foodX',
    'foodY',
    'foodRadius',
    'obsX',
    'obsY',
    'obsRadius',
    'herdAlive',
    'herdX',
    'herdY',
    'cloudX',
    'cloudY',
    'coverRing',
    'rayLocal',
    'rayStamp',
    'rayScratch',
    'foodKind',
    'rayReachBySpec',
    'foodAlive',
    'danger',
    'attack',
    'hunt',
    'pheromoneScratch',
    'vx',
    'vy',
    'spec',
    'sprintBySpec',
    'contacts',
    'sprintFactor',
    'laneMaxVelocity',
];

/** A world with every optional per-slot row on, so each one is allocated. */
function fullWorld() {
    return createWorld(
        createConfig({
            ...SIMPLE_WORLD,
            worldWidth: 1000,
            worldHeight: 1000,
            maxAgents: 8,
            initialAgents: 3,
            minAgents: 0,
            rayCount: 4,
            brainHidden: 3,
            maxFood: 8,
            initialFood: 4,
            fertileZoneMax: 3,
            herdDungZoneMax: 3,
            hebbianRate: 0.01,
            maxBirthsPerWindow: 2,
            sprintStoreEnabled: true,
            diseaseSeedRate: 0.001,
            predatorRestTicks: 5,
            woundThrust: 0.1,
        }),
        testPolicy,
    );
}

/** The rows the other groups hash by their own lists, by name. */
const HASHED_ELSEWHERE = new Set([
    ...meritSpecs().map(([, name]) => name),
    ...DISEASE_AGENT_ARRAYS,
    'rewardTrace',
    'birthRing',
    'hidden',
    'sprintLevel',
    'restTimer',
]);

/**
 * @param {Record<string, any>} world the world
 * @param {string} name a per-slot row's field
 * @returns {boolean} whether changing the first element of the row changes `hashWorld`
 */
function hashSeesRow(world, name) {
    const laneName = name.startsWith('lanes.') ? name.slice('lanes.'.length) : undefined;
    const array = world[name] ?? (name === 'sprintLevel' ? world.sprintStore.level : world.lanes[laneName ?? '']);
    const before = hashWorld(world);
    const saved = array[0];
    array[0] = saved === 7 ? 8 : 7;
    const changed = hashWorld(world) !== before;
    array[0] = saved;
    return changed;
}

describe('the per-slot state of a world', () => {
    const world = fullWorld();

    it('hashes the first block in the order of the World state table', () => {
        expect([...HASHED_AGENT_ARRAYS]).toEqual(TODAYS_HASH_ORDER);
    });

    it('gives every agent array a place in the hash, an optional hash or an excuse, and every excuse says why', () => {
        for (const [, name, , info] of agentSpecs(world.layout)) {
            expect(['number', 'string', 'boolean']).toContain(typeof info.hashed);
            if (info.hashed === false) {
                expect(info.excuse, name).toMatch(/\S{8}/);
            } else {
                expect(info.excuse, name).toBeUndefined();
            }
        }
        expect([...OPTIONAL_AGENT_ARRAYS]).toEqual(['sex', 'fastOut']);
    });

    it('covers every row of the world: hashed, excused, or hashed by its own list, and nothing else', () => {
        const names = world.agentRows.map((/** @type {{name?: string}} */ row) => row.name);
        expect(names.every((/** @type {unknown} */ name) => typeof name === 'string')).toBe(true);
        const meta = new Set(agentSpecs(world.layout).map(([, name]) => name));
        const unknown = names.filter(
            (/** @type {string} */ name) => !meta.has(name) && !HASHED_ELSEWHERE.has(name) && !(name in UNHASHED_ROWS),
        );
        expect(unknown).toEqual([]);
        for (const name of Object.keys(UNHASHED_ROWS)) {
            expect(names, `${name} is in UNHASHED_ROWS but is not a row`).toContain(name);
        }
    });

    it('changes the world hash when a hashed row changes, and not when an excused row does', () => {
        for (const [, name, , info] of agentSpecs(world.layout)) {
            expect(hashSeesRow(world, name), name).toBe(info.hashed !== false);
        }
        for (const name of Object.keys(UNHASHED_ROWS)) {
            expect(hashSeesRow(world, name), name).toBe(false);
        }
        for (const name of HASHED_ELSEWHERE) {
            expect(hashSeesRow(world, name), name).toBe(true);
        }
    });
});

describe('the kernels that take a per-slot array', () => {
    /** @type {Record<string, readonly string[]>} */
    const TABLES = { brain: PARAM_ARRAYS, sense: SENSE_ARRAYS, hash: HASH_ARRAYS, physics: PHYSICS_ARRAYS };

    it('hold in each parameter table exactly the agent arrays that name the kernel', () => {
        const agentNames = new Set(agentSpecs(fullWorld().layout).map(([, name]) => name));
        for (const kernel of KERNEL_ORDER) {
            const inTable = TABLES[kernel].filter((name) => agentNames.has(name));
            const declared = [...agentNames].filter((name) => agentArrayInfo(name)?.kernels?.includes(kernel));
            expect(inTable.sort(), kernel).toEqual(declared.sort());
        }
    });

    it('take the world fields over in the order of today, each once, with the owner the first kernel to name it', () => {
        expect([...WORLD_FIELDS]).toEqual(TODAYS_WORLD_FIELDS);
        expect(new Set(WORLD_FIELDS).size).toBe(WORLD_FIELDS.length);
        expect(['alive', 'x', 'vx', 'outputs', 'heard'].map((name) => ownerOf(name))).toEqual([
            'brain',
            'sense',
            'physics',
            'brain',
            undefined,
        ]);
    });
});
