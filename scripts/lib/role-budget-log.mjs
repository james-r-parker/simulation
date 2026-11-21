// The debug log of `npm run role:budget`: one `RoleBudgetCell` record for each cell of each row.

/**
 * @param {Record<string, any>} config an `arenaConfig`
 * @param {ReturnType<typeof import('../../js/evo/role-budget-matrix.js').matrix>} result the matrix
 * @param {string} hash the config hash
 * @param {import('../../js/sim/log.js').SimLog} log the log
 * @returns {void}
 */
export function logCells(config, result, hash, log) {
    for (const row of result.rows) {
        for (const [step, c] of Object.entries(row.cells)) {
            log.log('debug', 'RoleBudgetCell', {
                row: row.name,
                step,
                margin: c.margin,
                status: c.status,
                binding: c.binding,
                configHash: hash,
            });
        }
    }
}
