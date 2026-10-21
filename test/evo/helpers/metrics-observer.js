import { ensureRoom } from '../../../js/evo/growable-log.js';
import { observed } from './observer-world.js';

/**
 * A fresh observer (maturityTicks 20) for hand-built metric state.
 * @returns {any} the observer
 */
export function bareObserver() {
    return observed({ maturityTicks: 20 }).observer;
}

/**
 * Appends a death row.
 * @param {any} observer the observer
 * @param {Record<string, number>} f death-log columns; unset ones are 0, `fitness` is NaN
 * @returns {void}
 */
export function addDeath(observer, f) {
    const i = observer.deathCount++;
    ensureRoom(observer.deaths, i);
    for (const name of [...observer.deathFields, 'fitness']) {
        observer.deaths[name][i] = f[name] ?? (name === 'fitness' ? NaN : 0);
    }
}

/**
 * Appends a checkpoint row.
 * @param {any} observer the observer
 * @param {Record<string, number>} f series columns; unset ones are 0, `diversity` is NaN
 * @returns {void}
 */
export function addCheckpoint(observer, f) {
    const i = observer.checkpointCount++;
    ensureRoom(observer.series, i);
    for (const name of [
        'tick',
        'population',
        'lineagesAlive',
        'dominantLineage',
        'predatorShare',
        'diversity',
        'specMask',
        'archiveAgents',
    ]) {
        observer.series[name][i] = f[name] ?? (name === 'diversity' ? NaN : 0);
    }
}

/**
 * Marks a slot as a tracked alive agent.
 * @param {any} observer the observer
 * @param {number} slot the slot
 * @param {Record<string, number>} f per-slot values by array name
 * @returns {void}
 */
export function addAlive(observer, slot, f) {
    observer.slotOf.set(slot + 100, slot);
    for (const [name, v] of Object.entries(f)) {
        observer[name][slot] = v;
    }
}
