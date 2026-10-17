// Keeps the eval observer's logs from growing in a run that never ends. The worker reads neither the death log nor the
// checkpoint series, so after each stats message it empties both.

/**
 * Empties the observer's death log and checkpoint series. The logs keep their capacity (they double only when a row
 * lands past it), so after the first drain they stop growing. `deathsDrained` counts the death rows removed, so a
 * policy that numbers death rows from the start of the run (`map-elites-v1`) can find its rows again.
 * @param {Record<string, any>} observer the observer
 * @returns {void}
 */
export function drainObserverLogs(observer) {
    observer.deathsDrained += observer.deathCount;
    observer.deathCount = 0;
    observer.checkpointCount = 0;
}
