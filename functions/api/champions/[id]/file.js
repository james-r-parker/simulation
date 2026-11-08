import { handleFile } from '../../../_lib/library-api.js';

/**
 * @param {any} context the Pages Functions context
 * @returns {Promise<Response>} the champion file
 */
export const onRequestGet = (context) => handleFile(context);
