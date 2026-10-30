// The hash step phase in its parts (`npm run bench:parts -- --area hash`); the parts are listed in `phase-parts.js`.
import { phaseSuite } from './phase-parts.js';

phaseSuite('hash');
