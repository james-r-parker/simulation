import { afterEach, describe, expect, it, vi } from 'vitest';
import { main } from '../scripts/bench-micro.mjs';

afterEach(() => {
    vi.restoreAllMocks();
});

/**
 * @param {string[]} argv the bench-micro arguments
 * @returns {Promise<{code: number, out: string}>} the exit code and what was printed
 */
async function run(argv) {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const code = await main(argv);
    return { code, out: log.mock.calls.map((call) => call.join(' ')).join('\n') };
}

describe('bench-micro, run for real on the det-math file only', () => {
    it('prints ops/s for each function in the file', async () => {
        const { code, out } = await run(['--filter', 'det-math']);
        expect(code).toBe(0);
        expect(out).toMatch(/det-math: detTanhInto x 1024 +[\d,]+ +\+-[\d.]+%/);
        expect(out).toMatch(/det-math: detSigmoid x 1024/);
    }, 120000);

    it('compares this tree with HEAD, which differs from it only by uncommitted files', async () => {
        const { code, out } = await run(['--compare', 'HEAD', '--runs', '1', '--filter', 'det-math']);
        expect(code).toBe(0);
        expect(out).toMatch(/^base HEAD \([0-9a-f]{9}\) head [0-9a-f]{9}, median of 1 alternating runs/);
        expect(out).toMatch(
            /det-math: detTanh scalar x 1024 +[\d,]+ +[\d,]+ +[+-][\d.]+% +\+-[\d.]+% +(same|faster|slower)/,
        );
    }, 240000);

    it('reports a ref that does not exist', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        const { code } = await run(['--compare', 'no-such-ref-anywhere', '--filter', 'det-math']);
        expect(code).toBe(1);
        expect(error).toHaveBeenCalled();
    }, 60000);
});
