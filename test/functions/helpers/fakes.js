// Fakes of the Workers bindings: D1 over node:sqlite, R2 over a Map, and the Cache API over a Map.
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

/**
 * @returns {{db: any, sqlite: DatabaseSync, reads: {count: number}}} a D1 binding over an in-memory database that has
 *   the library migration applied; `reads.count` counts statements run
 */
export function fakeD1() {
    const sqlite = new DatabaseSync(':memory:');
    sqlite.exec(readFileSync('migrations/0001_library.sql', 'utf8'));
    const reads = { count: 0 };
    const db = {
        prepare(/** @type {string} */ sql) {
            let params = /** @type {any[]} */ ([]);
            const statement = {
                bind(/** @type {any[]} */ ...values) {
                    params = values;
                    return statement;
                },
                async all() {
                    reads.count++;
                    return { results: sqlite.prepare(sql).all(...params) };
                },
                async first() {
                    reads.count++;
                    return sqlite.prepare(sql).get(...params) ?? null;
                },
            };
            return statement;
        },
    };
    return { db, sqlite, reads };
}

/**
 * @param {Record<string, string>} [files] initial objects by key
 * @returns {{get(key: string): Promise<any>, put(key: string, body: string): Promise<void>, keys(): string[]}} an R2 bucket
 */
export function fakeR2(files = {}) {
    const store = new Map(Object.entries(files));
    return {
        async get(key) {
            const body = store.get(key);
            return body === undefined ? null : { body, text: async () => body };
        },
        async put(key, body) {
            store.set(key, body);
        },
        keys: () => [...store.keys()],
    };
}

/** @returns {{match(request: Request): Promise<Response | undefined>, put(request: Request, response: Response): Promise<void>}} a Cache API cache */
export function fakeCache() {
    const store = new Map();
    return {
        async match(request) {
            const hit = store.get(request.url);
            return hit === undefined ? undefined : hit.clone();
        },
        async put(request, response) {
            store.set(request.url, response);
        },
    };
}
