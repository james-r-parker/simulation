import { expect, it } from 'vitest';
import { terminalHunterCount } from '../../js/evo/scene-terminal-hunters.js';
import { sourceRun, starve, zeroPolicy } from './helpers/source-world.js';

const window = { firstTick: 10000, interval: 1000, lastTick: 15000, seasonTicks: 2000 };

it('averages the last complete season including zero and excludes its end boundary and trailing partial season', () => {
    expect(terminalHunterCount([9, 8, 4, 0, 10, 20], window)).toEqual({ value: 2 });
});

it('distinguishes a zero population from absent seasonal evidence', () => {
    expect(terminalHunterCount([0, 0, 0, 0], window)).toEqual({ value: 0 });
    expect(terminalHunterCount([0, 0, 0], window).value).toBeNull();
    expect(terminalHunterCount([0, 0], { ...window, lastTick: 11000 }).value).toBeNull();
    expect(terminalHunterCount([], { ...window, seasonTicks: 0 }).value).toBeNull();
});

it('reads real hunter checkpoints through computeMetrics and still reports zero hunters at the end', () => {
    let nextSpec = 1;
    const policy = { ...zeroPolicy(), initSpec: () => nextSpec };
    const run = sourceRun({ over: { eraSeasonTicks: 2000 }, policy, runTicks: 14000 });
    run.jump(9999);
    const hunter = run.spawn();
    nextSpec = 0;
    run.spawn();
    run.tick();
    run.jump(10999);
    run.tick();
    run.jump(11999);
    run.tick();
    run.jump(12999);
    run.tick((world) => starve(world, hunter, 100));
    run.jump(13999);
    run.tick();
    const result = run.metrics();
    expect(result['eval.predators_at_end_terminal_window']).toEqual({ value: 0.5 });
    expect(result['eval.predators_at_end']).toEqual({ value: 0 });
    expect(result['eval.prey_types_at_end']).toEqual({ value: 1 });
});
