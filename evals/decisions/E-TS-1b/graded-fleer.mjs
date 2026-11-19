// E-TS-1b, hunt stall diagnosis (b): the hunt-stage predator elites against fleers of graded strength. The forager's
// `sprintBoost` (1 on the defaults) is cut in steps; `prey-ahead` and `prey-crossing`, 64 trials, seed 1, for each predator
// elite of each style band, `memoryless` and the lesson oracle. A detector, never fitness.
//   node evals/decisions/E-TS-1b/graded-fleer.mjs <archive.json> [...] > graded-fleer.json
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { drillSubject } from '../../../js/evo/drill.js';
import { DRILLS } from '../../../js/evo/drill-scenarios.js';
import { oracleSubject } from '../../../js/evo/lesson-oracles.js';
import { referenceSubject } from '../../../js/evo/memory-probe-references.js';
import { PREDATOR_SPEC } from '../../../js/evo/memory-probe-scenarios.js';
import { createConfig } from '../../../js/sim/config.js';
import { decodeTrainerArchive } from '../../../scripts/lib/archive-source.mjs';
import { eliteSubjects } from '../../../scripts/lib/drill-subjects.mjs';

const BOOSTS = [1, 0.6, 0.4, 0.2, 0.05];
const LESSONS = ['prey-ahead', 'prey-crossing'];
const out = {};
for (const file of process.argv.slice(2)) {
    const archive = decodeTrainerArchive(JSON.parse(readFileSync(file, 'utf8')), createConfig({}));
    const elites = eliteSubjects(archive).filter((s) => s.spec === PREDATOR_SPEC);
    out[file] = {};
    for (const lesson of LESSONS) {
        const drill = DRILLS.find((d) => d.name === lesson);
        const who = [...elites, referenceSubject('memoryless'), oracleSubject(lesson)];
        out[file][lesson] = Object.fromEntries(
            who.map((s) => [
                s.name,
                Object.fromEntries(
                    BOOSTS.map((b) => [
                        b,
                        drillSubject(drill, s, {
                            seed: 1,
                            trials: 64,
                            config: { specialisations: { forager: { sprintBoost: b } } },
                        }).wins,
                    ]),
                ),
            ]),
        );
    }
}
process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
