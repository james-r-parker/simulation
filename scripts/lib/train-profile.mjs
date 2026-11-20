// Where a training run's wall time goes (docs/designs/training-loop.md, Phase 5, Where a generation's time goes): from the
// `TrainTiming` records `scripts/train.mjs` logs once per generation, each stage's share of wall time in world episodes
// (and the merge), in checkpoints (drills, gate, cross-play) and in the archive, manifest and curve writes, and the share
// of the pool's time the workers spent inside episodes. A detector, never fitness. Pure.
import { padTable } from './drill-report.mjs';

/**
 * @typedef {object} ProfileRow
 * @property {string} stage the stage's name (`all` for the whole run)
 * @property {number} generations generations in it
 * @property {number} episodeSeconds wall seconds in episodes and the merge
 * @property {number} checkpointSeconds wall seconds in checkpoints
 * @property {number} saveSeconds wall seconds writing the archive, manifest and curve row
 * @property {number} wallSeconds the three summed
 * @property {number} episodeShare episode seconds over wall seconds
 * @property {number} checkpointShare checkpoint seconds over wall seconds
 * @property {number} saveShare write seconds over wall seconds
 * @property {number} busyEpisodes the share of the pool's time inside episodes while the episodes ran
 * @property {number} busyWall the share of the pool's time inside episodes over the whole wall time
 */

/**
 * @param {string} stage the row's stage
 * @param {readonly Record<string, any>[]} records the stage's `TrainTiming` records
 * @returns {ProfileRow} the summed row
 */
function row(stage, records) {
    const sum = (/** @type {string} */ key) => records.reduce((total, r) => total + (r[key] ?? 0), 0);
    const [episodeSeconds, checkpointSeconds, saveSeconds] = [
        sum('episodeSeconds'),
        sum('checkpointSeconds'),
        sum('saveSeconds'),
    ];
    const wallSeconds = episodeSeconds + checkpointSeconds + saveSeconds;
    const share = (/** @type {number} */ part, /** @type {number} */ whole) => (whole === 0 ? 0 : part / whole);
    const poolTime = (/** @type {(r: Record<string, any>) => number} */ seconds) =>
        records.reduce((total, r) => total + r.workers * seconds(r), 0);
    const busy = sum('busySeconds');
    return {
        stage,
        generations: records.length,
        episodeSeconds,
        checkpointSeconds,
        saveSeconds,
        wallSeconds,
        episodeShare: share(episodeSeconds, wallSeconds),
        checkpointShare: share(checkpointSeconds, wallSeconds),
        saveShare: share(saveSeconds, wallSeconds),
        busyEpisodes: share(
            busy,
            poolTime((r) => r.episodeSeconds),
        ),
        busyWall: share(
            busy,
            poolTime((r) => r.episodeSeconds + r.checkpointSeconds + r.saveSeconds),
        ),
    };
}

/**
 * @param {readonly Record<string, any>[]} records the run's log records (any event; `TrainTiming` ones are read)
 * @returns {{workers: number, rows: ProfileRow[]}} one row per stage in first-seen order, then the whole run (`all`);
 *   no rows when the log holds no `TrainTiming`
 */
export function profileTimings(records) {
    const timings = records.filter((r) => r.event === 'TrainTiming');
    if (timings.length === 0) {
        return { workers: 0, rows: [] };
    }
    const stages = [...new Set(timings.map((r) => r.stage))];
    return {
        workers: timings[0].workers,
        rows: [
            ...stages.map((stage) =>
                row(
                    stage,
                    timings.filter((r) => r.stage === stage),
                ),
            ),
            row('all', timings),
        ],
    };
}

/**
 * @param {{workers: number, rows: readonly ProfileRow[]}} profile a `profileTimings` result
 * @returns {string[]} the report: one line per stage and the run, with the shares of wall time and the worker busy share
 */
export function formatProfile({ workers, rows }) {
    if (rows.length === 0) {
        return ['no TrainTiming records: the run logged no generation'];
    }
    const pct = (/** @type {number} */ v) => `${(v * 100).toFixed(1)}%`;
    const header = [
        'stage',
        'gens',
        'wall s',
        'episodes',
        'checkpoints',
        'writes',
        'busy in episodes',
        'busy over wall',
    ];
    const body = rows.map((r) => [
        r.stage,
        String(r.generations),
        r.wallSeconds.toFixed(1),
        pct(r.episodeShare),
        pct(r.checkpointShare),
        pct(r.saveShare),
        pct(r.busyEpisodes),
        pct(r.busyWall),
    ]);
    return [`workers ${workers}`, ...padTable([header, ...body])];
}
