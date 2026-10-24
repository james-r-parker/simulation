// Metric audit, intent family, part 1 (fitness-and-selection.md T3): the deliberate-behaviour metrics of
// `metrics-intent.js` that read meals, bites, kills and bite episodes, checked end to end against their definitions in
// the Metrics table of evolution-evals.md and "## Metrics" of world-balance.md. Each runs the real `observe` over the
// smallest scene whose value is computable by hand. Calls, smoke, grouping and kin are in
// `metric-audit-intent-calls.test.js`. Counter-level edges are pinned elsewhere and not repeated: closing history and
// the 5 / 6 tick boundary (`observer-intent.test.js`), the response rules (`observer-intent.test.js`), the episode
// latch (`observer-intent-episode.test.js`), kill credits (`observer-intent-credits.test.js`), the `null` reasons on an
// empty observer (`metrics-intent.test.js`).

import { describe, expect, it } from 'vitest';
import { DEATH_CAUSE } from '../../js/sim/events.js';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { ESCAPE_TICKS } from '../../js/evo/observer-combat.js';
import { RESPONSE_WINDOW } from '../../js/evo/observer-intent-state.js';
import { CH, FORAGER, PREDATOR, clearRays, seeThreat } from './helpers/intent-world.js';
import { auditArena, closeOn, metric, ticks } from './helpers/intent-audit.js';
import { addBorn, pushDied } from './helpers/observer-world.js';

// Forager A closes on food for 6 ticks (CLOSING_MIN) and eats 30 at tick 6: deliberate. Forager B closes for only
// 5 and eats 10: chance. 30 of 40.
function meals(feed = true) {
    const r = auditArena();
    const a = addBorn(r.world, { spec: FORAGER });
    const b = addBorn(r.world, { spec: FORAGER });
    r.start();
    ticks(r, 1, 6, (t) => {
        closeOn(r.world, a, CH.FOOD, t);
        if (t >= 2) {
            closeOn(r.world, b, CH.FOOD, t);
        }
        r.world.foodEnergy[a] = feed && t === 6 ? 30 : 0;
        r.world.foodEnergy[b] = feed && t === 6 ? 10 : 0;
    });
    return r;
}

describe('audit: eval.deliberate_food_share', () => {
    it('is the food energy eaten after a closing approach over all food energy eaten: 30 of 40', () => {
        expect(metric(meals(), 'deliberate_food_share')).toEqual({ value: 0.75 });
    });

    it('is null with reason `no food eaten` exactly when no food energy was gained', () => {
        expect(metric(meals(false), 'deliberate_food_share')).toEqual({ value: null, reason: 'no food eaten' });
    });
});

describe('audit: eval.deliberate_food_per_1k and eval.chance_food_per_1k', () => {
    // The same two foragers over 6 ticks: 12 agent-ticks; 30 deliberate and 10 chance food energy (bite energy is not
    // food). Per 1000 agent-ticks: 30 / 12 x 1000 = 2500 and 10 / 12 x 1000 = 833.33.
    it('are the deliberate and the chance food energy per 1000 agent-ticks: 2500 and 833.33', () => {
        const r = meals();
        expect(metric(r, 'deliberate_food_per_1k')).toEqual({ value: 2500 });
        expect(metric(r, 'chance_food_per_1k').value).toBeCloseTo(10000 / 12, 10);
    });

    it('are 0 with agent-ticks and no food, and null with reason `no agent-ticks` without agent-ticks', () => {
        const fed = meals(false);
        expect(metric(fed, 'deliberate_food_per_1k')).toEqual({ value: 0 });
        expect(metric(fed, 'chance_food_per_1k')).toEqual({ value: 0 });
        const empty = auditArena();
        addBorn(empty.world, { spec: FORAGER });
        empty.start();
        expect(metric(empty, 'deliberate_food_per_1k')).toEqual({ value: null, reason: 'no agent-ticks' });
        expect(metric(empty, 'chance_food_per_1k')).toEqual({ value: null, reason: 'no agent-ticks' });
    });
});

describe('audit: eval.pursuit_bite_share', () => {
    // Hunter H1 closes on prey for 6 ticks and gains 6 bite energy at tick 6 (deliberate); hunter H2 gains 18 with no
    // prey in sight (chance); a forager's 50 is not a hunter's. 6 of 24.
    function bites(withHunters = true) {
        const r = auditArena();
        const h1 = addBorn(r.world, { spec: PREDATOR });
        const h2 = addBorn(r.world, { spec: PREDATOR });
        const forager = addBorn(r.world, { spec: FORAGER });
        r.start();
        ticks(r, 1, 6, (t) => {
            closeOn(r.world, h1, CH.PREY, t);
            r.world.biteEnergy[h1] = withHunters && t === 6 ? 6 : 0;
            r.world.biteEnergy[h2] = withHunters && t === 6 ? 18 : 0;
            r.world.biteEnergy[forager] = t === 6 ? 50 : 0;
        });
        return r;
    }

    it('is the bite energy of deliberate bites over all bite energy gained by canHunt agents: 6 of 24', () => {
        expect(metric(bites(), 'pursuit_bite_share')).toEqual({ value: 0.25 });
    });

    it('is null with reason `no bite energy gained by hunters` when only an agent without canHunt bit', () => {
        expect(metric(bites(false), 'pursuit_bite_share')).toEqual({
            value: null,
            reason: 'no bite energy gained by hunters',
        });
    });
});

describe('audit: eval.pursuit_kill_share and eval.pack_convergence', () => {
    // Hunters A and C are of lineage 4, B of `lineageB`; A and B close on prey for ticks 1..7, so their bites are
    // deliberate from tick 6, and C never sees prey. Forager F (lineage 5) is not a hunter. Each kill is
    // `{ killer, earlier }`: the fatal bite at tick 7 by `killer`, after a non-fatal bite at tick 6 by `earlier`.
    /**
     * @param {{killer: string, earlier?: string}[]} kills the kills
     * @param {number} [lineageB] hunter B's lineage
     * @returns {{world: any, observer: any}} the run
     */
    function killScene(kills, lineageB = 4) {
        const r = auditArena();
        const { world } = r;
        /** @type {Record<string, number>} */
        const id = {
            A: addBorn(world, { spec: PREDATOR, lineageId: 4 }),
            B: addBorn(world, { spec: PREDATOR, lineageId: lineageB }),
            C: addBorn(world, { spec: PREDATOR, lineageId: 4 }),
            F: addBorn(world, { spec: FORAGER, lineageId: 5 }),
        };
        const victims = kills.map(() => addBorn(world, { spec: FORAGER }));
        r.start();
        const genome = (/** @type {string} */ who) => world.genomeId[id[who]];
        ticks(r, 1, 7, (t) => {
            closeOn(world, id.A, CH.PREY, t);
            closeOn(world, id.B, CH.PREY, t);
            kills.forEach((k, i) => {
                const slot = victims[i];
                if (t === 6 && k.earlier) {
                    world.lastBiter[slot] = genome(k.earlier);
                    world.lastBiteTick[slot] = 6;
                }
                world.bittenTimer[slot] = t === 6 && k.earlier ? 1 : 30;
                if (t === 7) {
                    world.lastBiteTick[slot] = 7;
                    world.alive[slot] = 0;
                    const by = genome(k.killer);
                    const prevBiter = k.earlier ? genome(k.earlier) : 0;
                    pushDied(world, { slot, genomeId: world.genomeId[slot], cause: DEATH_CAUSE.EATEN, by, prevBiter });
                }
            });
        });
        return r;
    }

    // VP: B bites (deliberate), A kills (deliberate): a convergent pack kill. VQ: C bites (not), A kills (deliberate):
    // a pack kill, not convergent. VX: A kills alone, deliberate. VY: C kills alone, not deliberate. VZ: F kills.
    const KILLS = [
        { killer: 'A', earlier: 'B' },
        { killer: 'A', earlier: 'C' },
        { killer: 'A' },
        { killer: 'C' },
        { killer: 'F' },
    ];

    it('reads pursuit_kill_share as deliberate fatal bites over hunter kills, pack kills included: 3 of 4', () => {
        // VZ, eaten by an agent without canHunt, is in neither count; VY is a hunter kill that was not deliberate.
        expect(metric(killScene(KILLS), 'pursuit_kill_share')).toEqual({ value: 0.75 });
    });

    it('reads pack_convergence as pack kills whose last two bites were both deliberate: 1 of 2', () => {
        // This is the hand-built case the pack_convergence diagnosis rests on: with pack kills it is not null.
        const r = killScene(KILLS);
        expect(r.observer.combat.packKills).toBe(2);
        expect(metric(r, 'pack_convergence')).toEqual({ value: 0.5 });
    });

    it('is null for pursuit_kill_share with reason `no hunter kill` when only a non-hunter killed', () => {
        expect(metric(killScene([{ killer: 'F' }]), 'pursuit_kill_share')).toEqual({
            value: null,
            reason: 'no hunter kill',
        });
    });

    it('is null for pack_convergence with reason `no pack kill` exactly when packKills is 0', () => {
        const lone = killScene([{ killer: 'A' }, { killer: 'C' }]);
        expect(lone.observer.combat.packKills).toBe(0);
        expect(metric(lone, 'pack_convergence')).toEqual({ value: null, reason: 'no pack kill' });
        // One pack kill whose first biter was not deliberate: defined, and 0.
        const one = killScene([{ killer: 'A' }, { killer: 'A', earlier: 'C' }, { killer: 'C' }]);
        expect(metric(one, 'pursuit_kill_share')).toEqual({ value: 2 / 3 });
        expect(one.observer.combat.packKills).toBe(1);
        expect(metric(one, 'pack_convergence')).toEqual({ value: 0 });
    });

    it('is null for pack_convergence when the two biters are hunters of different lineages: a hunt kill', () => {
        const split = killScene([{ killer: 'A', earlier: 'B' }], 9);
        expect(metric(split, 'pursuit_kill_share')).toEqual({ value: 1 });
        expect(metric(split, 'pack_convergence')).toEqual({ value: null, reason: 'no pack kill' });
    });
});

describe('audit: bite episodes (evasion_skill, undefended_bite_share, unseen_bite_share)', () => {
    // Every forager is bitten for the first time at tick 10 and never again. R1..R3 see the threat from tick 1 to 40
    // and sprint; U sees it and only calls an alarm (not a response); N1 never sees it; N2 first sees it at tick 11,
    // after the bite. A hunter is bitten too and is not classified. Episodes are classified at tick 40 (first bite +
    // RESPONSE_WINDOW) and resolve as escaped at tick 310 (last bite + ESCAPE_TICKS).
    const FIRST = 10;
    /**
     * @param {number} until the last tick observed
     * @returns {{world: any, observer: any}} the run
     */
    function episodes(until) {
        const r = auditArena();
        const { world } = r;
        const responders = [0, 1, 2].map(() => addBorn(world, { spec: FORAGER }));
        const alarmer = addBorn(world, { spec: FORAGER });
        const n1 = addBorn(world, { spec: FORAGER });
        const n2 = addBorn(world, { spec: FORAGER });
        const hunter = addBorn(world, { spec: PREDATOR });
        r.start();
        const out = (/** @type {number} */ slot, /** @type {number} */ k, /** @type {number} */ v) => {
            world.outputs[slot * OUTPUT_COUNT + k] = v;
        };
        ticks(r, 1, until, (t) => {
            for (const slot of [...responders, alarmer, n1, n2, hunter]) {
                clearRays(world, slot);
                world.bittenTimer[slot] = t === FIRST ? 1 : 30;
            }
            const seen = t <= RESPONSE_WINDOW + FIRST;
            for (const slot of [...responders, alarmer]) {
                if (seen) {
                    seeThreat(world, slot, 2);
                }
                out(slot, OUTPUT_INDEX.SPRINT, seen && responders.includes(slot) ? 1 : 0);
            }
            out(alarmer, OUTPUT_INDEX.ALARM, seen ? 1 : 0);
            if (seen && t > FIRST) {
                seeThreat(world, n2, 2);
            }
        });
        return r;
    }

    it('classifies nothing before first bite + 30 ticks, then reads the undefended and unseen shares of 6', () => {
        const early = episodes(FIRST + RESPONSE_WINDOW - 1);
        for (const name of ['undefended_bite_share', 'unseen_bite_share']) {
            expect(metric(early, name)).toEqual({ value: null, reason: 'no classified bite episode' });
        }
        // Six episodes (the hunter's is not classified): U was seen and not answered, N1 and N2 were not seen.
        const done = episodes(FIRST + RESPONSE_WINDOW);
        expect(metric(done, 'undefended_bite_share')).toEqual({ value: 1 / 6 });
        expect(metric(done, 'unseen_bite_share')).toEqual({ value: 2 / 6 });
    });

    it('reads evasion_skill as the responded share of escaped episodes, only once they escape: 3 of 6', () => {
        const waiting = episodes(FIRST + ESCAPE_TICKS - 1);
        expect(metric(waiting, 'evasion_skill')).toEqual({ value: null, reason: 'no escaped bite episode' });
        const escaped = episodes(FIRST + ESCAPE_TICKS);
        expect(escaped.observer.combat.escapedEpisodes).toBe(6);
        expect(metric(escaped, 'evasion_skill')).toEqual({ value: 0.5 });
    });
});
