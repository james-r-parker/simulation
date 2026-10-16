// Share of CPU time spent busy between two `os.cpus()` readings, for the eval and bench CPU-use lines.

/**
 * @typedef {{ user: number, nice: number, sys: number, idle: number, irq: number }} CpuTimes
 */

/**
 * @param {readonly { times: CpuTimes }[]} before `os.cpus()` at the start of the interval
 * @param {readonly { times: CpuTimes }[]} after `os.cpus()` at its end
 * @returns {{ pct: number, threads: number }} the share of CPU time not idle (0 to 100) and the thread count
 */
export function cpuUse(before, after) {
    let busy = 0;
    let total = 0;
    after.forEach((cpu, i) => {
        const a = cpu.times;
        const b = before[i].times;
        const all = a.user + a.nice + a.sys + a.irq + a.idle - (b.user + b.nice + b.sys + b.irq + b.idle);
        total += all;
        busy += all - (a.idle - b.idle);
    });
    return { pct: total > 0 ? (100 * busy) / total : 0, threads: after.length };
}
