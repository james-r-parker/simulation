// Hunter income split by life (training.md T27): where a hunter's energy came from and who ate the carcass energy,
// read from `HunterLedger` records (one per hunter death; field names as `emitHunterLedger` in `js/sim/log.js` writes
// them). Pure: no files, no sim. A hunter that kills nothing and lives on carcasses is the failure this separates from
// a hunter that hunts; `eval.hunter_carrion_idle_share` (hunter-practice.md T22) calls `splitHunterIncome`.

/**
 * @typedef {object} LedgerRecord the fields of a `HunterLedger` record this reads
 * @property {number} kills deliberate kills in the life
 * @property {number} carcassEnergy energy eaten from carcasses
 * @property {number} killEnergy energy the kill bonus paid
 * @property {number} biteGainEnergy energy the bites took from living prey
 */

/**
 * @typedef {object} IncomeSplit
 * @property {number} lives records counted
 * @property {number} zeroKillLives how many of them killed nothing
 * @property {number} income all income: kill, bite and carcass energy
 * @property {number} killShare kill energy over income (null-safe: 0 when there is no income)
 * @property {number} biteShare bite gain over income
 * @property {number} carcassShare carcass energy over income
 * @property {number} zeroKillCarcassShare the share of all carcass energy eaten by zero-kill lives
 * @property {number} zeroKillCarcassOfIncome carcass energy eaten by zero-kill lives over all income
 */

/**
 * @param {number} part a part
 * @param {number} whole the whole
 * @returns {number} `part / whole`, 0 when the whole is 0
 */
const share = (part, whole) => (whole > 0 ? part / whole : 0);

/**
 * Splits the income of a set of hunter lives.
 * @param {readonly LedgerRecord[]} records the `HunterLedger` records
 * @returns {IncomeSplit} the shares
 */
export function splitHunterIncome(records) {
    let kill = 0;
    let bite = 0;
    let carcass = 0;
    let idleCarcass = 0;
    let zeroKillLives = 0;
    for (const r of records) {
        kill += r.killEnergy;
        bite += r.biteGainEnergy;
        carcass += r.carcassEnergy;
        if (r.kills === 0) {
            zeroKillLives += 1;
            idleCarcass += r.carcassEnergy;
        }
    }
    const income = kill + bite + carcass;
    return {
        lives: records.length,
        zeroKillLives,
        income,
        killShare: share(kill, income),
        biteShare: share(bite, income),
        carcassShare: share(carcass, income),
        zeroKillCarcassShare: share(idleCarcass, carcass),
        zeroKillCarcassOfIncome: share(idleCarcass, income),
    };
}

/**
 * @param {string} text the text of a `.sim/logs/<runId>.jsonl` file
 * @returns {LedgerRecord[]} its `HunterLedger` records (the run needs `--level debug`)
 */
export function ledgerRecords(text) {
    return text
        .split('\n')
        .filter((line) => line.includes('"HunterLedger"'))
        .map((line) => JSON.parse(line))
        .filter((record) => record.event === 'HunterLedger');
}
