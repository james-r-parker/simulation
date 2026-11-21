import { describe, expect, it } from 'vitest';
import { createFamilySlots } from '../../js/app/family-slots.js';
import { createStory, noteStory } from '../../js/app/follow-handoff.js';
import { refreshPlate } from '../../js/app/interface-plate.js';
import { createInterpolated } from '../../js/app/interpolate.js';
import { selectedWorld } from './helpers/inspect-world.js';

/**
 * @param {Record<string, any>} [over] overrides for the shared parts
 * @returns {{ctx: any, views: any[]}} shared parts whose plate records each view it is given
 */
function setup(over = {}) {
    const { ready, snapshot, genomeId } = selectedWorld();
    const agents = createInterpolated(2);
    agents.count = 1;
    agents.genomeId[0] = genomeId;
    agents.lineageId[0] = 4;
    agents.energy[0] = 0.9;
    agents.temperature[0] = (ready.info.temperatureOptimalMin + ready.info.temperatureOptimalMax) / 2;
    const story = createStory();
    noteStory(
        story,
        { kind: 1, x: 0, y: 0, a: 500, b: 4, c: genomeId, d: 1 },
        { kinds: { BORN: 1 }, eatenCause: 1, causeNames: [] },
    );
    agents.genomeId[1] = 500;
    agents.count = 2;
    const player = { story, flee: { fleeing: new Uint8Array(2) } };
    const views = /** @type {any[]} */ ([]);
    const ctx = {
        prefs: { followPlate: true },
        plate: { update: (/** @type {any} */ view) => views.push(view) },
        deps: {
            state: { followId: genomeId, selectedId: 0 },
            getReady: () => ready,
            getClient: () => ({ latest: snapshot }),
            getFollowView: () => ({ agents, player }),
            slots: createFamilySlots(),
        },
        ...over,
    };
    return { ctx, views };
}

describe('refreshPlate', () => {
    it('shows the followed body with its living children, and no age or kills while it is not inspected', () => {
        const { ctx, views } = setup();
        refreshPlate(ctx, 10);
        expect(views[0]).toMatchObject({ id: ctx.deps.state.followId, children: 1, age: '', kills: '', condition: '' });
    });

    it('adds the age and kills when the worker is inspecting that body, and the hunted condition', () => {
        const { ctx, views } = setup();
        ctx.deps.state.selectedId = ctx.deps.state.followId;
        ctx.deps.getFollowView().player.flee.fleeing[0] = 1;
        refreshPlate(ctx, 10);
        expect(views[0].age).toMatch(/ seasons$/);
        expect(views[0].kills).toMatch(/^\d+$/);
        expect(views[0].condition).toBe('hunted');
    });

    it('shows no children without an effects player', () => {
        const { ctx, views } = setup();
        const { agents } = ctx.deps.getFollowView();
        ctx.deps.getFollowView = () => ({ agents, player: null });
        refreshPlate(ctx, 10);
        expect(views[0].children).toBe(0);
    });

    it('hides with the preference off, no follow, no world, no view or the body off screen', () => {
        const off = setup();
        off.ctx.prefs.followPlate = false;
        refreshPlate(off.ctx, 10);
        const none = setup();
        none.ctx.deps.state.followId = 0;
        refreshPlate(none.ctx, 10);
        const noWorld = setup();
        noWorld.ctx.deps.getReady = () => null;
        refreshPlate(noWorld.ctx, 10);
        const noView = setup();
        noView.ctx.deps.getFollowView = undefined;
        refreshPlate(noView.ctx, 10);
        const gone = setup();
        gone.ctx.deps.state.followId = 99999;
        refreshPlate(gone.ctx, 10);
        for (const s of [off, none, noWorld, noView, gone]) {
            expect(s.views).toEqual([null]);
        }
    });
});
