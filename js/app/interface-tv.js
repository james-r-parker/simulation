// The interface's part of TV mode: the HUD hidden and the cursor gone while it is on, and the caption of the shot on
// screen. The viewer's own HUD choice (`ctx.hidden`) is never touched, so leaving TV mode brings the HUD back as it was.

import { mountCaption } from './ui/caption.js';

/**
 * @param {Record<string, any>} ctx the interface's shared parts: `deps` and `hidden`
 * @returns {{caption: ReturnType<typeof mountCaption>, setTv: (on: boolean) => void, hudHidden: () => boolean}} the
 *   caption, the TV switch and whether the HUD should be hidden now
 */
export function mountTv(ctx) {
    const { doc } = ctx.deps;
    const caption = mountCaption(doc, doc.body);
    ctx.tv = false;
    const hudHidden = () => ctx.hidden || ctx.tv;
    return {
        caption,
        hudHidden,
        setTv(on) {
            ctx.tv = on;
            ctx.deps.state.tv = on;
            ctx.deps.elements.hud.classList.toggle('hud-hidden', hudHidden());
            doc.documentElement.classList.toggle('tv-mode', on);
            if (!on) {
                caption.set('');
            }
        },
    };
}
