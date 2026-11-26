// Finds active plans' metric dependencies and renders their measured power without changing the registry.
import { renderTable as markdownTable } from '../metrics-doc.mjs';
import { isFlat, metricStatus, meetsPowerBar } from '../../js/evo/metric-registry/status.js';

/** @typedef {{plan: string, line: number, kind: string}} Reference */
/** @typedef {{metric: string, references: Reference[]}} Target */

/** @param {string[]} lines markdown lines @param {number} start paragraph start @returns {number} final line */
function paragraphEnd(lines, start) {
    let end = start;
    while (
        end + 1 < lines.length &&
        lines[end + 1].trim() !== '' &&
        !/^(?:#|\||\*\*Targets:|```)/.test(lines[end + 1])
    ) {
        end++;
    }
    return end;
}

/** @param {string} line markdown line @param {string} previous previous line @param {string} table current table kind @returns {string} table kind */
function tableKind(line, previous, table) {
    if (!line.startsWith('|')) {
        return '';
    }
    if (previous.startsWith('|')) {
        return table;
    }
    return /\bdone\b|predict/i.test(line) ? 'done/prediction table' : '';
}

/** @param {string} line markdown line @param {string} current current section @returns {string} dependency section */
function sectionKind(line, current) {
    if (/^#{1,6} |^\*\*(?:Prediction|Done)/i.test(line)) {
        return /\bdone\b|predict/i.test(line) ? 'done/prediction section' : '';
    }
    return current;
}

/** @param {string} line markdown line @param {string} table table scope @param {string} section section scope @returns {string} dependency kind */
function blockKind(line, table, section) {
    return /^\*\*Targets:\*\*/.test(line) ? 'Targets' : table || section;
}

/** @param {string[]} lines markdown lines @param {number} index current line @returns {number} final line */
function blockEnd(lines, index) {
    return lines[index].startsWith('|') ? index : paragraphEnd(lines, index);
}

/** @param {string} text markdown @returns {{text: string, line: number, kind: string}[]} */
export function dependencyBlocks(text) {
    const lines = text.split('\n');
    const blocks = [];
    let section = '';
    let table = '';
    let fence = false;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/^```/.test(line)) {
            fence = !fence;
            continue;
        }
        if (fence || line.trim() === '') {
            continue;
        }
        section = sectionKind(line, section);
        table = tableKind(line, lines[i - 1] ?? '', table);
        const kind = blockKind(line, table, section);
        const end = blockEnd(lines, i);
        const paragraph = lines.slice(i, end + 1).join('\n');
        if (kind || /\bdone\b|predict/i.test(paragraph)) {
            blocks.push({ text: paragraph, line: i + 1, kind: kind || 'done/prediction prose' });
        }
        i = end;
    }
    return blocks;
}

/** @param {string} text dependency text @param {string[]} names registry keys @param {string} kind dependency context @returns {string[]} expanded metric tokens */
function metricTokens(text, names, kind) {
    if (/No baseline prediction is claimed|makes no baseline prediction|^\*\*Targets:\*\* none\b/i.test(text)) {
        return [];
    }
    const tokens = text.match(/\beval\.[a-zA-Z0-9_@*-]+(?:\.[a-zA-Z0-9_@*-]+)*/g) ?? [];
    return tokens.flatMap((token) => {
        const clean = token.replace(/\.$/, '');
        if (clean === 'eval.*' && kind !== 'Targets') {
            return [];
        }
        return clean.endsWith('*') ? names.filter((name) => name.startsWith(clean.slice(0, -1))) : [clean];
    });
}

/** @param {Map<string, Target>} targets accumulator @param {string} metric registry key @param {Reference} reference source */
function addReference(targets, metric, reference) {
    const target = targets.get(metric) ?? { metric, references: [] };
    if (!target.references.some((ref) => ref.plan === reference.plan && ref.line === reference.line)) {
        target.references.push(reference);
    }
    targets.set(metric, target);
}

/** @param {Record<string, string>} docs markdown by filename @param {Readonly<Record<string, any>>} registry entries @returns {Target[]} the unverified and the flat metrics active plans name */
export function findTargets(docs, registry) {
    /** @type {Map<string, Target>} */
    const targets = new Map();
    const names = Object.keys(registry).sort();
    for (const [plan, text] of Object.entries(docs).sort()) {
        if (!/^\*\*Status:\*\* (?:Proposed|In progress)\b/m.test(text)) {
            continue;
        }
        for (const block of dependencyBlocks(text)) {
            const matches = metricTokens(block.text, names, block.kind).filter(
                (metric) =>
                    registry[metric] && (metricStatus(registry[metric]) === 'unverified' || isFlat(registry[metric])),
            );
            matches.forEach((metric) => addReference(targets, metric, { plan, line: block.line, kind: block.kind }));
        }
    }
    return [...targets.values()].sort((a, b) => a.metric.localeCompare(b.metric));
}

/** @param {Target[]} targets inventory @param {Readonly<Record<string, any>>} registry entries @returns {Target[]} the targets that read flat: they miss the liveness bar and carry `expectedFlat`, so no plan may judge on them */
export function flatTargets(targets, registry) {
    return targets.filter((target) => registry[target.metric] && isFlat(registry[target.metric]));
}

/** @param {any} row power row @param {any} entry registry entry @param {number} mean reference mean @returns {boolean} */
export function passes(row, entry, mean) {
    const power = {
        referenceMean: mean,
        fpr16: null,
        fpr32: null,
        mde16: null,
        mde32: null,
        [`fpr${row.size}`]: row.falsePositive,
        [`mde${row.size}`]: row.detectable,
        report: '',
    };
    return meetsPowerBar({ unit: entry.unit, power }, row.size);
}

/** @param {any} row power reading @returns {string} */
function reading(row) {
    if (!row) {
        throw new Error('missing power row');
    }
    const fpr = row.falsePositive === null ? '-' : row.falsePositive.toFixed(3);
    const mde =
        row.detectable === null ? '-' : `${row.detectable}${row.detectableKind === 'absolute' ? ' abs' : ' rel'}`;
    return `${fpr} / ${mde}${row.note ? ` (${row.note})` : ''}`;
}

/** @param {Target[]} targets inventory @param {any[]} rows power rows @param {any} report source report @param {Readonly<Record<string, any>>} registry entries @returns {string} */
export function renderTable(targets, rows, report, registry) {
    const lines = [
        ['Metric', '16: FPR / MDE', '32: FPR / MDE', '64: FPR / MDE', 'Seeds needed (power only)', 'Plans referenced'],
    ];
    for (const target of targets) {
        const readings = [16, 32, 64].map((size) =>
            rows.find((row) => row.metric === target.metric && row.size === size),
        );
        const minimum = readings.find(
            (row) => row && passes(row, registry[target.metric], report.metrics[target.metric].mean),
        );
        const plans = [...new Set(target.references.map((ref) => ref.plan))]
            .map((plan) => `[${plan}](${plan})`)
            .join(', ');
        lines.push([
            `\`${target.metric}\`${isFlat(registry[target.metric]) ? ' (flat)' : ''}`,
            ...readings.map(reading),
            String(minimum?.size ?? 'fails through 64'),
            plans,
        ]);
    }
    return markdownTable(lines).join('\n');
}

/** @param {string} text document @param {string} table generated table @returns {string} document with replaced table */
export function replaceTable(text, table) {
    const start = '<!-- metric-noise:start -->';
    const end = '<!-- metric-noise:end -->';
    if (text.indexOf(start) < 0 || text.indexOf(end) <= text.indexOf(start)) {
        throw new Error('metric-noise table markers missing or out of order');
    }
    return text.slice(0, text.indexOf(start) + start.length) + '\n\n' + table + '\n\n' + text.slice(text.indexOf(end));
}
