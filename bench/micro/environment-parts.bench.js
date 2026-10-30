// The environment step phase in its parts (`npm run bench:parts -- --area environment`); the parts are listed in `phase-parts.js`.
import { phaseSuite } from './phase-parts.js';

phaseSuite('environment');
