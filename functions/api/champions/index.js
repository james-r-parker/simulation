import { handleList } from '../../_lib/library-api.js';

/**
 * @param {any} context the Pages Functions context
 * @returns {Promise<Response>} a page of champions
 */
export const onRequestGet = (context) => handleList(context);
