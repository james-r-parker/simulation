// reads: scripts/role-metric-table.mjs
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ROLE_METRICS } from '../js/evo/metric-registry/roles.js';

const [role, [metric]] = Object.entries(ROLE_METRICS)[0];

/** @param {(number | null)[]} values @param {Record<string, any>} [extra] */
const report = (values, extra = {}) => ({ metrics: { [metric]: { values, ...extra } } });

describe('role-metric-table', () => {
    let dir = '';
    const argv = process.argv;
    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'role-metric-table-'));
        vi.resetModules();
    });
    afterEach(() => {
        process.argv = argv;
        vi.restoreAllMocks();
        rmSync(dir, { recursive: true, force: true });
    });

    /** @param {any[]} files @returns {Promise<string[]>} the printed lines */
    async function table(files) {
        const paths = files.map((f, i) => {
            const p = join(dir, `f${i}.json`);
            writeFileSync(p, JSON.stringify(f));
            return p;
        });
        process.argv = [argv[0], 'role-metric-table.mjs', ...paths];
        const lines = /** @type {string[]} */ ([]);
        vi.spyOn(console, 'log').mockImplementation((line) => void lines.push(String(line)));
        await import('../scripts/role-metric-table.mjs');
        return lines;
    }

    it('prints the null share, distinct values and mean of each report, and the power cells of a metric in E254', async () => {
        const rows = [16, 32, 64].map((size) => ({
            metric,
            size,
            detectable: size === 16 ? 0.5 : 0.25,
            detectableKind: size === 16 ? 'absolute' : 'relative',
            falsePositive: 0.05,
        }));
        const lines = await table([
            report([1, 1, null, 3]),
            report([2, 2, 2, 2]),
            report([0.5, 1.5], { mean: 1 }),
            { rows },
        ]);
        expect(lines[0]).toContain('| Role | Metric |');
        const mine = lines.find((l) => l.startsWith(`| ${role} | \`${metric}\``)) ?? '';
        expect(mine).toContain('1/4 null, 2 distinct, mean 1.67');
        expect(mine).toContain('0/4 null, 1 distinct, mean 2');
        expect(mine).toContain('0/2 null, 2 distinct, mean 1');
        expect(mine).toContain('0.5a / 0.25 / 0.25');
    });

    it('says a metric is absent from a report and not in E254 when it has no power rows', async () => {
        const lines = await table([{ metrics: {} }, { metrics: {} }, { metrics: {} }, { rows: [] }]);
        const mine = lines.find((l) => l.startsWith(`| ${role} | \`${metric}\``)) ?? '';
        expect(mine).toContain('absent | absent | absent');
        expect(mine).toContain('not in E254 | -');
        expect(lines.length).toBe(2 + Object.values(ROLE_METRICS).flat().length);
    });

    it('prints "-" for a metric whose values are all null', async () => {
        const lines = await table([report([null, null]), report([null]), report([1], { mean: 1 }), { rows: [] }]);
        expect(lines.find((l) => l.startsWith(`| ${role} | \`${metric}\``))).toContain('2/2 null, 0 distinct, mean -');
    });
});
