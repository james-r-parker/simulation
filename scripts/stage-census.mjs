// Head count by specialisation of a stage world at chosen ticks (training-stages T45), seeded from a trainer archive.
//   node scripts/stage-census.mjs --stage <stage.json> [--archive <archive.json>] [--prey-share <0..1>] [--ticks 2000]
//     [--at 0,100,500,2000] [--seed 1] [--json]
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { createConfig } from '../js/sim/config.js';
import { stageCensus } from '../js/evo/stage-census.js';
import { decodeTrainerArchive } from './lib/archive-source.mjs';

const { values } = parseArgs({
    options: {
        stage: { type: 'string' },
        archive: { type: 'string' },
        'prey-share': { type: 'string' },
        ticks: { type: 'string', default: '2000' },
        at: { type: 'string', default: '0,100,500,2000' },
        seed: { type: 'string', default: '1' },
        json: { type: 'boolean', default: false },
    },
});
if (values.stage === undefined) {
    process.stderr.write(
        'usage: node scripts/stage-census.mjs --stage <stage.json> [--archive <file>] [--prey-share <n>]\n',
    );
    process.exit(2);
}
const seed = Number(values.seed);
const overrides = JSON.parse(readFileSync(values.stage, 'utf8'));
const archive =
    values.archive === undefined
        ? undefined
        : decodeTrainerArchive(
              JSON.parse(readFileSync(values.archive, 'utf8')),
              createConfig({ initialAgents: 100, ...overrides, seed }),
          );
const rows = stageCensus({
    overrides,
    seed,
    ticks: Number(values.ticks),
    at: values.at.split(',').map(Number),
    archive,
    ...(values['prey-share'] === undefined ? {} : { preyShare: Number(values['prey-share']) }),
});
if (values.json) {
    process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
} else {
    for (const { tick, counts, prey } of rows) {
        const parts = Object.entries(counts).map(([name, n]) => `${name} ${n}`);
        process.stdout.write(`tick ${tick}: ${parts.join(', ')} (prey ${prey})\n`);
    }
}
