// How hunters die while juvenile: `node scripts/juvenile-deaths.mjs <log.jsonl>... [--juvenile-ticks <ticks>] [--burn-in <ticks>]`
// reads `--level debug` replay logs and prints the juvenile deaths split by birth source, death cause and age (E190,
// `js/evo/juvenile-deaths.js`). Several logs are pooled.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { huntersLives, lifeRecords, splitJuvenileDeaths } from '../js/evo/juvenile-deaths.js';
import { exitCodeOf } from './lib/cli-args.mjs';

const USAGE = 'usage: juvenile-deaths <log.jsonl>... [--juvenile-ticks <ticks>] [--burn-in <ticks>]';
const DEFAULTS = { juvenileTicks: 3000, burnIn: 10000 };
const HEADS = [
    'born',
    'deaths',
    'share',
    'medAge',
    'bit',
    'kill',
    'fed',
    'parent',
    '1stKill',
    'in/1k',
    'out/1k',
    'recoil',
];

/**
 * @param {string[]} argv command-line arguments after the script name
 * @returns {{files: string[], juvenileTicks: number, burnIn: number}} the logs and the options
 * @throws {Error} on a bad flag or no log
 */
function parseArgs(argv) {
    const out = { files: /** @type {string[]} */ ([]), ...DEFAULTS };
    for (let i = 0; i < argv.length; i++) {
        const flag = argv[i];
        if (flag === '--juvenile-ticks' || flag === '--burn-in') {
            const value = Number(argv[++i]);
            if (!Number.isInteger(value) || value < 0) {
                throw new Error(`${flag} must be a non-negative integer\n${USAGE}`);
            }
            out[flag === '--juvenile-ticks' ? 'juvenileTicks' : 'burnIn'] = value;
        } else if (flag.startsWith('--')) {
            throw new Error(`unknown flag ${flag}\n${USAGE}`);
        } else {
            out.files.push(flag);
        }
    }
    if (out.files.length === 0) {
        throw new Error(USAGE);
    }
    return out;
}

/**
 * @param {number | undefined} value a number
 * @returns {string} it to 2 decimals, integers as they are, `-` for none
 */
const fmt = (value) => (value === undefined ? '-' : Number.isInteger(value) ? String(value) : value.toFixed(2));

/**
 * @param {string} name the row label
 * @param {Record<string, any>} row a summary row
 * @returns {string} one table line
 */
function line(name, row) {
    const cells = [
        row.born,
        row.deaths,
        row.share,
        row.medianAge,
        row.bitShare,
        row.killShare,
        row.fedShare,
        row.parentShare,
        row.medianFirstKill,
        row.incomePer1k,
        row.spendPer1k,
        row.recoilShare,
    ];
    return name.padEnd(22) + cells.map((c) => fmt(c).padStart(8)).join('');
}

/**
 * @param {string[]} argv command-line arguments after the script name
 * @param {(line: string) => void} print where the output goes
 * @returns {ReturnType<typeof splitJuvenileDeaths>} the split
 * @throws {Error} when a log holds no `RunStarted` record or no hunter life
 */
export function runJuvenileDeaths(argv, print) {
    const { files, juvenileTicks, burnIn } = parseArgs(argv);
    const lives = [];
    for (const file of files) {
        const records = lifeRecords(readFileSync(file, 'utf8'));
        const start = records.find((r) => r.event === 'RunStarted');
        if (start === undefined) {
            throw new Error(`${file} holds no RunStarted record`);
        }
        lives.push(...huntersLives(records, { ticks: start.ticks, burnIn, juvenileTicks }));
    }
    if (lives.length === 0) {
        throw new Error('no hunter life with a known outcome; replay with --level debug and enough ticks');
    }
    const split = splitJuvenileDeaths(lives, juvenileTicks);
    print(
        `hunter lives ${split.lives}, juvenile deaths ${split.juvenileDeaths}, share of lives ${fmt(split.juvenileDeathShare)}, share of deaths ${fmt(split.deathShare)}`,
    );
    print('group'.padEnd(22) + HEADS.map((h) => h.padStart(8)).join(''));
    for (const [name, row] of Object.entries(split.byBirth)) {
        print(line(`birth ${name}`, row));
    }
    for (const [name, row] of Object.entries(split.byCause)) {
        print(line(`cause ${name}`, row));
    }
    for (const [name, row] of Object.entries(split.byOutcome)) {
        print(line(name, row));
    }
    print(`deaths by tenth of the juvenile window: ${split.ageBuckets.join(' ')}`);
    return split;
}

/** @type {(argv: string[]) => Promise<number>} runs the script on `argv` and returns the process exit code */
export const main = (argv) => exitCodeOf(async () => runJuvenileDeaths(argv, console.log));

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
    process.exitCode = await main(process.argv.slice(2));
}
