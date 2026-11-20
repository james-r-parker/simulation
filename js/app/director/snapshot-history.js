// The director's short history of snapshots: the entry from about 1.5 s earlier is what `chase` gap-closing compares
// against, kept in a bounded ring.

/** Decision interval in seconds (500 ms). */
export const DECISION_INTERVAL_S = 0.5;
/** Lookback window (in simulated seconds) for the earlier snapshot used by `chase` gap detection. */
export const SNAPSHOT_LOOKBACK_S = 1.5;
/** Fixed bound on stored decision snapshots. */
export const MAX_SNAPSHOT_HISTORY = 16;

/**
 * Records a snapshot in the bounded history ring and returns the entry from ~1.5 s earlier.
 * @param {{timeS: number, agents: import('./moments.js').AgentRecord[]}[]} history bounded ring of snapshots
 * @param {number} timeS current simulated time in seconds
 * @param {import('./moments.js').AgentRecord[]} agents current alive agents
 * @returns {import('./moments.js').AgentRecord[]} agents from ~1.5 s ago (or empty array)
 */
export function updateSnapshotHistory(history, timeS, agents) {
    if (history.length > 0 && timeS < history[history.length - 1].timeS) {
        history.length = 0;
    }
    const targetTimeS = timeS - SNAPSHOT_LOOKBACK_S;
    let earlier = /** @type {import('./moments.js').AgentRecord[]} */ ([]);
    for (let i = history.length - 1; i >= 0; i--) {
        if (history[i].timeS <= targetTimeS + 1e-6) {
            earlier = history[i].agents;
            break;
        }
    }
    if (history.length === 0 || timeS - history[history.length - 1].timeS >= DECISION_INTERVAL_S - 1e-6) {
        history.push({ timeS, agents });
        if (history.length > MAX_SNAPSHOT_HISTORY) {
            history.shift();
        }
    }
    return earlier;
}
