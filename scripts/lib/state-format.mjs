// Renders the blocks of `npm run state` as the text page.

/**
 * @param {number | null} share a share in [0, 1]
 * @returns {string} it as a whole percent, `-` for null
 */
function pct(share) {
    return share === null ? '-' : `${Math.round(share * 100)}%`;
}

/**
 * @param {string} text a long line
 * @param {number} max the width to keep
 * @returns {string} the text cut to `max` characters with an ellipsis
 */
function clip(text, max) {
    return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

/**
 * @param {Record<string, any>} s the state object (the `--json` form)
 * @returns {string[]} the Queue, Runs and Machine lines
 */
function head(s) {
    const lines = ['## Queue'];
    for (const row of s.queue) {
        const next = row.next ? `${row.next.id} ${clip(row.next.task, 70)}` : 'no unbuilt task';
        lines.push(`${row.rank.padEnd(4)} ${row.file.padEnd(34)} ${next}`);
    }
    lines.push('', '## Runs');
    for (const r of s.runs) {
        const seeds = r.seedsDone === null ? '' : ` seeds ${r.seedsDone}`;
        lines.push(
            `${r.state.padEnd(9)} ${r.name} workers ${r.workers ?? '-'} since ${r.started}${seeds}  ${clip(r.cmd, 60)}`,
        );
    }
    if (s.runs.length === 0) {
        lines.push('none recorded');
    }
    const m = s.machine;
    lines.push(
        '',
        '## Machine',
        `threads ${m.threads}, load ${m.load.toFixed(2)}, worker budget ${m.budget}, claimed ${m.claimed}, free ${m.free}`,
    );
    return lines;
}

/**
 * @param {Record<string, any>} s the state object (the `--json` form)
 * @returns {string[]} the Ladder, Experiments, Ships, Pull requests and Worktrees lines
 */
function tail(s) {
    const lines = ['', '## Ladder'];
    if (s.ladder) {
        lines.push(`${s.ladder.file}: arm ${s.ladder.arm}, ${s.ladder.runs} runs`);
        lines.push(s.ladder.stages.map((/** @type {any} */ st) => `${st.stage} ${pct(st.passShare)}`).join(', '));
    } else {
        lines.push('no yield.json');
    }
    lines.push('', '## Experiments');
    for (const e of s.experiments.last) {
        lines.push(`${e.id.padEnd(6)} ${e.date} ${e.outcome}`);
    }
    const tally = Object.entries(s.experiments.tally).map(([k, v]) => `${k} ${v}`);
    lines.push(`since ${s.experiments.since}: ${tally.length ? tally.join(', ') : 'none'}`);
    lines.push('', '## Ships');
    const sh = s.ships;
    lines.push(
        sh.ships === 0
            ? 'no merged ships logged'
            : `last ${sh.ships}: median ${sh.medianMinutes ?? '-'} min, ${pct(sh.firstRunGreen)} green on the first run`,
    );
    lines.push('', '## Pull requests');
    if (s.prs === null) {
        lines.push('gh unavailable');
    }
    for (const pr of s.prs ?? []) {
        lines.push(`#${pr.number} ${pr.checks.padEnd(7)} ${pr.branch}  ${clip(pr.title, 60)}`);
    }
    lines.push('', '## Worktrees');
    lines.push(
        s.worktrees
            ? Object.entries(s.worktrees)
                  .map(([k, v]) => `${k} ${v}`)
                  .join(', ')
            : 'not in a repository',
    );
    return lines;
}

/**
 * @param {Record<string, any>} state the state object
 * @returns {string} the page
 */
export function renderState(state) {
    return `${[...head(state), ...tail(state)].join('\n')}\n`;
}
