import { describe, expect, it } from 'vitest';
import { BORN_CAUSE } from '../../js/sim/events.js';
import { DEPTH, createFamilyTree, descendantsOf } from '../../js/evo/observer-lineage-counters.js';
import { observe } from '../../js/evo/observer.js';
import { addBlob } from '../sim/helpers/life-world.js';
import { nextTick, observed, pushBorn, pushDied } from './helpers/observer-world.js';

const MATURITY = 100;

/**
 * An observed world with 16 slots; `next` starts a tick, `see` feeds it to the observer.
 * @returns {Record<string, any>}
 */
function setup() {
    const { world, observer } = observed({ maturityTicks: MATURITY, maxAgents: 16 });
    let tick = 0;
    return {
        world,
        observer,
        next() {
            tick += 1;
            nextTick(world, tick);
        },
        see: () => observe(observer, world),
    };
}

/**
 * Adds an alive agent (slots are handed out in order) and pushes its `AgentBorn`.
 * @param {any} world the world
 * @param {number} slot the slot `addBlob` returns
 * @param {number} genomeId the genome id
 * @param {number} cause a `BORN_CAUSE`
 * @param {number} [parentA] first parent's genome id
 * @param {number} [parentB] second parent's genome id
 * @returns {void}
 */
function born(world, slot, genomeId, cause, parentA = 0, parentB = 0) {
    const got = addBlob(world, {});
    expect(got).toBe(slot);
    world.genomeId[slot] = genomeId;
    pushBorn(world, { slot, genomeId, cause, parentA, parentB });
}

/**
 * Kills the agent in `slot` and pushes its `AgentDied`; the slot is free for `allocAgent` again.
 * @param {any} world the world
 * @param {number} slot the slot
 * @returns {void}
 */
function die(world, slot) {
    pushDied(world, { slot, genomeId: world.genomeId[slot] });
    world.alive[slot] = 0;
    world.genomeId[slot] = 0;
}

/**
 * Observes tick 0 with founders in slots 0, 1, ...
 * @param {Record<string, any>} h the harness
 * @param {number[]} ids the founders' genome ids
 * @returns {void}
 */
function founders(h, ids) {
    ids.forEach((id, slot) => born(h.world, slot, id, BORN_CAUSE.INITIAL));
    h.see();
}

describe('observer lineage counters: reused slots', () => {
    it('does not carry a count into a reused slot', () => {
        const h = setup();
        founders(h, [10, 11]);
        h.next();
        born(h.world, 2, 12, BORN_CAUSE.MATE, 10, 11);
        h.see();
        h.next();
        die(h.world, 0);
        h.see();
        h.next();
        born(h.world, 0, 20, BORN_CAUSE.FLOOR);
        h.see();
        expect(h.observer.maturedChildren[0]).toBe(0);
        expect(h.observer.descendantsAlive[0]).toBe(0);
        expect('matings' in h.observer).toBe(false);
    });
});

describe('observer lineage counters: maturedChildren', () => {
    /**
     * Two founders (slots 0, 1) and a mate child (slot 2) born in tick 1.
     * @returns {Record<string, any>}
     */
    function family() {
        const h = setup();
        founders(h, [10, 11]);
        h.next();
        born(h.world, 2, 12, BORN_CAUSE.MATE, 10, 11);
        h.see();
        return h;
    }

    it('credits both living parents once when the child reaches maturityTicks', () => {
        const h = family();
        h.next();
        h.world.ageTicks[2] = MATURITY - 1;
        h.see();
        expect(h.observer.maturedChildren[0]).toBe(0);
        h.next();
        h.world.ageTicks[2] = MATURITY;
        h.see();
        h.next();
        h.world.ageTicks[2] = MATURITY + 1;
        h.see();
        expect([h.observer.maturedChildren[0], h.observer.maturedChildren[1]]).toEqual([1, 1]);
        expect(h.observer.maturedChildren[2]).toBe(0);
    });

    it('credits a split parent once', () => {
        const h = setup();
        founders(h, [10]);
        h.next();
        born(h.world, 1, 11, BORN_CAUSE.SPLIT, 10, 10);
        h.see();
        h.next();
        h.world.ageTicks[1] = MATURITY;
        h.see();
        expect(h.observer.maturedChildren[0]).toBe(1);
    });

    it('credits only the surviving parent when the other died before the child matured', () => {
        const h = family();
        h.next();
        die(h.world, 1);
        h.see();
        h.next();
        h.world.ageTicks[2] = MATURITY;
        h.see();
        expect(h.observer.maturedChildren[0]).toBe(1);
        expect(h.observer.maturedChildren[1]).toBe(0);
    });

    it('never credits an agent that took over a dead parent slot', () => {
        const h = family();
        h.next();
        die(h.world, 1);
        h.see();
        h.next();
        born(h.world, 1, 30, BORN_CAUSE.FLOOR);
        h.see();
        h.next();
        h.world.ageTicks[2] = MATURITY;
        h.see();
        expect(h.observer.maturedChildren[1]).toBe(0);
        expect(h.observer.maturedChildren[0]).toBe(1);
    });

    it('credits nobody for a child that died before maturity, or for a founder reaching it', () => {
        const h = family();
        h.next();
        h.world.ageTicks[0] = MATURITY;
        die(h.world, 2);
        h.see();
        expect(h.observer.maturedChildren[0] + h.observer.maturedChildren[1]).toBe(0);
    });
});

describe('observer lineage counters: descendantsAlive', () => {
    it('counts alive children and grandchildren, also through a dead parent', () => {
        const h = setup();
        founders(h, [10, 11]);
        h.next();
        born(h.world, 2, 12, BORN_CAUSE.MATE, 10, 11);
        h.see();
        h.next();
        born(h.world, 3, 13, BORN_CAUSE.MATE, 12, 10);
        h.see();
        expect(descendantsOf(h.observer.family, 10)).toBe(2);
        expect(descendantsOf(h.observer.family, 11)).toBe(2);
        expect(descendantsOf(h.observer.family, 12)).toBe(1);
        h.next();
        die(h.world, 2);
        h.see();
        expect(h.observer.descendantsAlive[2]).toBe(1);
        expect(descendantsOf(h.observer.family, 10)).toBe(1);
        h.next();
        die(h.world, 0);
        h.see();
        expect(h.observer.descendantsAlive[0]).toBe(1);
        expect(descendantsOf(h.observer.family, 11)).toBe(1);
    });

    it('reads the value at death although the sim freed the slot', () => {
        const h = setup();
        founders(h, [10]);
        h.next();
        born(h.world, 1, 11, BORN_CAUSE.SPLIT, 10, 10);
        born(h.world, 2, 12, BORN_CAUSE.SPLIT, 10, 10);
        h.see();
        h.next();
        die(h.world, 0);
        h.see();
        expect(h.observer.descendantsAlive[0]).toBe(2);
        expect(h.observer.deaths.genomeId[0]).toBe(10);
    });

    it('lets every death of a tick see the same family and frees the nodes after', () => {
        const h = setup();
        founders(h, [10]);
        h.next();
        born(h.world, 1, 11, BORN_CAUSE.SPLIT, 10, 10);
        h.see();
        h.next();
        die(h.world, 1);
        die(h.world, 0);
        h.see();
        expect(h.observer.descendantsAlive[0]).toBe(1);
        expect(h.observer.descendantsAlive[1]).toBe(0);
        expect(h.observer.family.nodeOf.size).toBe(0);
    });

    it('includes a child born the tick its parent dies', () => {
        const h = setup();
        founders(h, [10]);
        h.next();
        born(h.world, 1, 11, BORN_CAUSE.SPLIT, 10, 10);
        die(h.world, 0);
        h.see();
        expect(h.observer.descendantsAlive[0]).toBe(1);
        expect(descendantsOf(h.observer.family, 10)).toBe(1);
    });

    it('stops counting beyond DEPTH generations', () => {
        const h = setup();
        founders(h, [100]);
        let parent = 100;
        for (let g = 1; g <= DEPTH + 2; g++) {
            h.next();
            born(h.world, g, 100 + g, BORN_CAUSE.SPLIT, parent, parent);
            h.see();
            parent = 100 + g;
        }
        expect(descendantsOf(h.observer.family, 100)).toBe(DEPTH);
        expect(descendantsOf(h.observer.family, 100 + DEPTH + 1)).toBe(1);
    });

    it('counts a shared ancestor once on a diamond', () => {
        const h = setup();
        founders(h, [10]);
        h.next();
        born(h.world, 1, 11, BORN_CAUSE.SPLIT, 10, 10);
        born(h.world, 2, 12, BORN_CAUSE.SPLIT, 10, 10);
        h.see();
        h.next();
        born(h.world, 3, 13, BORN_CAUSE.MATE, 11, 12);
        h.see();
        expect(descendantsOf(h.observer.family, 10)).toBe(3);
        expect(descendantsOf(h.observer.family, 11)).toBe(1);
    });

    it('reuses freed nodes and grows its table past the starting capacity', () => {
        const tree = createFamilyTree(1);
        const h = setup();
        h.observer.family = tree;
        founders(h, [10, 11, 12]);
        expect(tree.capacity).toBeGreaterThanOrEqual(3);
        h.next();
        die(h.world, 0);
        h.see();
        h.next();
        born(h.world, 0, 13, BORN_CAUSE.FLOOR);
        h.see();
        expect(tree.used).toBe(3);
        expect(descendantsOf(tree, 13)).toBe(0);
    });
});
