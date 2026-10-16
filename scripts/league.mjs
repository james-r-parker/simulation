// Champion league: plays a candidate against every admitted champion and reports its Elo (`npm run league`).
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MATCH_TICKS, runLeague, validateChampion } from '../js/evo/league.js';
import { createConfig } from '../js/sim/config.js';
import { intValue, parseFlags } from './lib/cli-args.mjs';
import { createJsonlSink } from './lib/jsonl-sink.mjs';
import { runPool } from './lib/worker-pool.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SEEDS_URL = new URL('../evals/seeds.json', import.meta.url);
const WORKER_URL = new URL('./league-worker.mjs', import.meta.url);
const LEAGUE_FILE = join(ROOT, 'evals', 'league.json');
/** Games per champion: the first seeds of `evals/seeds.json`. */
const LEAGUE_SEEDS = 8;
const USAGE = 'usage: league <candidate.json> [--admit] [--workers <n>] [--ticks <n>]';

/**
 * @typedef {object} LeagueArgs
 * @property {string} candidate the candidate champion file
 * @property {boolean} admit append the candidate to `evals/league.json`
 * @property {number | null} workers pool size, default `os.availableParallelism()`
 * @property {number} ticks ticks per game
 */

/**
 * @param {string[]} argv command-line arguments after the script name
 * @returns {LeagueArgs} parsed options
 * @throws {Error} when the candidate file is missing or an argument is unknown
 */
export function parseArgs(argv) {
    const files = argv.filter((arg, i) => !arg.startsWith('--') && !argv[i - 1]?.match(/^--(workers|ticks)$/));
    const flags = argv.filter((arg) => !files.includes(arg));
    if (files.length !== 1) {
        throw new Error(`expected one candidate file, got ${files.length}\n${USAGE}`);
    }
    const parsed = parseFlags(flags, {
        valueFlags: {
            '--workers': (value, flag) => ['workers', intValue(flag, value, 1, USAGE)],
            '--ticks': (value, flag) => ['ticks', intValue(flag, value, 1, USAGE)],
        },
        booleanFlags: { '--admit': 'admit' },
        defaults: { admit: false, workers: null, ticks: MATCH_TICKS },
        usage: USAGE,
    });
    return /** @type {LeagueArgs} */ ({ candidate: files[0], ...parsed });
}

/**
 * @param {string} path a JSON file
 * @returns {Record<string, any>} its contents
 */
function readJson(path) {
    return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * Reads `evals/league.json` and validates every admitted champion file against the default config.
 * @param {string} leaguePath the league file
 * @param {string} root the directory the champion `file` paths are relative to
 * @returns {{ league: Record<string, any>, files: Record<string, any>[] }} the league and its parsed champion files
 * @throws {Error} naming the champion whose file is invalid
 */
export function loadLeague(leaguePath, root) {
    const league = readJson(leaguePath);
    if (league.version !== 1 || !Array.isArray(league.champions)) {
        throw new Error(`${leaguePath}: expected { "version": 1, "champions": [...] }`);
    }
    const config = createConfig();
    const files = league.champions.map((/** @type {Record<string, any>} */ entry) => {
        const file = readJson(resolve(root, entry.file));
        try {
            validateChampion(file, config);
        } catch (error) {
            throw new Error(
                `league champion "${entry.name}" (${entry.file}): ${/** @type {Error} */ (error).message}`,
                {
                    cause: error,
                },
            );
        }
        return file;
    });
    return { league, files };
}

/**
 * @typedef {object} LeagueOptions
 * @property {string} [leaguePath] default `evals/league.json`
 * @property {string} [root] default the repo root
 * @property {string} [logDir] default `.sim/logs`
 * @property {(line: string) => void} [print] receives the summary lines
 */

/**
 * @param {LeagueArgs} args the options
 * @param {LeagueOptions} [options] paths and output
 * @returns {Promise<ReturnType<typeof runLeague>>} the candidate's standing
 */
export async function playLeague(
    args,
    { leaguePath = LEAGUE_FILE, root = ROOT, logDir = '.sim/logs', print = () => {} } = {},
) {
    const { league, files } = loadLeague(leaguePath, root);
    const candidate = readJson(args.candidate);
    validateChampion(candidate, createConfig());
    const seeds = readJson(fileURLToPath(SEEDS_URL)).slice(0, LEAGUE_SEEDS);
    const tasks = seeds.flatMap((/** @type {number} */ seed) =>
        files.map((b) => ({ seed, ticks: args.ticks, a: candidate, b })),
    );
    const workers = args.workers ?? Math.min(availableParallelism(), Math.max(1, tasks.length));
    const results = await runPool(tasks, { workerUrl: WORKER_URL, workers });
    const games = results.map((/** @type {{ seed: number, result: any }} */ r, /** @type {number} */ i) => ({
        seed: r.seed,
        champion: i % Math.max(1, files.length),
        result: r.result,
    }));
    const standing = runLeague(league.champions, games);
    await writeLog(`${candidate.name}-${args.ticks}`, { logDir, candidate: candidate.name, standing, results });
    report(print, candidate.name, standing);
    if (args.admit) {
        league.champions.push({
            file: relative(root, resolve(args.candidate)),
            name: candidate.name,
            elo: standing.elo,
        });
        writeFileSync(leaguePath, `${JSON.stringify(league, null, 2)}\n`);
        print(`admitted ${candidate.name} at Elo ${standing.elo.toFixed(1)}`);
    }
    return standing;
}

/**
 * @param {string} id the run id
 * @param {{ logDir: string, candidate: string, standing: ReturnType<typeof runLeague>, results: Record<string, any>[] }} run the games
 * @returns {Promise<void>}
 */
async function writeLog(id, { logDir, candidate, standing, results }) {
    const path = join(logDir, `league-${id.replace(/[^\w.-]/g, '_')}.jsonl`);
    rmSync(path, { force: true });
    const jsonl = createJsonlSink(path);
    standing.log.forEach((game, i) => {
        const { aliveA, aliveB } = results[i];
        jsonl.sink({
            level: 'info',
            event: 'MatchPlayed',
            seed: game.seed,
            a: candidate,
            b: game.champion,
            result: game.result,
            aliveA,
            aliveB,
            eloBefore: game.eloBefore,
            eloAfter: game.eloAfter,
        });
    });
    await jsonl.close();
}

/**
 * @param {(line: string) => void} print receives the lines
 * @param {string} name the candidate
 * @param {ReturnType<typeof runLeague>} standing its standing
 * @returns {void}
 */
function report(print, name, standing) {
    for (const game of standing.log) {
        print(
            `seed ${game.seed} vs ${game.champion}: ${game.result} (${game.eloBefore.toFixed(1)} -> ${game.eloAfter.toFixed(1)})`,
        );
    }
    print(
        `${name}: ${standing.games} games, ${standing.wins} wins, ${standing.draws} draws, ${standing.losses} losses`,
    );
    for (const [metric, { value, reason }] of Object.entries(standing.metrics)) {
        print(`${metric} ${value === null ? `null (${reason})` : value.toFixed(3)}`);
    }
}

/**
 * @param {string[]} argv command-line arguments after the script name
 * @param {LeagueOptions} [options] paths and output
 * @returns {Promise<number>} the process exit code
 */
export async function main(argv, options = {}) {
    try {
        await playLeague(parseArgs(argv), { print: (line) => console.log(line), ...options });
        return 0;
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        return 1;
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    process.exitCode = await main(process.argv.slice(2));
}
