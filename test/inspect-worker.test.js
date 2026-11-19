import { describe, expect, it, vi } from 'vitest';
import { brainLayout } from '../js/sim/brain-layout.js';
import { runInspectTask, startInspectWorker } from '../scripts/inspect-worker.mjs';

const config = { brainHidden: 2 };
const subject = {
    name: 'worker-subject',
    id: 1,
    spec: 0,
    weights: new Float32Array(brainLayout(config).weightCount),
    act: null,
};
const shared = { subject, drill: 'food-ahead', seed: 4, trials: 1, config };

describe('runInspectTask', () => {
    it('dispatches intact, trace and edit jobs through the registered drill', () => {
        const staged = { ...shared, subject: { ...subject, spec: undefined } };
        const ablation = runInspectTask({ ...staged, kind: 'ablation', unit: null });
        expect(ablation.trials).toMatchObject([{ trial: 0, won: false }]);

        const trace = runInspectTask({ ...staged, kind: 'trace', trial: 0 });
        expect(trace).toMatchObject({ trial: 0, won: false, trace: { ticks: 300 }, drillTrace: null });

        const edit = runInspectTask({ ...staged, kind: 'edit', edits: [] });
        expect(edit.trials).toMatchObject([{ trial: 0, won: false }]);
    });

    it('rejects unknown drills and task kinds', () => {
        expect(() => runInspectTask({ ...shared, drill: 'not-registered', kind: 'trace' })).toThrow(/unknown drill/);
        expect(() => runInspectTask({ ...shared, kind: 'other' })).toThrow(/unknown task kind/);
    });

    it('starts the task server only for worker threads', () => {
        const serve = vi.fn();

        startInspectWorker(false, serve);
        expect(serve).toHaveBeenCalledWith(runInspectTask);
        expect(() => startInspectWorker(true, serve)).not.toThrow();
        expect(serve).toHaveBeenCalledTimes(1);
    });
});
