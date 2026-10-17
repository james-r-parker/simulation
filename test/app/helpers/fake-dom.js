// A small stand-in for `document` that records what the UI modules do to it: elements with children, attributes, a
// class list, a style bag and event listeners. Enough for the mount functions, which take the document as an argument.

/**
 * @param {string} tagName the tag
 * @param {any} [context] what a canvas's `getContext` returns
 * @returns {any} an element
 */
function createElement(tagName, context = null) {
    /** @type {Record<string, Function[]>} */
    const listeners = {};
    /** @type {Set<string>} */
    const classes = new Set();
    /** @type {Record<string, any>} */
    const element = {
        tagName: tagName.toUpperCase(),
        children: [],
        attributes: {},
        style: {
            setProperty(/** @type {string} */ k, /** @type {string} */ v) {
                element.style[k] = v;
            },
        },
        textContent: '',
        value: '',
        hidden: false,
        classList: {
            add: (/** @type {string} */ c) => void classes.add(c),
            remove: (/** @type {string} */ c) => void classes.delete(c),
            toggle(/** @type {string} */ c, /** @type {boolean | undefined} */ force) {
                const on = force ?? !classes.has(c);
                if (on) {
                    classes.add(c);
                } else {
                    classes.delete(c);
                }
                return on;
            },
            contains: (/** @type {string} */ c) => classes.has(c),
        },
        appendChild(/** @type {any} */ child) {
            child.parent = element;
            element.children.push(child);
            return child;
        },
        removeChild(/** @type {any} */ child) {
            element.children.splice(element.children.indexOf(child), 1);
            child.parent = null;
            return child;
        },
        remove() {
            element.parent?.removeChild(element);
        },
        replaceChildren() {
            element.children = [];
        },
        setAttribute(/** @type {string} */ k, /** @type {string} */ v) {
            element.attributes[k] = String(v);
        },
        getAttribute: (/** @type {string} */ k) => element.attributes[k] ?? null,
        addEventListener(/** @type {string} */ type, /** @type {Function} */ fn) {
            (listeners[type] ??= []).push(fn);
        },
        dispatch(/** @type {string} */ type, /** @type {Record<string, any>} */ event = {}) {
            for (const fn of listeners[type] ?? []) {
                fn({ target: element, preventDefault() {}, ...event });
            }
        },
        focus() {
            element.focused = true;
        },
        select() {},
        getContext: () => context,
    };
    return element;
}

/**
 * @param {any} [context] what a canvas's `getContext` returns, null by default
 * @returns {any} a fake document
 */
export function fakeDocument(context = null) {
    return {
        createElement: (/** @type {string} */ tag) => createElement(tag, context),
        createElementNS: (/** @type {string} */ _ns, /** @type {string} */ tag) => createElement(tag),
    };
}

/**
 * @param {any} element the root
 * @param {(e: any) => boolean} test what to find
 * @returns {any[]} every descendant (and the root) that passes
 */
export function findAll(element, test) {
    const found = test(element) ? [element] : [];
    for (const child of element.children) {
        found.push(...findAll(child, test));
    }
    return found;
}

/**
 * @param {any} element the root
 * @param {string} className a class
 * @returns {any[]} the elements whose `className` is or contains it
 */
export function byClass(element, className) {
    return findAll(element, (e) =>
        String(e.className ?? '')
            .split(' ')
            .includes(className),
    );
}
