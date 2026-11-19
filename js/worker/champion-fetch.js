// Gets the champion files `?policy=champions-v1` seeds from, in the worker: `public/champions/v1/index.json` lists them
// (`npm run train:export` writes it), each is fetched, and `createChampionGate` holds every message behind the load so
// the host (which builds the policy synchronously) finds the files ready. No DOM; `fetch` is injected.

/** The directory `npm run train:export -- --out public/champions/v1/` publishes to, as a site path. */
export const CHAMPIONS_V1_PATH = '/champions/v1/';
/** The registered policy that seeds from champions. */
export const CHAMPIONS_POLICY = 'champions-v1';

/**
 * @param {(url: string) => Promise<{ok: boolean, status: number, json: () => Promise<any>}>} fetchJson fetches a URL
 * @param {string} base the directory URL, ending in `/`
 * @returns {Promise<Record<string, any>[]>} the parsed champion files the directory's `index.json` lists
 * @throws {Error} naming the URL when a fetch fails or the index lists no champion
 */
export async function fetchChampionFiles(fetchJson, base) {
    const get = async (/** @type {string} */ name) => {
        const response = await fetchJson(`${base}${name}`);
        if (!response.ok) {
            throw new Error(
                `champions-v1: ${base}${name} answered ${response.status}; publish the champions with npm run train:export -- --out public/champions/v1/`,
            );
        }
        return response.json();
    };
    const index = await get('index.json');
    if (!Array.isArray(index.champions) || index.champions.length === 0) {
        throw new Error(`champions-v1: ${base}index.json lists no champions`);
    }
    return Promise.all(index.champions.map((/** @type {{file: string}} */ entry) => get(entry.file)));
}

/**
 * @typedef {object} ChampionGate
 * @property {(message: any) => void} receive passes a message to the host; an `init` or `reset` for `champions-v1` waits
 *   for the files first, and every later message waits behind it, so the order the page sent is kept
 * @property {() => Record<string, any>[]} files the loaded files
 * @throws {Error} (from `files`) the load's error when it failed, or a note that nothing was loaded
 */

/**
 * @param {{receive: (message: any) => void, load: () => Promise<Record<string, any>[]>}} parts the host's `receive` and
 *   the loader (`fetchChampionFiles` with its arguments bound)
 * @returns {ChampionGate} the gate
 */
export function createChampionGate({ receive, load }) {
    /** @type {Record<string, any>[] | null} */
    let loaded = null;
    /** @type {Error | null} */
    let failure = null;
    /** @type {Promise<void> | null} */
    let chain = null;
    let waiting = 0;

    const enqueue = (/** @type {() => Promise<void> | void} */ job) => {
        waiting += 1;
        chain = (chain ?? Promise.resolve()).then(job).finally(() => {
            waiting -= 1;
            if (waiting === 0) {
                chain = null;
            }
        });
    };
    const loadOnce = async () => {
        try {
            loaded = await load();
            failure = null;
        } catch (error) {
            failure = error instanceof Error ? error : new Error(String(error));
        }
    };

    return {
        receive(message) {
            const needsFiles =
                (message.type === 'init' || message.type === 'reset') &&
                message.policy === CHAMPIONS_POLICY &&
                loaded === null;
            if (!needsFiles && chain === null) {
                receive(message);
                return;
            }
            enqueue(async () => {
                if (needsFiles && loaded === null) {
                    await loadOnce();
                }
                receive(message);
            });
        },
        files() {
            if (loaded === null) {
                throw failure ?? new Error('champions-v1: the champion files were not loaded');
            }
            return loaded;
        },
    };
}
