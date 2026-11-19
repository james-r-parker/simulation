import { afterEach, describe, expect, it, vi } from 'vitest';
import { runIfEntrypoint } from '../scripts/lib/cli-entrypoint.mjs';

describe('runIfEntrypoint', () => {
    const prior = process.exitCode;

    afterEach(() => {
        process.exitCode = prior;
    });

    it('sets the exit code only for the entrypoint module', async () => {
        const main = vi.fn(async () => 1);
        await runIfEntrypoint(false, ['--unknown'], main);
        expect(main).not.toHaveBeenCalled();
        expect(process.exitCode).toBe(prior);

        await runIfEntrypoint(true, ['--unknown'], main);
        expect(main).toHaveBeenCalledWith(['--unknown']);
        expect(process.exitCode).toBe(1);
    });
});
