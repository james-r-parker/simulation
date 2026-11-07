import { serveNext } from '../_lib/release-serve.js';

/**
 * @param {any} context the Pages Functions context
 * @returns {Promise<Response>} the `next` alias's response
 */
export const onRequestGet = (context) => serveNext(context);
