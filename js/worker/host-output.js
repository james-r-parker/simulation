// What the host sends: snapshots, fields, and the stats and ticker messages with their upkeep. Each takes the host
// state; a skipped send (no free buffer) is logged at most once per 10 s.

import { drainObserverLogs } from './observer-drain.js';
import { takeBuffer } from './buffer-pool.js';
import { writeEffects } from './effects.js';
import { writeInspect } from './inspect.js';
import { collectStats, tickerEvents } from './live-stats.js';
import { markSnapshot, snapshotDue } from './pacing.js';
import { writeSnapshot } from '../sim/snapshot.js';

/** Wall time between stats messages (and field messages). */
export const STATS_INTERVAL_MS = 250;

/** The least wall time between two warnings of the same kind. */
export const WARN_INTERVAL_MS = 10000;

/**
 * @typedef {Record<string, any>} HostState the host's mutable state: `post`, `now`, `schedule`, `createPolicy`, `log`,
 *   `run` (null before `init`), `epoch`, `paused`, `stopped`, `ticksPerSecond`, `rays`, `selection`, `pacer`,
 *   `snapshotPool`, `fieldPool`, `timerPending`, `window` and `lastWarn`
 */

/**
 * Logs a warning unless the same event was logged within `WARN_INTERVAL_MS`.
 * @param {HostState} host the host
 * @param {string} event the event name
 * @param {Record<string, any>} fields the record's fields
 * @returns {boolean} whether it was logged
 */
export function warnLimited(host, event, fields) {
    const t = host.now();
    const last = host.lastWarn.get(event);
    if (last !== undefined && t - last < WARN_INTERVAL_MS) {
        return false;
    }
    host.lastWarn.set(event, t);
    host.log.log('warn', event, fields);
    return true;
}

/**
 * Writes the world, the pending effects and the selected agent into a free snapshot buffer and transfers it. Sends
 * nothing, and says so in the log, when the worker holds no buffer; the effects then stay in the log for the next one.
 * @param {HostState} host the host
 * @param {boolean} force send even if the last snapshot was under `snapshotGapMs` ago
 * @returns {boolean} whether a snapshot was sent
 */
export function emitSnapshot(host, force) {
    const { run } = host;
    if (!force && !snapshotDue(host.pacer, host.now())) {
        return false;
    }
    const buffer = takeBuffer(host.snapshotPool);
    if (buffer === undefined) {
        warnLimited(host, 'SnapshotSkipped', { tick: run.world.tick });
        return false;
    }
    const views = { u32: new Uint32Array(buffer), f32: new Float32Array(buffer) };
    writeSnapshot(run.world, views, host.rays);
    if (run.effects.dropped > 0) {
        warnLimited(host, 'EffectsDropped', { count: run.effects.dropped, tick: run.world.tick });
    }
    writeEffects(run.effects, views.u32, run.layout.effectsOffset);
    writeInspect(views, run.layout, run.source, host.selection);
    host.post({ type: 'snapshot', epoch: host.epoch, buffer, tick: run.world.tick }, [buffer]);
    markSnapshot(host.pacer, host.now());
    return true;
}

/**
 * Copies the danger, attack and hunt grids into a free field buffer and transfers it.
 * @param {HostState} host the host
 * @returns {boolean} whether a field was sent
 */
function emitField(host) {
    const { world } = host.run;
    const buffer = takeBuffer(host.fieldPool);
    if (buffer === undefined) {
        warnLimited(host, 'FieldSkipped', { tick: world.tick });
        return false;
    }
    const f32 = new Float32Array(buffer);
    const cells = world.danger.length;
    f32.set(world.danger, 0);
    f32.set(world.attack, cells);
    f32.set(world.hunt, 2 * cells);
    host.post({ type: 'field', epoch: host.epoch, tick: world.tick, buffer }, [buffer]);
    return true;
}

/**
 * Sends `stats`, the pending `ticker` items and a `field`, empties the observer's logs and starts a new stats window.
 * @param {HostState} host the host
 * @returns {void}
 */
export function emitStats(host) {
    const { run, window } = host;
    const t = host.now();
    const seconds = (t - window.startAt) / 1000;
    const stats = collectStats(run.live, run, {
        ticksPerSecond: seconds > 0 ? window.ticks / seconds : 0,
        requestedTicksPerSecond: host.ticksPerSecond,
        droppedTicks: Math.floor(host.pacer.dropped),
        workerMsPerTick: window.ticks > 0 ? window.workMs / window.ticks : 0,
        seed: run.seed,
        configHash: run.configHash,
    });
    host.post({ type: 'stats', epoch: host.epoch, stats });
    const items = tickerEvents(run.live);
    if (items.length > 0) {
        host.post({ type: 'ticker', items });
    }
    emitField(host);
    drainObserverLogs(run.observer);
    window.startAt = t;
    window.ticks = 0;
    window.workMs = 0;
}
