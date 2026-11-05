// The Kaplan-Meier estimate of a time to an event with censored observations (hunter-learning.md, Detectors): the median and
// the restricted mean of the no-event-yet curve. A pure function of the observations; nothing is allocated per tick.

/**
 * @typedef {object} KaplanMeier
 * @property {number | null} median the smallest time at which the no-event-yet curve is at most 0.5, or `null` while it stays above
 * @property {number} rmst the restricted mean: the area under the curve from 0 to the horizon
 */

/**
 * The product-limit estimate. At each distinct event time `t` the curve is multiplied by `1 - d / n`, with `d` the events at
 * `t` and `n` the observations still at risk (time at least `t`, so an observation censored at `t` is still at risk at `t`).
 * The curve is flat between event times, and flat after the last observation up to the horizon.
 * @param {ArrayLike<number>} times each observation's time: the event time, or the time it was censored
 * @param {ArrayLike<number>} events 1 where the event happened, 0 where the observation was censored (same length)
 * @param {number} horizon the upper limit of the restricted mean, at least 0
 * @returns {KaplanMeier} the median and the restricted mean (0 with no observation)
 */
export function kaplanMeier(times, events, horizon) {
    const n = times.length;
    if (events.length !== n) {
        throw new Error(`kaplanMeier: ${n} times but ${events.length} events`);
    }
    const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => times[a] - times[b] || a - b);
    let atRisk = n;
    let survival = 1;
    let median = null;
    let rmst = 0;
    let last = 0;
    let i = 0;
    while (i < n) {
        const t = times[order[i]];
        let deaths = 0;
        let leaving = 0;
        while (i < n && times[order[i]] === t) {
            deaths += events[order[i]];
            leaving += 1;
            i += 1;
        }
        if (deaths > 0) {
            const clipped = Math.min(t, horizon);
            rmst += survival * (clipped - last);
            last = clipped;
            survival *= 1 - deaths / atRisk;
            median = median === null && survival <= 0.5 ? t : median;
        }
        atRisk -= leaving;
    }
    return { median, rmst: n === 0 ? 0 : rmst + survival * (horizon - last) };
}
