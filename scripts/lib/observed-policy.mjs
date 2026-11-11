// The observer and policy a scripted run steps a world with (the live policy needs the observer), built as `npm run eval` does.
import { createObserver } from '../../js/evo/observer.js';
import { getPolicy } from '../../js/evo/policies/index.js';
import { createSimLog } from '../../js/sim/log.js';
import { createRng, fork } from '../../js/sim/rng.js';

/**
 * @param {Record<string, any>} config the world config, with its seed
 * @param {{ policy: string, ticks: number }} run the policy name and the run length
 * @returns {{ observer: Record<string, any>, policy: Record<string, any> }} the observer and the created policy
 */
export function observedPolicy(config, { policy: policyName, ticks }) {
    const observer = createObserver(config, fork(createRng(config.seed), 'eval'), {
        runTicks: ticks,
        checkpointTicks: 1000,
    });
    const log = createSimLog(() => {}, { level: 'error' });
    const policy = getPolicy(policyName).create({ config, log, observer });
    return { observer, policy };
}
