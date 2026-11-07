import { serveSeason } from '../_lib/release-serve.js';

/**
 * @param {any} context the Pages Functions context
 * @returns {Promise<Response>} the season's page or a redirect
 */
export const onRequestGet = (context) => serveSeason(context);
