// The first visit: the title card over the world, which starts at x2 unless `?speed=` pinned it, and the card's
// dismissal. Works on the interface's shared parts.

import { titleCardView } from './ui/title-card.js';

/** The speed a first visit starts at, ticks a second: x2. */
export const FIRST_VISIT_TICKS_PER_SECOND = 120;

/**
 * Hides the title card and remembers that it has been seen.
 * @param {Record<string, any>} ctx the shared parts
 * @returns {void}
 */
export function dismissCard(ctx) {
    if (ctx.card.hide()) {
        ctx.prefs.seen = true;
        ctx.persist();
    }
}

/**
 * The first visit: the title card over the world, which starts at x2 unless `?speed=` pinned it.
 * @param {Record<string, any>} ctx the shared parts
 * @param {Record<string, any>} ready the first `ready` message
 * @returns {void}
 */
export function firstVisit(ctx, ready) {
    const { deps } = ctx;
    ctx.help.setLegend(titleCardView(ready.info.specs));
    if (ctx.prefs.seen || ctx.shownCard) {
        return;
    }
    ctx.shownCard = true;
    ctx.card.show(titleCardView(ready.info.specs), deps.now());
    if (!deps.speedPinned) {
        deps.state.requestedTicksPerSecond = FIRST_VISIT_TICKS_PER_SECOND;
        deps.getClient()?.setSpeed(FIRST_VISIT_TICKS_PER_SECOND);
    }
}
