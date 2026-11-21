// The role drills (docs/designs/training-loop.md, T34): one level 2 drill for each role whose scene of
// docs/designs/role-budget.md is built, a genome in the performer's seat. Same shape as the drills of `drill-scenarios.js`,
// which does not list them: the drill command, the learn probe and the train manifest enumerate `DRILLS` and read a lesson
// oracle for each, and a role drill has neither a ladder gate nor a lesson oracle yet. Its reference is `drill.reference()`,
// its bar the budget row (`drill-role-row.js`). A drill's score is a detector; it never enters fitness, merit, mate rank or
// archive rank.

import { DEFEND_CALLER } from './drill-role-defend.js';
import { WARN_HERD } from './drill-role-warn.js';

/** The role drills built so far: `defend-caller` and `warn-herd`. `clear-herd` and `make-a-living` follow with their scenes. */
export const ROLE_DRILLS = Object.freeze([DEFEND_CALLER, WARN_HERD]);
