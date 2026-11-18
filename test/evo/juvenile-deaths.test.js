import { describe, expect, it } from 'vitest';
import { huntersLives, lifeRecords, splitJuvenileDeaths } from '../../js/evo/juvenile-deaths.js';

/** @param {number} genomeId @param {number} tick @param {Record<string, any>} [extra] @returns {Record<string, any>} a record */
const born = (genomeId, tick, extra = {}) => ({
    event: 'AgentBorn',
    tick,
    genomeId,
    spec: 1,
    parentA: 0,
    parentB: 0,
    cause: 'split',
    ...extra,
});
/** @param {number} genomeId @param {number} tick @param {Record<string, any>} [extra] @returns {Record<string, any>} a record */
const died = (genomeId, tick, extra = {}) => ({ event: 'AgentDied', tick, genomeId, slot: 3, foodEnergy: 0, ...extra });
/** @param {number} genomeId @param {number} tick @param {number} ageTicks @param {Record<string, any>} [extra] @returns {Record<string, any>} a record */
const ledger = (genomeId, tick, ageTicks, extra = {}) => ({
    event: 'HunterLedger',
    tick,
    genomeId,
    ageTicks,
    cause: 'starved',
    birth: 'split-hunter-parent',
    kills: 0,
    carcassEnergy: 0,
    standingEnergy: 10,
    moveEnergy: 90,
    sprintEnergy: 0,
    killEnergy: 0,
    biteGainEnergy: 0,
    biteCostEnergy: 100,
    ...extra,
});

const OPTIONS = { ticks: 20000, burnIn: 10000, juvenileTicks: 3000 };

describe('juvenile-deaths', () => {
    it('reads a bite from gain or kill energy alone, a ledger with no death record as unfed, and an alive killer as one kill', () => {
        const records = [
            born(20, 18000),
            ledger(20, 18400, 400, { biteCostEnergy: 0, biteGainEnergy: 5 }),
            born(21, 12000),
            ledger(21, 12400, 400, { biteCostEnergy: 0, killEnergy: 30 }),
            died(21, 12400),
            born(22, 12000),
            ledger(22, 12400, 400, { biteCostEnergy: 0 }),
            died(22, 12400),
            born(23, 10000),
            { event: 'HunterKill', genomeId: 23, ageTicks: 900 },
        ];
        const lives = huntersLives(records, OPTIONS);
        expect(lives.map((l) => l.bit)).toEqual([true, true, false, true]);
        expect(lives[0].plant).toBe(0);
        expect(lives[0].recoil).toBe(0);
        const alive = lives.find((l) => l.cause === 'alive');
        expect(alive).toMatchObject({ kills: 1, bit: true, firstKillAge: 900, age: 10000, birth: 'split' });
    });

    it('keeps only records of the four events and the run start from a log text', () => {
        const text = [
            '{"event":"AgentBorn","genomeId":1}',
            '{"event":"Other"}',
            '{"event":"RunStarted","ticks":5}',
            '{"event":"HunterRecoilLife","slot":1,"tick":2,"energy":3}',
        ].join('\n');
        expect(lifeRecords(text).map((r) => r.event)).toEqual(['AgentBorn', 'RunStarted', 'HunterRecoilLife']);
    });

    it('counts a death under the window as juvenile, joins food, recoil and parents by genome id, and skips founders', () => {
        const records = [
            born(7, 100),
            ledger(7, 400, 301),
            died(7, 400),
            born(8, 11000, { parentA: 5 }),
            died(8, 11500, { foodEnergy: 300, slot: 4 }),
            ledger(8, 11500, 500, { carcassEnergy: 200, kills: 1, killEnergy: 50, cause: 'eaten', biteCostEnergy: 60 }),
            { event: 'HunterRecoilLife', slot: 4, tick: 11500, energy: 40 },
            { event: 'HunterKill', genomeId: 8, ageTicks: 200 },
            { event: 'HunterKill', genomeId: 8, ageTicks: 300 },
        ];
        const lives = huntersLives(records, OPTIONS);
        expect(lives).toHaveLength(1);
        expect(lives[0]).toMatchObject({
            juvenile: true,
            cause: 'eaten',
            plant: 100,
            carcass: 200,
            recoil: 40,
            firstKillAge: 200,
            parentAlive: true,
            spend: 160,
        });
    });

    it('counts a hunter alive past the window as an adult and a younger one as censored', () => {
        const records = [born(1, 11000), born(2, 19000), born(3, 11000, { spec: 0 })];
        const lives = huntersLives(records, OPTIONS);
        expect(lives.map((l) => l.cause)).toEqual(['alive']);
        expect(lives[0].juvenile).toBe(false);
    });

    it('splits the deaths by birth source and cause and reports both shares', () => {
        const lives = huntersLives(
            [
                born(1, 11000),
                ledger(1, 11500, 500),
                died(1, 11500),
                born(2, 12000),
                ledger(2, 16000, 4000, { cause: 'old-age' }),
                died(2, 16000),
                born(3, 12000, { cause: 'split' }),
                ledger(3, 12900, 900, { birth: 'spec-flip', cause: 'eaten' }),
                died(3, 12900),
                born(4, 12000),
            ],
            OPTIONS,
        );
        const split = splitJuvenileDeaths(lives, 3000);
        expect(split.lives).toBe(4);
        expect(split.juvenileDeaths).toBe(2);
        expect(split.deathShare).toBeCloseTo(2 / 3, 12);
        expect(split.byBirth['spec-flip']).toMatchObject({ born: 1, deaths: 1, share: 1 });
        expect(split.byCause.starved.deaths).toBe(1);
        expect(split.byOutcome['died adult'].deaths).toBe(1);
        expect(split.ageBuckets[1]).toBe(1);
        expect(split.ageBuckets[3]).toBe(1);
    });
});
