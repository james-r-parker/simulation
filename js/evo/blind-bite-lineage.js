// Where blind biters come from and whether selection removes them (honest-budgets Phase 6, E191). Pure: it reads the lives of
// `blind-bite-tracker.js` (ids unique across the pooled runs) and answers four questions: which birth source a hunter comes from
// and how much of its life it bites at nothing (`bySource`); whether a child bites blindly less than its hunter parent
// (`parentChild`, `byDepth`); whether the hunters that reproduce bite blindly less than those that do not (`reproducers`); and
// how far a birth weight of a hunter (its BITE bias, its prey-to-BITE skip weight) follows its parents' (`biasDrift`).

import { mean, pearson, quantile, stddev } from './metrics-stats.js';

/**
 * @param {number} part a part
 * @param {number} whole the whole
 * @returns {number} `part / whole`, 0 when the whole is 0
 */
const share = (part, whole) => (whole > 0 ? part / whole : 0);

/**
 * @param {readonly number[]} values numbers
 * @returns {number} their mean, 0 for none
 */
const meanOf = (values) => (values.length === 0 ? 0 : mean(values));

/**
 * @param {readonly number[]} values numbers
 * @returns {number} their median, 0 for none
 */
const medianOf = (values) => (values.length === 0 ? 0 : quantile(values, 0.5));

/**
 * @param {import('./blind-bite-tracker.js').BiteLife} life a life
 * @returns {number} the share of its ticks it held `BITE` with no body in its jaws
 */
export const blindShare = (life) => share(life.blind, life.ticks);

/**
 * @param {readonly import('./blind-bite-tracker.js').BiteLife[]} lives every life of the pooled runs
 * @param {{burnIn: number, endTick: number, juvenileTicks: number}} options the first counted birth tick, the last tick of
 *   the runs and the juvenile age
 * @returns {import('./blind-bite-tracker.js').BiteLife[]} the lives born at or after `burnIn` whose outcome is known: dead,
 *   or alive at `juvenileTicks`
 */
export function countedLives(lives, { burnIn, endTick, juvenileTicks }) {
    return lives.filter((l) => l.born >= burnIn && (l.last < endTick || l.ticks >= juvenileTicks));
}

/**
 * @param {readonly import('./blind-bite-tracker.js').BiteLife[]} counted counted lives
 * @param {number} juvenileTicks the juvenile age
 * @returns {Record<string, Record<string, number>>} per birth source: `born`, `birthShare`, `meanBlind` (mean over lives),
 *   `pooledBlind` (blind ticks over ticks), `blindMass` (the source's share of all blind ticks), `earlyBlind`, `meanPreyBite`,
 *   `positivePreyBite` (share born with a positive prey-to-BITE skip weight) and `reach` (share that reach `juvenileTicks` ticks)
 */
export function bySource(counted, juvenileTicks) {
    const totalBlind = counted.reduce((s, l) => s + l.blind, 0);
    /** @type {Record<string, Record<string, number>>} */
    const out = {};
    for (const source of new Set(counted.map((l) => l.source))) {
        const group = counted.filter((l) => l.source === source);
        const early = group.reduce((s, l) => s + l.earlyTicks, 0);
        out[source] = {
            born: group.length,
            birthShare: share(group.length, counted.length),
            meanBlind: meanOf(group.map(blindShare)),
            pooledBlind: share(
                group.reduce((s, l) => s + l.blind, 0),
                group.reduce((s, l) => s + l.ticks, 0),
            ),
            blindMass: share(
                group.reduce((s, l) => s + l.blind, 0),
                totalBlind,
            ),
            earlyBlind: share(
                group.reduce((s, l) => s + l.earlyBlind, 0),
                early,
            ),
            meanPreyBite: meanOf(group.map((l) => l.preyBite)),
            positivePreyBite: share(group.filter((l) => l.preyBite > 0).length, group.length),
            reach: share(group.filter((l) => l.ticks >= juvenileTicks).length, group.length),
        };
    }
    return out;
}

/**
 * @param {readonly import('./blind-bite-tracker.js').BiteLife[]} lives every life
 * @returns {Map<number, import('./blind-bite-tracker.js').BiteLife>} the lives by genome id
 */
const indexById = (lives) => new Map(lives.map((l) => [l.id, l]));

/**
 * @param {import('./blind-bite-tracker.js').BiteLife} life a life
 * @param {Map<number, import('./blind-bite-tracker.js').BiteLife>} byId every life by id
 * @param {number} minTicks the fewest ticks a parent must have been seen for its blind share to count
 * @returns {import('./blind-bite-tracker.js').BiteLife[]} its parents that are tracked hunters seen for `minTicks` ticks
 */
function hunterParents(life, byId, minTicks) {
    return [life.parentA, life.parentB]
        .map((id) => byId.get(id))
        .filter((p) => p !== undefined && p.ticks >= minTicks && p.id !== life.id)
        .map((p) => /** @type {import('./blind-bite-tracker.js').BiteLife} */ (p));
}

/**
 * Child against hunter parent, over counted lives that have at least one tracked hunter parent (a mating child with two
 * tracked parents uses their mean). `slope` is the least-squares slope of the child's blind share on the parent's.
 * @param {readonly import('./blind-bite-tracker.js').BiteLife[]} lives every life
 * @param {readonly import('./blind-bite-tracker.js').BiteLife[]} counted counted lives
 * @param {number} minTicks the fewest ticks a parent must have been seen
 * @returns {Record<string, number>} `pairs`, `parentBlind`, `childBlind`, `change` (child minus parent), `childLower` (share of
 *   pairs with the child below its parent), `correlation` and `slope` (NaN when a sample is constant)
 */
export function parentChild(lives, counted, minTicks) {
    const byId = indexById(lives);
    const parent = [];
    const child = [];
    for (const life of counted) {
        const parents = hunterParents(life, byId, minTicks);
        if (parents.length > 0) {
            parent.push(meanOf(parents.map(blindShare)));
            child.push(blindShare(life));
        }
    }
    const r = parent.length > 1 ? pearson(parent, child) : NaN;
    const change = child.map((c, i) => c - parent[i]);
    return {
        pairs: parent.length,
        parentBlind: meanOf(parent),
        childBlind: meanOf(child),
        change: meanOf(change),
        childLower: share(change.filter((c) => c < 0).length, change.length),
        correlation: r,
        slope: r * share(stddev(child.length > 0 ? child : [0]), stddev(parent.length > 0 ? parent : [0])),
    };
}

/**
 * @param {readonly import('./blind-bite-tracker.js').BiteLife[]} lives every life
 * @returns {Map<number, number>} each life's hunter generation depth: 0 when no parent is a tracked hunter, else 1 + the
 *   deeper parent's depth (a parent is always born before its child, so one pass in birth order settles it)
 */
export function depths(lives) {
    const byId = indexById(lives);
    const depth = new Map();
    for (const life of [...lives].sort((a, b) => a.born - b.born)) {
        const parents = [life.parentA, life.parentB].filter((id) => byId.has(id) && id !== life.id);
        depth.set(life.id, parents.length === 0 ? 0 : 1 + Math.max(...parents.map((id) => depth.get(id) ?? 0)));
    }
    return depth;
}

/**
 * @param {readonly import('./blind-bite-tracker.js').BiteLife[]} lives every life
 * @param {readonly import('./blind-bite-tracker.js').BiteLife[]} counted counted lives
 * @returns {Record<string, {n: number, blind: number, early: number, reach: number}>} per depth bucket (`0`, `1`, `2`, `3-4`,
 *   `5+`): lives, mean blind share, mean early blind share and the share that lived 3000 ticks is left to `bySource`, so
 *   `reach` here is the share that lived at least 600 ticks (maturity)
 */
export function byDepth(lives, counted) {
    const depth = depths(lives);
    const bucket = (/** @type {number} */ d) => (d <= 2 ? String(d) : d <= 4 ? '3-4' : '5+');
    /** @type {Record<string, import('./blind-bite-tracker.js').BiteLife[]>} */
    const groups = {};
    for (const life of counted) {
        (groups[bucket(/** @type {number} */ (depth.get(life.id)))] ??= []).push(life);
    }
    return Object.fromEntries(
        Object.entries(groups).map(([name, group]) => [
            name,
            {
                n: group.length,
                blind: meanOf(group.map(blindShare)),
                early: meanOf(group.map((l) => share(l.earlyBlind, l.earlyTicks))),
                reach: share(group.filter((l) => l.ticks >= 600).length, group.length),
            },
        ]),
    );
}

/**
 * Lives that reached maturity (`maturityTicks`), split by whether a tracked hunter names them as a parent.
 * @param {readonly import('./blind-bite-tracker.js').BiteLife[]} lives every life
 * @param {readonly import('./blind-bite-tracker.js').BiteLife[]} counted counted lives
 * @param {number} maturityTicks the age a hunter must reach to be compared
 * @returns {Record<string, Record<string, number>>} for `parents` and `childless`: `n`, `meanBlind`, `medianAge` and `meanPreyBite`
 */
export function reproducers(lives, counted, maturityTicks) {
    const parentIds = new Set(lives.flatMap((l) => [l.parentA, l.parentB]));
    const mature = counted.filter((l) => l.ticks >= maturityTicks);
    const row = (/** @type {typeof mature} */ group) => ({
        n: group.length,
        meanBlind: meanOf(group.map(blindShare)),
        medianAge: medianOf(group.map((l) => l.ticks)),
        meanPreyBite: meanOf(group.map((l) => l.preyBite)),
    });
    return {
        parents: row(mature.filter((l) => parentIds.has(l.id))),
        childless: row(mature.filter((l) => !parentIds.has(l.id))),
    };
}

/**
 * How the BITE output bias a hunter is born with moves from its hunter parent: `step` is the standard deviation of child minus
 * parent (the mutation and crossover noise on that one weight), `shift` its mean (a push in one direction), and `correlation`
 * how far the child's value follows the parent's, for one birth weight (`bias` or `preyBite` of `BiteLife`).
 * @param {readonly import('./blind-bite-tracker.js').BiteLife[]} lives every life
 * @param {readonly import('./blind-bite-tracker.js').BiteLife[]} counted counted lives
 * @param {'bias' | 'preyBite'} key the birth weight to compare
 * @returns {Record<string, number>} `pairs`, `step`, `shift`, `correlation`
 */
export function biasDrift(lives, counted, key) {
    const byId = indexById(lives);
    const parent = [];
    const child = [];
    for (const life of counted) {
        const parents = hunterParents(life, byId, 1);
        if (parents.length > 0) {
            parent.push(meanOf(parents.map((p) => p[key])));
            child.push(life[key]);
        }
    }
    const diff = child.map((c, i) => c - parent[i]);
    return {
        pairs: parent.length,
        step: diff.length > 0 ? stddev(diff) : 0,
        shift: meanOf(diff),
        correlation: parent.length > 1 ? pearson(parent, child) : NaN,
    };
}
