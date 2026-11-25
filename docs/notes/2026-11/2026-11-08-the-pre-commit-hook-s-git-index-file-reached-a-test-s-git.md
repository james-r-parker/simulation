### 2026-11-08 - The pre-commit hook's GIT_INDEX_FILE reached a test's `git worktree add`

The 2026-10-11 rule (each test strips `GIT_*` from the environment of the git it spawns) leaves a gap: a test that
spawns a script, which then spawns git, passes `process.env` through unless its author remembered. On
`feat/deploy-pipeline-v2`, `test/release-check.slow.test.js` runs `scripts/release-check.mjs` with
`{ ...process.env }`, and that script runs `git worktree add --detach <tmp> <merge-base>`. Under the hook, git exports
`GIT_DIR` and `GIT_INDEX_FILE` (absolute paths in a worktree; `git commit <paths>` points `GIT_INDEX_FILE` at a
`next-index-*.lock`), so the new worktree's checkout wrote the merge-base tree into the index being committed.
Reproduced on a clone: the staged change vanished and 1684 paths showed as staged reverts. No test writes
`.prettierignore`: it changed because the merge base held an older `.prettierignore`, and the corrupted index reverted
it. `scripts/check.sh` now records `GIT_DIR`, `GIT_INDEX_FILE` and `GIT_WORK_TREE` after the staged-file read, unsets
them, and hands them back only to the conventions gate (whose `git grep` must read the index being committed);
`test/check-hook-env.test.js` pins that. Spawning git from tests with a stripped environment is still good practice.
