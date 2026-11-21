// `scripts/experiment.mjs new`: the next id and a record to fill in. The record fails `check-experiments` until its
// fields are written, so an unfilled one cannot be committed past the gate.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gitIn, nextId } from './experiment-ids.mjs';
import { ledgerDir } from './ledger.mjs';

/**
 * @typedef {object} NewOptions
 * @property {string} plan the design doc file name, `agent-workflow.md`
 * @property {string} [task] the task id in that doc
 * @property {string} [stream] the lane that ran it
 */

/**
 * @param {string} id the record id
 * @param {NewOptions} options the plan, task and stream
 * @param {{ date: string, branch: string }} where the day and the branch the record is written on
 * @returns {Record<string, any>} a record with every required field present and `kind`, `outcome` and the prose unset
 */
export function skeleton(id, { plan, task, stream }, { date, branch }) {
    return {
        id,
        plan,
        ...(task === undefined ? {} : { task }),
        ...(stream === undefined ? {} : { stream }),
        date,
        branch,
        hypothesis: '',
        prediction: '',
        targets: [],
        before: '',
        after: '',
        verdicts: {},
        effect: '',
        note: '',
    };
}

/**
 * Writes `evals/ledger/E<next id>.json` into the working tree.
 * @param {string} root the repository root
 * @param {NewOptions} options the plan, task and stream
 * @param {string} today the date, `YYYY-MM-DD`
 * @param {import('./experiment-ids.mjs').Git} [git] a git runner (default: git in `root`)
 * @returns {string} the id written
 */
export function createRecord(root, options, today, git = gitIn(root)) {
    const id = nextId(root, git);
    const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']).trim() || 'unknown';
    mkdirSync(ledgerDir(root), { recursive: true });
    const record = skeleton(id, options, { date: today, branch });
    writeFileSync(join(ledgerDir(root), `${id}.json`), `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
    return id;
}
