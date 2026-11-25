### 2026-11-17 - ESLint and nested worktrees

The root lint command (`eslint --max-warnings 0 .`) recursively sees JavaScript files in `.claude/worktrees/`, which are
independent Git worktrees with their own branches and in-progress edits. A root lint run can therefore fail on files
outside the active checkout. Git's `worktree list` confirms those paths are separate checkouts; excluding that one
nested-worktree directory leaves the root `js/`, `test/`, `scripts/` and config paths under the existing lint rules.
