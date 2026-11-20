// The interface's part of TV mode: the HUD hidden and the cursor gone while it is on, and the caption of the shot on
// screen. The viewer's own HUD choice (`ctx.hidden`) is never touched, so leaving TV mode brings the HUD back as it was.

import { eraCardFor, ERA_SHOW_MS } from './director/era-card.js';
import { mountCaption, mountEraCard } from './ui/caption.js';
import { familyName } from './renderer/colors.js';

/**
 * @param {Record<string, any>} ctx the interface's shared parts: `deps` and `hidden`
 * @returns {{caption: ReturnType<typeof mountCaption>, era: ReturnType<typeof mountEraCard>,
 *   setTv: (on: boolean) => void, hudHidden: () => boolean,
 *   showEra: (world: {tick: number, ticksPerSecond: number}) => void}} the caption, the era card, the TV switch,
 *   whether the HUD should be hidden now and `showEra`, which reads the card from the chart history and shows it
 */
export function mountTv(ctx) {
    const { doc } = ctx.deps;
    const caption = mountCaption(doc, doc.body);
    const era = mountEraCard(doc, doc.body);
    ctx.tv = false;
    const hudHidden = () => ctx.hidden || ctx.tv;
    return {
        caption,
        era,
        hudHidden,
        showEra(world) {
            const data = ctx.chartData.data();
            const ready = ctx.deps.getReady();
            const top = ctx.deps.getClient()?.stats?.lineages?.top ?? [];
            const lines =
                data === null || ready === null
                    ? null
                    : eraCardFor(data.history, {
                          ...world,
                          nameOf: (id) => familyName(ready.seed, id, top),
                      });
            if (lines !== null) {
                era.show(lines);
                ctx.deps.setTimer(ERA_SHOW_MS, () => era.hide());
            }
        },
        setTv(on) {
            ctx.tv = on;
            ctx.deps.state.tv = on;
            ctx.deps.elements.hud.classList.toggle('hud-hidden', hudHidden());
            doc.documentElement.classList.toggle('tv-mode', on);
            if (!on) {
                caption.set('');
                era.hide();
            }
        },
    };
}
