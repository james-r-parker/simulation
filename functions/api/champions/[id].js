import { handleOne } from '../../_lib/library-api.js';

/**
 * @param {any} context the Pages Functions context
 * @returns {Promise<Response>} one champion
 */
export const onRequestGet = (context) => handleOne(context);
