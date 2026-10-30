// The `mutationRate` config rule: a probability, `invsqrt`, or `genes:<k>`, resolved against a row length.

const GENES_RULE = /^genes:(\d+(?:\.\d+)?)$/;

/**
 * @param {unknown} value a candidate `mutationRate`
 * @returns {boolean} true for a number above 0 and at most 1, `invsqrt`, or `genes:<k>` with `k` above 0
 */
export function isMutationRate(value) {
    if (typeof value === 'number') {
        return Number.isFinite(value) && value > 0 && value <= 1;
    }
    if (value === 'invsqrt') {
        return true;
    }
    const match = typeof value === 'string' ? GENES_RULE.exec(value) : null;
    return match !== null && Number(match[1]) > 0;
}

/**
 * Resolves the rule to the probability that one gene mutates in a birth.
 * @param {number | string} rule a valid `mutationRate`
 * @param {number} weightCount floats in a weight row (`brainLayout(config).weightCount`)
 * @returns {number} a number above 0 and at most 1: the rule itself, `1 / sqrt(weightCount)`, or `k / weightCount`
 *   (capped at 1)
 */
export function resolveMutationRate(rule, weightCount) {
    if (typeof rule === 'number') {
        return rule;
    }
    if (rule === 'invsqrt') {
        return 1 / Math.sqrt(weightCount);
    }
    const match = GENES_RULE.exec(rule);
    if (match === null) {
        throw new Error(`mutationRate is ${JSON.stringify(rule)}; expected a number, invsqrt or genes:<k>`);
    }
    return Math.min(1, Number(match[1]) / weightCount);
}
