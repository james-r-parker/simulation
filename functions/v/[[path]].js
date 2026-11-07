import { serveVersion } from '../_lib/release-serve.js';

/**
 * @param {any} context the Pages Functions context
 * @returns {Promise<Response>} the file from R2
 */
export const onRequestGet = (context) => serveVersion(context);
