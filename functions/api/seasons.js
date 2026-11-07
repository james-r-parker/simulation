import { handleSeasons } from '../_lib/library-api.js';

/**
 * @param {any} context the Pages Functions context
 * @returns {Promise<Response>} all seasons
 */
export const onRequestGet = (context) => handleSeasons(context);
