// Writes deterministic Markdown and JSONL files for a brain inspection dossier.

import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { OUTPUT_COUNT } from '../../js/sim/brain-layout.js';

/**
 * Writes every report for one inspected champion.
 * @param {Record<string, any>} report the weights, labels, traces, summaries and trial comparisons
 * @param {string} out destination directory
 * @returns {void}
 */
export function writeDossier(report, out) {
    mkdirSync(out, { recursive: true });
    for (const name of readdirSync(out)) {
        if (/^trace-\d+\.jsonl$/.test(name) || (name === 'edit.md' && report.edit === null)) {
            rmSync(join(out, name));
        }
    }
    writeFileSync(join(out, 'weights.md'), weightsReport(report));
    writeFileSync(join(out, 'summary.md'), summaryReport(report));
    writeFileSync(join(out, 'ablation.md'), ablationReport(report));
    for (const trace of report.traces) {
        writeFileSync(join(out, `trace-${trace.trial}.jsonl`), traceJsonl(trace, report.labels));
    }
    if (report.edit !== null) {
        writeFileSync(join(out, 'edit.md'), editReport(report.edit));
    }
}

/**
 * Formats all weight tables.
 * @param {Record<string, any>} report the report data
 * @returns {string} Markdown weight tables
 */
function weightsReport(report) {
    const lines = [
        `# Weights: ${report.subject.name}`,
        '',
        '## Hidden units',
        '',
        '| Unit | Leak | Bias | Incoming inputs | Incoming recurrent | Outgoing |',
        '| --- | ---: | ---: | --- | --- | --- |',
    ];
    for (const unit of report.units) {
        lines.push(
            `| ${unit.unit} | ${number(unit.leak)} | ${number(unit.bias)} | ${weightList(unit.incoming.input)} | ${weightList(unit.incoming.recurrent)} | ${weightList(unit.outgoing)} |`,
        );
    }
    lines.push('', '## Skip weights', '', '| Output | Bias | Top pooled inputs |', '| --- | ---: | --- |');
    for (const output of report.skip) {
        lines.push(`| ${output.label} | ${number(output.bias)} | ${weightList(output.weights)} |`);
    }
    lines.push('', '## Traits', '', '| Trait | Gene |', '| --- | ---: |');
    for (const [name, value] of Object.entries(report.traits)) {
        lines.push(`| ${name} | ${number(value)} |`);
    }
    return `${lines.join('\n')}\n`;
}

/**
 * Formats trace summaries and trial outcomes.
 * @param {Record<string, any>} report the report data
 * @returns {string} Markdown summaries
 */
function summaryReport(report) {
    const lines = [`# Trace summary: ${report.subject.name}`, '', `Drill: ${report.drill}`, ''];
    for (const trace of report.traces) {
        lines.push(
            `## Trial ${trace.trial}`,
            '',
            `Won: ${trace.won}; ticks: ${trace.summary.ticks}`,
            '',
            '### Hidden units',
            '',
            '| Unit | Mean | Min | Max | Largest change tick |',
            '| --- | ---: | ---: | ---: | ---: |',
        );
        for (const unit of trace.summary.hidden) {
            lines.push(
                `| ${unit.unit} | ${number(unit.mean)} | ${number(unit.min)} | ${number(unit.max)} | ${unit.largestChangeTick ?? '-'} |`,
            );
        }
        lines.push(
            '',
            '### Output firing',
            '',
            '| Output | Firing share | Ticks fired / alive |',
            '| --- | ---: | ---: |',
        );
        for (const output of trace.summary.outputs) {
            lines.push(
                `| ${output.output} | ${number(output.firingShare)} | ${output.firingTicks} / ${output.aliveTicks} |`,
            );
        }
        lines.push('', `Active inputs: ${trace.summary.inputs.join(', ') || 'none'}`, '');
    }
    return `${lines.join('\n')}\n`;
}

/**
 * Formats one row per hidden unit's paired ablation.
 * @param {Record<string, any>} report the report data
 * @returns {string} Markdown ablation table
 */
function ablationReport(report) {
    const rows = /** @type {Array<Record<string, any>>} */ (
        report.ablations
            .map((/** @type {{unit: number, comparison: Record<string, any>}} */ row) => ({
                unit: row.unit,
                ...row.comparison,
            }))
            .sort(
                (/** @type {Record<string, any>} */ a, /** @type {Record<string, any>} */ b) =>
                    a.change - b.change || a.unit - b.unit,
            )
    );
    const lines = [
        `# Unit ablation: ${report.subject.name}`,
        '',
        `Drill: ${report.drill}; trials: ${report.trials}; seed: ${report.seed}`,
        '',
        '| Unit | Intact | Silenced | Change | Before only | After only | McNemar p |',
        '| ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ];
    for (const row of rows) {
        lines.push(
            `| ${row.unit} | ${number(row.beforeWinShare)} | ${number(row.afterWinShare)} | ${number(row.change)} | ${row.beforeOnly.join(',') || '-'} | ${row.afterOnly.join(',') || '-'} | ${number(row.mcnemarP)} |`,
        );
    }
    return `${lines.join('\n')}\n`;
}

/**
 * Formats the arbitrary edit and its paired result.
 * @param {Record<string, any>} edit the edit array and comparison
 * @returns {string} Markdown edit report
 */
function editReport(edit) {
    const row = edit.comparison;
    return [
        '# Edited trial comparison',
        '',
        `Edits: \`${JSON.stringify(edit.edits)}\``,
        '',
        '| Intact | Edited | Change | Before only | After only | McNemar p |',
        '| ---: | ---: | ---: | ---: | ---: | ---: |',
        `| ${number(row.beforeWinShare)} | ${number(row.afterWinShare)} | ${number(row.change)} | ${row.beforeOnly.join(',') || '-'} | ${row.afterOnly.join(',') || '-'} | ${number(row.mcnemarP)} |`,
        '',
    ].join('\n');
}

/**
 * Serializes one trial trace as one JSON record per tick.
 * @param {Record<string, any>} trace the trace arrays and result
 * @param {{inputs: string[], outputs: string[], units: string[]}} labels trace labels
 * @returns {string} JSONL ticks
 */
function traceJsonl(trace, labels) {
    const outputs = outputRowLabels(labels.outputs);
    const lines = [];
    for (let tick = 0; tick < trace.trace.ticks; tick++) {
        const { pooled, hidden, outputs: values } = trace.trace;
        const inputs = Object.fromEntries(
            labels.inputs.flatMap((label, i) =>
                pooled[tick * labels.inputs.length + i] === 0 ? [] : [[label, pooled[tick * labels.inputs.length + i]]],
            ),
        );
        const hiddenValues = Object.fromEntries(
            labels.units.map((label, i) => [label, hidden[tick * labels.units.length + i]]),
        );
        const outputValues = Object.fromEntries(outputs.map((label, i) => [label, values[tick * OUTPUT_COUNT + i]]));
        lines.push(
            JSON.stringify({
                tick,
                inputs,
                hidden: hiddenValues,
                outputs: outputValues,
                x: trace.trace.x[tick],
                y: trace.trace.y[tick],
                heading: trace.trace.heading[tick],
                energy: trace.trace.energy[tick],
                alive: trace.trace.alive[tick] === 1,
            }),
        );
    }
    return `${lines.join('\n')}\n`;
}

/**
 * Labels output-row slots, including the split slot without a gene.
 * @param {string[]} geneLabels labels ordered by `GENE_OUTPUTS`
 * @returns {string[]} full output-row labels
 */
function outputRowLabels(geneLabels) {
    return [...geneLabels.slice(0, 8), 'split', ...geneLabels.slice(8)];
}

/**
 * Formats labelled weight values.
 * @param {Array<{label: string, value: number}>} entries the weights
 * @returns {string} a compact label=value list
 */
function weightList(entries) {
    return entries.map(({ label, value }) => `${label}=${number(value)}`).join(', ') || '-';
}

/**
 * Formats a number to a stable six-decimal display.
 * @param {number} value the number
 * @returns {string} its decimal form
 */
function number(value) {
    return Number.isFinite(value) ? value.toFixed(6) : String(value);
}
