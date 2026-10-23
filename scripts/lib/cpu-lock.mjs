// CPU lock: re-runs a script under `flock` so one heavy job holds the machine at a time (AGENTS.md, Delegating).

export const DEFAULT_LOCK = '/tmp/claude-1000/cpu.lock';

/**
 * @param {{ lockPath: string, execPath: string, script: string, argv: string[] }} input the lock file, the node
 *   binary, the script to run and its arguments
 * @returns {{ command: string, args: string[] }} `flock <lock> node <script> <argv> --no-lock`: the script runs inside
 *   the lock and does not ask for it again
 */
export function lockCommand({ lockPath, execPath, script, argv }) {
    return { command: 'flock', args: [lockPath, execPath, script, ...argv, '--no-lock'] };
}
