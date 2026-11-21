import { describe, expect, it } from 'vitest';
import { mountReelTab } from '../../../js/app/ui/insights-reel.js';
import { byClass, fakeDocument } from '../helpers/fake-dom.js';

/** @param {Record<string, any>} [more] fields over a tile with a clip @returns {any} a tile */
const tile = (more = {}) => ({
    id: 'chase',
    name: 'A real chase',
    status: 'tick 90, 3 in 10 s',
    url: 'blob:one',
    live: { kind: 'reel', name: 'A real chase', genomeId: 7, x: 1, y: 2 },
    ...more,
});

/** @param {{onPick?: (t: any) => void}} [hooks] the hooks @returns {any} a tab over fakes */
function setup(hooks = {}) {
    const doc = fakeDocument();
    const panel = doc.createElement('div');
    const part = mountReelTab(doc, panel, hooks);
    return { panel, part };
}

describe('the Reel tab', () => {
    it('shows a tile per scene: its name, its status and its clip', () => {
        const { panel, part } = setup();
        part.update([tile(), tile({ id: 'abort', name: 'Abort', status: 'not seen yet', url: null, live: null })]);
        const [first, second] = byClass(panel, 'insights-reel-tile');
        expect(byClass(first, 'insights-heading')[0].textContent).toBe('A real chase');
        expect(byClass(first, 'insights-note')[0].textContent).toBe('tick 90, 3 in 10 s');
        const [video] = byClass(first, 'insights-reel-video');
        expect(video).toMatchObject({ src: 'blob:one', hidden: false, controls: true, loop: true, muted: true });
        expect(byClass(second, 'insights-reel-video')[0]).toMatchObject({ hidden: true, src: '' });
        expect(byClass(second, 'insights-note')[0].textContent).toBe('not seen yet');
    });

    it('turns the jump button off for a scene with no live instance, and on again when one comes', () => {
        const { panel, part } = setup();
        part.update([tile({ live: null })]);
        const [button] = byClass(panel, 'insights-reel-live');
        expect(button.disabled).toBe(true);
        part.update([tile()]);
        expect(button.disabled).toBe(false);
    });

    it('hands the live target to onPick when the button is pressed, and does nothing when there is none', () => {
        const picked = /** @type {any[]} */ ([]);
        const { panel, part } = setup({ onPick: (t) => picked.push(t) });
        part.update([tile({ live: null })]);
        const [button] = byClass(panel, 'insights-reel-live');
        button.dispatch('click');
        expect(picked).toEqual([]);
        part.update([tile()]);
        button.dispatch('click');
        expect(picked).toEqual([{ kind: 'reel', name: 'A real chase', genomeId: 7, x: 1, y: 2 }]);
    });

    it('does not fail on a press when nothing listens', () => {
        const { panel, part } = setup();
        part.update([tile()]);
        expect(() => byClass(panel, 'insights-reel-live')[0].dispatch('click')).not.toThrow();
    });

    it('sets the video source only when the clip changes, and hides the tiles that are gone', () => {
        const { panel, part } = setup();
        part.update([tile(), tile({ id: 'abort' })]);
        const [video] = byClass(panel, 'insights-reel-video');
        const sets = /** @type {string[]} */ ([]);
        let src = video.src;
        Object.defineProperty(video, 'src', {
            get: () => src,
            set: (v) => {
                sets.push(v);
                src = v;
            },
        });
        part.update([tile()]);
        expect(sets).toEqual([]);
        part.update([tile({ url: 'blob:two' })]);
        expect(sets).toEqual(['blob:two']);
        expect(byClass(panel, 'insights-reel-tile')[1].hidden).toBe(true);
    });
});
