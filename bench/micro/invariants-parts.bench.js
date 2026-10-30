// The invariants step phase in its parts (`npm run bench:parts -- --area invariants`); the parts are listed in `phase-parts.js`.
import { phaseSuite } from './phase-parts.js';

phaseSuite('invariants');
