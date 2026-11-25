// CPU lock: re-runs a script under `flock` so a timing job (exclusive) waits for the heavy jobs (shared) on the machine
// (AGENTS.md, Delegating: only timing work needs a quiet machine).

export const DEFAULT_LOCK = '/tmp/claude-1000/cpu.lock';

/**
 * @param {{ lockPath: string, execPath: string, script: string, argv: string[] }} input the lock file, the node
 *   binary, the script to run and its arguments
 * @returns {{ command: string, args: string[] }} `flock -s <lock> node <script> <argv> --no-lock`: the script runs
 *   inside the lock and does not ask for it again. Shared, since a screen is deterministic under load: tests, commit
 *   hooks and other screens run beside it, and only a timing job (exclusive) waits for it
 */
export function lockCommand({ lockPath, execPath, script, argv }) {
    return { command: 'flock', args: ['-s', lockPath, execPath, script, ...argv, '--no-lock'] };
}

/**
 * @param {{ lockPath: string, command: string, args: string[], env?: Record<string, string | undefined> }} input the lock
 *   file and the command to run
 * @returns {{ command: string, args: string[] }} `flock -s <lock> <command> <args>`: a test run holds the lock shared, so
 *   test runs go side by side and a timing job (exclusive) waits for them; unchanged when the caller holds the lock
 *   (`CHECK_CPU_LOCK_HELD=1`) or `CHECK_CPU_LOCK=off`
 */
export function sharedLockCommand({ lockPath, command, args, env = {} }) {
    if (env.CHECK_CPU_LOCK_HELD === '1' || env.CHECK_CPU_LOCK === 'off') {
        return { command, args };
    }
    return { command: 'flock', args: ['-s', lockPath, command, ...args] };
}
