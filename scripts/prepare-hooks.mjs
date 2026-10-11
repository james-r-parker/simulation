// npm `prepare` step: point git at .githooks inside a git checkout, and do nothing (never fail) anywhere else.
import { spawnSync } from 'node:child_process';

const inside = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { stdio: 'ignore' });
if (inside.status === 0) {
    spawnSync('git', ['config', 'core.hooksPath', '.githooks'], { stdio: 'ignore' });
}
