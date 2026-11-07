import { serveVersion } from '../_lib/release-serve.js';

/**
 * @param {any} context the Pages Functions context
 * @returns {Promise<Response>} the file from the release's Pages deployment
 */
export const onRequestGet = (context) => serveVersion(context);
