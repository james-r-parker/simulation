// Entry point of scripts/ship.sh.
import { runShip } from './ship-steps.mjs';

process.exitCode = runShip(process.argv.slice(2));
