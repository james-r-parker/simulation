import { serveTasks } from '../../scripts/lib/worker-pool.mjs';

serveTasks(async (task) => {
    if (task.fail) throw new Error(task.fail);
    if (task.crash) process.exit(3);
    if (task.quit) process.exit(0);
    await new Promise((resolve) => setTimeout(resolve, task.delay ?? 0));
    return { value: task.value, thread: process.pid };
});
