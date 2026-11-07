// Drill throughput (training.md, Drills): each run plays one trial of every drill with a random brain of the drill's
// specialisation, so trials per second per worker is ops/s times the drill count. Each trial is a small staged world,
// created and thrown away, so this prices world birth (the WASM arena included) as well as the step.
// `npm run bench:micro -- --area drill --compare <ref>` prices the kernels against a ref from before them.
import { drillSubject, randomBrains } from '../../js/evo/drill.js';
import { DRILLS } from '../../js/evo/drill-scenarios.js';
import { microSuite } from './fixture.js';

const subjects = DRILLS.map((drill) => /** @type {const} */ ([drill, randomBrains(drill)[0]]));

microSuite('drill', [
    [
        `one trial of each of the ${DRILLS.length} drills (trials/s = ops/s x ${DRILLS.length})`,
        () => {
            let wins = 0;
            for (const [drill, subject] of subjects) {
                wins += drillSubject(drill, subject, { trials: 1 }).wins;
            }
            return wins;
        },
    ],
]);
