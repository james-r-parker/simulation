// The insights drawer's table: a heading row and a pool of body rows whose cells are rewritten only when their text
// changed. A row may be clickable (it reports itself to `onPick`) and may carry a colour swatch. Over an injected
// document, so the tests read the cells back.

/**
 * @typedef {object} TableRow
 * @property {string[]} cells the cell texts, one per column
 * @property {string} [color] a CSS colour for the row's swatch
 * @property {boolean} [pick] whether a click on the row means something
 * @property {boolean} [muted] whether the row reads as absent (no signal, nothing yet)
 * @property {any} [target] what the row hands to `onPick`
 */

/**
 * @param {{createElement: (tag: string) => any}} doc the document
 * @param {any} parent where the table goes
 * @param {{title?: string, className?: string, columns: readonly string[], onPick?: (target: any) => void}} options an
 *   optional heading, a class, the column headings (empty strings for none), and what a click on a clickable row does
 * @returns {{element: any, update: (rows: readonly TableRow[]) => void, rows: () => number}} `update` shows the rows,
 *   reusing the row elements; `rows` is how many are shown
 */
export function mountTable(doc, parent, { title, className = '', columns, onPick }) {
    const section = doc.createElement('section');
    section.className = `insights-section ${className}`.trim();
    if (title !== undefined) {
        const heading = doc.createElement('h3');
        heading.className = 'insights-heading';
        heading.textContent = title;
        section.appendChild(heading);
    }
    const table = doc.createElement('table');
    table.className = 'insights-table';
    if (columns.some((c) => c !== '')) {
        const head = doc.createElement('tr');
        for (const column of columns) {
            const th = doc.createElement('th');
            th.textContent = column;
            head.appendChild(th);
        }
        table.appendChild(head);
    }
    section.appendChild(table);
    parent.appendChild(section);
    /** @type {{row: any, cells: any[]}[]} */
    const pool = [];
    /** @type {readonly TableRow[]} */
    let shown = [];
    const grow = () => {
        const at = pool.length;
        pool.push(createRow(doc, table, { columns: columns.length, activate: () => activate(at) }));
    };
    /** @param {number} at */
    const activate = (at) => {
        if (shown[at]?.pick === true) {
            onPick?.(shown[at].target);
        }
    };
    return {
        element: section,
        rows: () => shown.length,
        update(rows) {
            shown = rows;
            while (pool.length < rows.length) {
                grow();
            }
            pool.forEach(({ row, cells }, i) => paint(row, cells, rows[i]));
        },
    };
}

/**
 * @param {{createElement: (tag: string) => any}} doc the document
 * @param {any} table the table element the row joins
 * @param {{columns: number, activate: () => void}} options the cells in the row and what a click or Enter does
 * @returns {{row: any, cells: any[]}} the new row and its cells
 */
function createRow(doc, table, { columns, activate }) {
    const row = doc.createElement('tr');
    row.className = 'insights-row';
    const cells = Array.from({ length: columns }, () => {
        const td = doc.createElement('td');
        row.appendChild(td);
        return td;
    });
    row.addEventListener('click', activate);
    row.addEventListener('keydown', (/** @type {{key?: string}} */ e) => e.key === 'Enter' && activate());
    table.appendChild(row);
    return { row, cells };
}

/**
 * @param {any} row the row element
 * @param {any[]} cells its cells
 * @param {TableRow | undefined} data what it shows, undefined to hide it
 * @returns {void}
 */
function paint(row, cells, data) {
    row.hidden = data === undefined;
    if (data === undefined) {
        return;
    }
    cells.forEach((td, c) => {
        const text = data.cells[c] ?? '';
        if (td.textContent !== text) {
            td.textContent = text;
        }
    });
    row.classList.toggle('pick', data.pick === true);
    row.classList.toggle('muted', data.muted === true);
    if (data.pick === true) {
        row.setAttribute('tabindex', '0');
        row.setAttribute('role', 'button');
    }
    if (data.color !== undefined) {
        row.style.setProperty('--swatch', data.color);
    }
}

/**
 * @param {{createElement: (tag: string) => any}} doc the document
 * @param {any} parent where the note goes
 * @param {string} text what it says
 * @returns {any} the note's element
 */
export function mountNote(doc, parent, text) {
    const note = doc.createElement('p');
    note.className = 'insights-note';
    note.textContent = text;
    parent.appendChild(note);
    return note;
}
