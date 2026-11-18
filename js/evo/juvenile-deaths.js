// How hunters die while juvenile (honest-budgets Phase 6, E190): joins the `AgentBorn`, `AgentDied`, `HunterLedger` and
// `HunterKill` records of a `--level debug` replay by genome id and splits the hunter lives born after burn-in by birth
// source, death cause, age at death, income and whether the life ever bit. Pure: no files, no sim. A life that is alive
// and under `juvenileTicks` ticks old at the end of the run is censored and counted nowhere, as `eval.recruit_scene` counts it.

/**
 * @typedef {object} Life one hunter life with a known outcome
 * @property {string} birth the birth source of the `HunterLedger` record
 * @property {number} born the birth tick
 * @property {number} age ticks lived (the run's length minus the birth tick for a life still alive at the end)
 * @property {string} cause the death cause, or `alive` for a life that reached juvenileTicks and was alive at the end
 * @property {boolean} juvenile died under `juvenileTicks` ticks old (the juvenile window of `eval.hunter_juvenile_death_share`)
 * @property {number} kills deliberate kills
 * @property {number} plant plant energy eaten (all food eaten minus carcass energy)
 * @property {number} carcass carcass energy eaten
 * @property {number} bites energy the bites took from living prey plus kill energy
 * @property {boolean} bit landed at least one bite (the kick it paid, or any energy gained from a bite)
 * @property {number} recoil energy charged for lunging at kin or something too big (`HunterRecoilLife`), part of the bite cost
 * @property {number} spend energy spent standing, moving, sprinting and on the kick of its bites (0 while alive)
 * @property {number} firstKillAge age at the first deliberate kill, or -1
 * @property {boolean} parentAlive a parent was alive when it died (always false for a life that did not die)
 */

/**
 * @param {string} text the text of a `.sim/logs/<runId>.jsonl` file
 * @returns {Record<string, any>[]} its records of the four events this reads, with the `RunStarted` record
 */
export function lifeRecords(text) {
    const wanted = [
        '"AgentBorn"',
        '"AgentDied"',
        '"HunterLedger"',
        '"HunterKill"',
        '"HunterRecoilLife"',
        '"RunStarted"',
    ];
    return text
        .split('\n')
        .filter((line) => wanted.some((name) => line.includes(name)))
        .map((line) => JSON.parse(line));
}

/**
 * @param {readonly Record<string, any>[]} records the records of one run
 * @returns {{born: Map<number, any>, died: Map<number, any>, ledger: Map<number, any>, firstKill: Map<number, number>, recoil: Map<string, number>}}
 *   the records by genome id (the recoil energy by `slot:tick`, the first kill as an age)
 */
function indexRecords(records) {
    const index = { born: new Map(), died: new Map(), ledger: new Map(), firstKill: new Map(), recoil: new Map() };
    for (const r of records) {
        if (r.event === 'AgentBorn') {
            index.born.set(r.genomeId, r);
        } else if (r.event === 'AgentDied') {
            index.died.set(r.genomeId, r);
        } else if (r.event === 'HunterLedger') {
            index.ledger.set(r.genomeId, r);
        } else if (r.event === 'HunterRecoilLife') {
            index.recoil.set(`${r.slot}:${r.tick}`, r.energy);
        } else if (r.event === 'HunterKill' && !index.firstKill.has(r.genomeId)) {
            index.firstKill.set(r.genomeId, r.ageTicks);
        }
    }
    return index;
}

/**
 * @param {readonly Record<string, any>[]} records the records of one run
 * @param {{ticks: number, burnIn: number, juvenileTicks: number, hunterSpecs?: readonly number[]}} options the run length, the
 *   first counted birth tick, the juvenileTicks age and the specialisation indices that hunt (default the predator, 1)
 * @returns {Life[]} one entry per hunter born at or after `burnIn` whose outcome is known: dead, or alive at `juvenileTicks`
 */
export function huntersLives(records, { ticks, burnIn, juvenileTicks, hunterSpecs = [1] }) {
    const { born, died, ledger, firstKill, recoil } = indexRecords(records);
    const lives = [];
    for (const [id, record] of ledger) {
        const birth = born.get(id);
        if (birth !== undefined && birth.tick >= burnIn) {
            lives.push(lifeOf({ id, record, birth, died, firstKill, recoil, juvenileTicks }));
        }
    }
    for (const [id, birth] of born) {
        const age = ticks - birth.tick;
        if (birth.tick >= burnIn && hunterSpecs.includes(birth.spec) && !died.has(id) && age >= juvenileTicks) {
            lives.push(aliveLife(birth, age, firstKill.get(id)));
        }
    }
    return lives;
}

/**
 * @param {object} args
 * @param {number} args.id the genome id
 * @param {Record<string, any>} args.record its `HunterLedger` record
 * @param {Record<string, any>} args.birth its `AgentBorn` record
 * @param {Map<number, Record<string, any>>} args.died every `AgentDied` record by genome id
 * @param {Map<number, number>} args.firstKill the age at the first kill by genome id
 * @param {Map<string, number>} args.recoil the recoil energy of each death by `slot:tick`
 * @param {number} args.juvenileTicks the juvenile window
 * @returns {Life} the life
 */
function lifeOf({ id, record, birth, died, firstKill, recoil, juvenileTicks }) {
    const death = died.get(id);
    const food = death?.foodEnergy ?? 0;
    const parentAlive = [birth.parentA, birth.parentB].some(
        (parent) => parent > 0 && (died.get(parent) === undefined || died.get(parent).tick > record.tick),
    );
    return {
        birth: record.birth,
        born: birth.tick,
        age: record.ageTicks,
        cause: record.cause,
        juvenile: record.ageTicks < juvenileTicks,
        recoil: recoil.get(`${death?.slot}:${record.tick}`) ?? 0,
        kills: record.kills,
        plant: Math.max(0, food - record.carcassEnergy),
        carcass: record.carcassEnergy,
        bites: record.biteGainEnergy + record.killEnergy,
        spend: record.standingEnergy + record.moveEnergy + record.sprintEnergy + record.biteCostEnergy,
        bit: record.biteCostEnergy > 0 || record.biteGainEnergy > 0 || record.killEnergy > 0,
        firstKillAge: firstKill.get(id) ?? -1,
        parentAlive,
    };
}

/**
 * @param {Record<string, any>} birth the `AgentBorn` record of a hunter still alive at the end, past juvenileTicks
 * @param {number} age its age at the end
 * @param {number | undefined} firstKill its age at the first kill
 * @returns {Life} the life (its energy accounts are not logged until it dies, so they read 0)
 */
function aliveLife(birth, age, firstKill) {
    const kind = birth.cause === 'initial' ? 'initial' : birth.cause;
    return {
        birth: kind,
        born: birth.tick,
        age,
        cause: 'alive',
        juvenile: false,
        kills: firstKill === undefined ? 0 : 1,
        plant: 0,
        carcass: 0,
        bites: 0,
        recoil: 0,
        spend: 0,
        bit: firstKill !== undefined,
        firstKillAge: firstKill ?? -1,
        parentAlive: false,
    };
}

/**
 * @param {number[]} values numbers
 * @returns {number} their median, 0 for none
 */
function median(values) {
    if (values.length === 0) {
        return 0;
    }
    const sorted = [...values].sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * @param {readonly Life[]} group lives
 * @param {(life: Life) => number} pick the value to add
 * @returns {number} the sum
 */
const sum = (group, pick) => group.reduce((total, life) => total + pick(life), 0);

/**
 * @param {number} part a part
 * @param {number} whole the whole
 * @returns {number} `part / whole`, 0 when the whole is 0
 */
const share = (part, whole) => (whole > 0 ? part / whole : 0);

/**
 * @typedef {object} Row one group of juvenile deaths
 * @property {number} deaths juvenile deaths in the group
 * @property {number} medianAge their median age at death
 * @property {number} bitShare the share that ever bit
 * @property {number} killShare the share with at least one deliberate kill
 * @property {number} fedShare the share that ate anything (plant or carcass)
 * @property {number} parentShare the share with a parent alive at death
 * @property {number} medianFirstKill median age at the first deliberate kill, of the group that killed (0 for none)
 * @property {number} incomePer1k energy eaten or bitten per 1,000 ticks lived, over the group
 * @property {number} recoil energy charged for lunging at kin or something too big (`HunterRecoilLife`), part of the bite cost
 * @property {number} recoilShare recoil energy over all energy spent (the rest is kicks, standing, moving and sprinting)
 * @property {number} spendPer1k energy spent per 1,000 ticks lived, over the group
 */

/**
 * @param {readonly Life[]} group juvenile deaths
 * @returns {Row} their summary
 */
function summarise(group) {
    const n = group.length;
    return {
        deaths: n,
        medianAge: median(group.map((l) => l.age)),
        bitShare: share(group.filter((l) => l.bit).length, n),
        killShare: share(group.filter((l) => l.kills > 0).length, n),
        fedShare: share(group.filter((l) => l.plant + l.carcass > 0).length, n),
        parentShare: share(group.filter((l) => l.parentAlive).length, n),
        medianFirstKill: median(group.filter((l) => l.firstKillAge >= 0).map((l) => l.firstKillAge)),
        incomePer1k:
            (1000 * sum(group, (l) => l.plant + l.carcass + l.bites)) /
            Math.max(
                1,
                sum(group, (l) => l.age),
            ),
        recoilShare:
            sum(group, (l) => l.recoil) /
            Math.max(
                1,
                sum(group, (l) => l.spend),
            ),
        spendPer1k:
            (1000 * sum(group, (l) => l.spend)) /
            Math.max(
                1,
                sum(group, (l) => l.age),
            ),
    };
}

/**
 * @param {readonly Life[]} lives the lives with a known outcome (use `huntersLives`)
 * @param {number} juvenileTicks the juvenileTicks age
 * @returns {{lives: number, juvenileDeaths: number, juvenileDeathShare: number, deathShare: number, all: Row, byBirth: Record<string, Row & {born: number, share: number}>, byCause: Record<string, Row>, byOutcome: Record<string, Row>, ageBuckets: number[]}}
 *   the counts and the juvenile deaths split by birth source, by cause and by age in tenths of `juvenileTicks` (the buckets run 0 to 9)
 */
export function splitJuvenileDeaths(lives, juvenileTicks) {
    const dead = lives.filter((l) => l.juvenile);
    const out = {
        lives: lives.length,
        juvenileDeaths: dead.length,
        juvenileDeathShare: share(dead.length, lives.length),
        deathShare: share(dead.length, lives.filter((l) => l.cause !== 'alive').length),
        all: summarise(dead),
        byBirth: {},
        byCause: {},
        byOutcome: {
            'died juvenile': summarise(dead),
            'died adult': summarise(lives.filter((l) => !l.juvenile && l.cause !== 'alive')),
        },
        ageBuckets: Array.from({ length: 10 }, () => 0),
    };
    for (const source of new Set(lives.map((l) => l.birth))) {
        const born = lives.filter((l) => l.birth === source);
        const deaths = dead.filter((l) => l.birth === source);
        out.byBirth[source] = { ...summarise(deaths), born: born.length, share: share(deaths.length, born.length) };
    }
    for (const cause of new Set(dead.map((l) => l.cause))) {
        out.byCause[cause] = summarise(dead.filter((l) => l.cause === cause));
    }
    for (const l of dead) {
        out.ageBuckets[Math.min(9, Math.floor((l.age * 10) / juvenileTicks))] += 1;
    }
    return out;
}
