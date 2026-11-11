# Mobile view

**Status:** In progress - Phase 1 built: two-finger pinch and pan, `pointercancel`, a fingertip-sized tap, the portrait home zoom that survives a turn, the pixel-ratio cap on every path, and a phone layout for the HUD; Phase 2 chunk C2 built: double-tap zoom, two-finger-tap Home, long-press peek, the overflow menu, the coarse-pointer quality start and portrait director shots; the phone frame-budget row (T11, chunk C3, quiet machine) is next.
**Validated:** d6ca3e6c (2026-11-07)
**Priority:** 16 - the app's audience is the TV and the desktop; a phone is a second screen, so this queues after the v6 and deployment docs
**Depends on:** [worker-and-renderer.md](worker-and-renderer.md)

The app on `index.html` runs on a phone or a tablet as well as on the desktop. A person can pinch to zoom, drag to
pan, tap a blob to select it, and turn the phone either way without losing the view. The HUD fits a 360 CSS px wide
screen and keeps clear of a notch and a home bar.

## Input

`createPointerInput` in [pointer-input.js](../../js/app/pointer-input.js) tracks every pointer by its `pointerId`.

| Pointers down | A move does                                                                                                                                                            |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1             | Pans once the pointer has gone `DRAG_THRESHOLD_PX` (4 device px) from where it went down                                                                               |
| 2 or more     | `pinchAt` in [camera.js](../../js/app/camera.js) over the first two: zooms by the ratio of their distances and keeps the world point under their midpoint between them |

- A release with no pointers left and no drag picks the agent under it.
- A gesture that ever had two pointers is a drag: lifting the fingers never picks.
- When one of two fingers lifts, the other carries on panning.
- `cancel(id)` drops a pointer that is down and marks the gesture a drag, so a cancelled press never picks; a cancel
  for a pointer already released does nothing.
- A press from a pointer id that is the only one down starts a fresh gesture, so a lost release never blocks a tap.
- `pinchAt` works on the target pose (`targetX`, `targetY`, `targetZoom`), the same as `zoomAt`, and releases a
  follow.
- The wheel zooms about the cursor as before.

`listenPointers` in [pointer-events.js](../../js/app/pointer-events.js) turns DOM events into these calls:
`pointerdown` and `lostpointercapture` on the canvas (which captures the pointer), `pointermove`, `pointerup` and
`pointercancel` on the window. The top bar takes touches on a narrow screen so it can scroll, so a touch on it never
reaches the canvas.
A `pointerType` of `touch` marks the gesture a touch.

Touch gestures (`createPointerInput` with the timing rules in [touch-gestures.js](../../js/app/touch-gestures.js)):

| Gesture                                                                                          | Does                                                                                                        |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Two touch taps within `DOUBLE_TAP_MS` (300) and `DOUBLE_TAP_PX` (40 device px)                   | The second zooms 2x about the tap through `zoomAt` and does not pick; a mouse double click only picks twice |
| Two fingers down and up within `TWO_FINGER_TAP_MS` (300), neither moving past `TAP_SLOP_PX` (12) | `Home`, as the `home` action does; nothing picks                                                            |
| One finger held still `LONG_PRESS_MS` (500) over an agent                                        | `onLongPress` shows the hover peek at once; the release picks nothing. Over empty space nothing happens     |

A touch never rests the hover peek on its own (a finger held on the canvas would flash it): `listenPointers` leaves
`iface.pointer` to the mouse and calls `iface.peekHide` on a touch press. The clock and timers are injected, so the
tests step time by hand.

A touch picks with each specialisation's drawn minimum raised to `MIN_CSS_PX_TOUCH` (44 CSS px, in
[display-size.js](../../js/app/display-size.js)) times the canvas's device pixels per CSS pixel. A mouse click picks
at the drawn minimum. The drawn size does not change.

## Viewport

`homeZoom(canvas, world)` in [camera.js](../../js/app/camera.js) is the zoom the view starts at and `Home` returns to.

| Canvas            | `homeZoom`                                                                                    |
| ----------------- | --------------------------------------------------------------------------------------------- |
| Landscape, square | `fitZoom`: the whole world                                                                    |
| Portrait          | `max(fitZoom, canvas.height / world.height)`: fills the height; a sideways pan shows the rest |

- `minZoom` stays `fitZoom x ZOOM_OUT`, so a pinch out shows the whole world in portrait too.
- `maxZoom` is `homeZoom x ZOOM_IN`, so a phone held upright zooms in as far from home as a desktop does from its fit.
- `resizeCamera` keeps the zoom's ratio to `homeZoom` and leaves the centre where it was. A view at home stays at home
  when the phone turns; a view zoomed in 3x on home stays 3x on the new home.
- `moveCameraTo` with zoom 0 goes to `homeZoom`.

`canvasPixelSize` in [canvas-size.js](../../js/app/renderer/canvas-size.js) caps the drawing buffer at
`MAX_PIXEL_RATIO` (2) device pixels per CSS pixel on every path. A `devicePixelContentBoxSize` whose ratio to the
client width is above 2 gives the client size times 2.

`public/manifest.webmanifest` sets `"orientation": "any"`.

## HUD

[app.css](../../css/app.css) and the viewport meta in `index.html` (`viewport-fit=cover`):

| Where                                          | Rule                                                                                                                                                                    |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Everywhere                                     | The top bar, ticker, toasts and drawers keep clear of `env(safe-area-inset-*)`                                                                                          |
| `max-width: 760px`                             | The top bar scrolls sideways (`overflow-x: auto`, `touch-action: pan-x`); the ticker is at most the width less 1.75rem; the title card spans the width less 1rem a side |
| `orientation: portrait` and `max-width: 760px` | A drawer is a bottom sheet: full width, `55dvh` tall, rounded top corners, sliding up from the bottom                                                                   |
| `pointer: coarse`                              | Every `.control` is at least 2.75rem (44 CSS px) square; `--bar-height` is 3.25rem                                                                                      |

## Overflow menu

`mountOverflowMenu` in [overflow-menu.js](../../js/app/ui/overflow-menu.js) puts a `More actions` button at the end of
the top bar. It opens a panel, fixed under the bar (the bar scrolls sideways on a phone and would clip a child), of
every action the bar has no button for: step ten, the four lenses, screenshot, clip (only where `MediaRecorder`
exists), the archive export, the debug bundle, audio, wake lock, fullscreen and the HUD. Each item is a `.control` with
its shortcut in the title. A press outside, `Escape` or choosing an item closes it. The directly keyed actions that need
no menu on touch (pan, zoom, `Home`, escape, volume, the seed field) are left out: gestures and the bar cover them.

## Phases

### Phase 1 - Touch, viewport and phone layout (built)

Pinch and two-finger pan, `pointercancel`, the touch tap floor, `homeZoom` and the turn, the pixel-ratio cap, and the
HUD rules above.

| Chunk | Tasks                  | Built by |
| ----- | ---------------------- | -------- |
| C1    | T1, T2, T3, T4, T5, T6 | Sonnet   |

### Phase 2 - Gestures, phone budget and portrait shots

**Targets:** browser.frame_p95_ms, browser.draw_cpu_p95_ms

- A double-tap zooms in 2x about the tap; a two-finger tap goes `Home`.
- A long-press over an agent shows the hover peek (`ui/hover-peek.js`) for a touch.
- An overflow menu button in the top bar holds every `KEYMAP` action that has no button (the lenses, step ten,
  screenshot, clip, the exports, audio, wake lock, fullscreen, HUD).
- On a coarse pointer the quality rule (`stepQuality` in `renderer/quality.js`) starts one level down: `createQuality`
  takes `coarse` (from `matchMedia('(pointer: coarse)')` in `detectHardware`), which starts level 1 unless a pin, a
  software renderer or missing float targets say otherwise.
- `npm run perf:browser -- --viewport 412x915` records a phone row in `bench/browser-baseline.json`; the phase holds
  `browser.frame_p95_ms` and `browser.draw_cpu_p95_ms` at or under it on a mid-range Android phone over `--cdp`.
- The director's wide shots (`director/shots.js`) frame by `homeZoom` in portrait, so a shot never shows the world as
  a band: `wideFraming` and the close shots floor at `homeZoom`, which is `fitZoom` on a landscape canvas, so desktop
  shots do not change.

| Chunk | Tasks                       | Built by       |
| ----- | --------------------------- | -------------- |
| C2    | T7, T8, T9, T10, T12, T13   | Sonnet (built) |
| C3    | T11 (quiet machine, own PR) | Haiku          |

## Decisions

| Decision                                                                                                             | Reason                                                                                                                 | Who                    |
| -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Phase 1 ships the straightforward fixes in one PR; gestures, menus, the budget and director framing wait for Phase 2 | The user asked for the MVP in a single PR, leaving the complex parts for another session                               | User (2026-11-03)      |
| The overflow menu lists an explicit set of actions, not "every action without a button"                              | Pan, zoom, `Home`, escape, volume and the seed field have gesture or bar equivalents; a menu of 30 items is not usable | Delegated (2026-11-07) |
| The coarse-pointer quality start sits in `createQuality`, read from `matchMedia` in `detectHardware`                 | One place already decides the start level for software and float targets                                               | Delegated (2026-11-07) |
| T11 (the phone row) is not in this chunk                                                                             | It needs a quiet machine and a phone over `--cdp`; the plan already gives it its own PR                                | Delegated (2026-11-07) |
| Portrait fills the height instead of showing the whole world                                                         | At `fitZoom` a 16:9 world on a 412 x 915 phone is a band a quarter of the screen tall                                  | Manager                |

## Delivery requirements

| Concern                 | Delivered                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Architecture            | UI only, in `js/app/`: `createPointerInput` gains pointer ids, `cancel` and `getTouchMinPx`; `listenPointers` (new, `pointer-events.js`) holds the DOM wiring out of `main.js`; `homeZoom` and `pinchAt` in `camera.js`; `MIN_CSS_PX_TOUCH` in `display-size.js`; `canvasPixelSize` caps every path. No change to `js/sim/`, `js/evo/` or `js/worker/`                                                                                                                                                                                                                                                                   |
| Unit tests              | `test/app/pointer-input.test.js` (spread zooms in, pinch zooms out, the midpoint world point stays put, one finger carries on, cancel never picks, a tap uses the touch floor, a larger minimum wins); `test/app/pointer-events.test.js` (ids, touch, capture, cancel); `test/app/camera-touch.test.js` (`homeZoom` per orientation, start at home, zoom out to the whole world, the turn both ways, ratio kept, `Home`, `pinchAt`); `test/app/renderer/canvas-size.test.js` (ratio-3 box capped); `test/app/display-size.test.js`; `test/app/hud-css.test.js` (safe areas, bottom sheet, scrolling bar, coarse buttons) |
| Headless e2e            | N/A - no sim change; the golden hashes in `test/sim/world-hash.test.js` pass unchanged                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Performance budget      | Phase 1: no desktop `browser.*` change (the 3840x2160 and 2560x1440 canvases are at ratio 1 or 2, under the cap; pointer moves allocate nothing). Phase 2 records the phone row                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Evolution metrics       | N/A - the view changes, the world does not                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Determinism             | N/A - the app draws no randomness for input or layout                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Config and persistence  | No config keys, no saved formats; `public/manifest.webmanifest` has `"orientation": "any"`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Logging and diagnostics | N/A - no new failure path: input and layout show on screen, and the sim's logs are unchanged                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Browser compatibility   | Pointer Events and `setPointerCapture` (Chrome, Safari 13+, Firefox); `env(safe-area-inset-*)` falls back to 0; `dvh` (Chrome 108+, Safari 15.4+). Checked in Playwright Chromium emulating a Pixel 7, upright and sideways, with a CDP pinch                                                                                                                                                                                                                                                                                                                                                                            |
| Docs                    | This doc; `Implemented` once Phase 2 is built                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Verification            | `scripts/check.sh` green; the manual walk below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

## Task breakdown

### Phase 1 - Touch, viewport and phone layout

| #   | Task                                                                                                                      | Nature       | Depends on         |
| --- | ------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------ |
| T1  | Cap `canvasPixelSize` at `MAX_PIXEL_RATIO` on the `devicePixelContentBoxSize` path                                        | [mechanical] | -                  |
| T2  | Multi-pointer `createPointerInput` with `pinchAt`, `cancel`, and `listenPointers` wiring ids, capture and `pointercancel` | [judgement]  | -                  |
| T3  | Touch tap floor `MIN_CSS_PX_TOUCH` through `getTouchMinPx`                                                                | [mechanical] | T2                 |
| T4  | `homeZoom` for start, `Home` and `resizeCamera`                                                                           | [judgement]  | -                  |
| T5  | Phone CSS: safe areas, scrolling top bar, bottom-sheet drawers, coarse buttons, title card; viewport and manifest         | [judgement]  | -                  |
| T6  | Conformance review of Phase 1 against this doc, in parallel with `scripts/check.sh`                                       | [judgement]  | T1, T2, T3, T4, T5 |

### Phase 2 - Gestures, phone budget and portrait shots

| #   | Task                                                                                                                                 | Nature       | Depends on                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------ | ------------------------- |
| T7  | Double-tap zoom and two-finger-tap `Home` in `createPointerInput`                                                                    | [judgement]  | T6                        |
| T8  | Long-press shows the hover peek for a touch                                                                                          | [judgement]  | T6                        |
| T9  | Overflow menu for the `KEYMAP` actions with no button                                                                                | [judgement]  | T6                        |
| T10 | (built, #326) Coarse-pointer quality start one level down                                                                            | [mechanical] | T6                        |
| T11 | (open: chunk C3, needs a quiet machine and a phone over `--cdp`) Record the 412x915 phone row with `perf:browser` on a quiet machine | [mechanical] | T10                       |
| T12 | (built, #326) Portrait director wide shots by `homeZoom`                                                                             | [judgement]  | T6                        |
| T13 | (open: after T11) Conformance review of Phase 2 against this doc, in parallel with `scripts/check.sh`                                | [judgement]  | T7, T8, T9, T10, T11, T12 |

## Verification

1. `scripts/check.sh` is green.
2. `npm run dev`, then open the page on a phone (or Chrome device emulation for a Pixel 7):
    - Upright, the world fills the screen's height; a drag pans sideways; a pinch out shows the whole world.
    - Two fingers spread zoom in about the point between them; lifting them selects nothing.
    - A tap on a blob selects it and opens the inspector as a bottom sheet.
    - Turned sideways at home, the whole world shows; turned back, the view returns to the height fill with the same
      centre.
    - The top bar scrolls sideways; every button is a fingertip wide; nothing sits under the notch or the home bar.
3. On the desktop, the wheel, a drag and a click behave as before.
