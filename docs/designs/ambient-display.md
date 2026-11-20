# Ambient display

**Status:** Proposed - the app as a screen left on all day: the director on air, a death that reads as a cell failing, follow as a story, a look that holds from across a room, every reading one key away, and a reel of each scene for review; Phase 1 (the director on air) is first.
**Validated:** 58f38443 (2026-11-20)
**Priority:** 5 - App lead. The app is the product and is watched on a side screen all day; an idle screen shows a static camera today, and the scene reel (Phase 6) is how a behaviour change is reviewed; app-only work on its own lane
**Depends on:** [crisp-renderer.md](crisp-renderer.md), [continuous-follow.md](continuous-follow.md), [worker-and-renderer.md](worker-and-renderer.md), [pack-worker.md](pack-worker.md)

> Companion to [crisp-renderer.md](crisp-renderer.md), which owns the layers, the models, the clips and the frame budgets, and to [continuous-follow.md](continuous-follow.md), which owns follow as built. This doc owns the unattended experience: what the camera does with nobody at the keyboard, how a life ends on screen, what follow shows, the far-screen look, and the insights drawer.

The art direction is organisms in deep space: restrained, crisp, not cartoonish. The displays are a 32 inch 4K OLED at 240 Hz and a 27 inch 1440p panel. Nothing here changes `js/sim/`, `js/evo/` or `rulesHash`.

## Order

This doc is a lead: it holds a rank in the Build queue, and the docs below are built as its steps, in order, after its own next work. A step doc keeps its own phases, tasks and status line.

Own work first: Phases 1 to 6 in order.

| Step | Doc                                                        | Built when                                                                                                                               |
| ---- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | [worker-and-renderer.md](worker-and-renderer.md)           | Its director tasks (T30, T49 to T52) are built as this lead's Phase 1; the budget measurements and manual walks of Phases 2 and 3 follow |
| 2    | [mobile-view.md](mobile-view.md)                           | A phone is a second screen; after the TV and desktop experience is right                                                                 |
| 3    | [deployment-and-community.md](deployment-and-community.md) | The last stage: the release flow is built, the community phases open once the app is worth sharing                                       |

## Measured on 2026-11-20

| Reading                                          | Value                                                                                                                                                                                                            |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The director                                     | `createDirector` in `js/app/director/director.js` is imported by nothing outside `js/app/director/`; `?tv=1` only turns the wake lock on                                                                         |
| A death, first phase                             | `packBody` in `js/app/renderer/dying-pack.js` zeroes the state, motion, body and tween lanes; the body glides frozen at half speed for up to `PENDING_MAX_MS` (3 s)                                              |
| A death, the clip                                | six clips in `DEATH_ANIMS` (`js/app/renderer/death-anim.js`), each a scale squash and an opacity fade of an intact outline, 0.8 to 2.0 s                                                                         |
| Death particles                                  | spawned by `playDeath` (`js/app/renderer/effects-combat.js`) at the record's position, size `BIRTH_SIZE` 24 for every body; on the sim-tick clock (floor `FX_MIN_MS` 250 ms) while the body is on the wall clock |
| Follow on death                                  | `stepFollow` (`js/app/follow.js`) leaves after `FOLLOW_HOLD_MS` 650 ms, before any death clip ends                                                                                                               |
| Follow camera                                    | `followStep` (`js/app/camera.js`): a damped spring on the body centre; no look-ahead, no pair framing, zoom set once on entry                                                                                    |
| Follow subject                                   | `pickFollowAgent` (`js/app/follow-target.js`) scores pursuit, events, pregnancy and movement; no limit on time with one subject                                                                                  |
| Shown about the subject                          | a 32-sided ring from `pushMarker` (`js/app/renderer/overlays.js`)                                                                                                                                                |
| Static bright pixels at a fixed camera           | the border, the wall column, rocks and refuge rings, 1200 depth points                                                                                                                                           |
| Budgets ([crisp-renderer.md](crisp-renderer.md)) | frame p95 4.4 ms; draw CPU p95 2.5 ms (1.41 measured); GPU p95 3.0 ms (0.7 to 1.0 measured)                                                                                                                      |

## The director on air

TV mode is the unattended state. It starts with `?tv=1`, with the `T` key, and after 5 minutes without input (`createIdleTracker` in `js/app/idle.js`). Any input leaves it and restores the camera, the speed and the HUD.

- In TV mode the director (`createDirector`) owns the camera: wide, glide, linger and pullback shots chosen from the moment scores of `js/app/director/scoring.js`. [worker-and-renderer.md](worker-and-renderer.md) T30 (the wiring, the caption, the TV border), T52 (`director/pace.js`), T51 (the era card) and T50 (`npm run director:dry`) are built as this doc's first chunk and marked built there.
- A linger shot on one agent is a follow: the director calls the follow of this doc ("Follow as a story"), so the two never fight over the camera.
- The schedule has a floor and a ceiling: no shot under 6 s, no shot over 90 s, and a wide shot at least every 10 minutes.
- A quiet world is paced: `director/pace.js` raises the sim speed while no moment scores above its threshold and restores x1 when one does, so a kill is never watched at x4.
- Variety: the director keeps the last 20 shot kinds and subjects and scores a repeat down (`director.max_kind_share` in `director:dry`).

| `director:dry` reading     | Bar                                                   |
| -------------------------- | ----------------------------------------------------- |
| `director.chase_precision` | at least 0.6 of chase shots hold a pursuit to its end |
| `director.max_kind_share`  | at most 0.4                                           |
| `director.shots_per_hour`  | 60 to 240                                             |

Read on 2026-11-20 with `npm run director:dry -- --seed <n>` (72000 ticks, the live policy, the default world; the director after Phase 1 chunk A):

| Seed | `director.chase_precision` | `director.max_kind_share` | `director.shots_per_hour` |
| ---- | -------------------------- | ------------------------- | ------------------------- |
| 1    | 0.333 (1 of 3 chase shots) | 0.381                     | 63.0                      |
| 2    | n/a (no chase shot)        | 0.417 (miss)              | 36.0 (miss)               |
| 3    | 0.500 (2 of 4 chase shots) | 0.235                     | 102.0                     |
| 4    | 0.250 (1 of 4 chase shots) | 0.323                     | 93.0                      |

The Phase 1 bars are not all met. `director.chase_precision` misses on every seed, on 3 or 4 chase shots a run: the snapshot has no `hunting` bit yet (worker-and-renderer T48), so a chase is found from the geometry alone and few are found. Seed 2 holds `trample` at 0.417 of its shots and takes 36 shots an hour: that world offers one kind of moment most of the time, and the repeat penalty (the kind's share of the last 20 shots, forgotten after 15 simulated minutes) holds the count down. More kinds of moment, not a weaker penalty, is the fix; it is left to a following chunk.

Read on 2026-11-20 after T4b (the same command, world and seeds; the director with sustained chases and five scene moments):

| Seed | `director.chase_precision` | `director.max_kind_share` | `director.shots_per_hour` |
| ---- | -------------------------- | ------------------------- | ------------------------- |
| 1    | 1.000 (1 of 1 chase shot)  | 0.308                     | 117.0                     |
| 2    | n/a (no chase shot)        | 0.341                     | 132.0                     |
| 3    | n/a (no chase shot)        | 0.227                     | 132.0                     |
| 4    | 1.000 (1 of 1 chase shot)  | 0.261                     | 138.0                     |

`director.max_kind_share` and `director.shots_per_hour` now meet their bars on all four seeds: carcass, pack call, patch wilt, strain and die-off moments (`js/app/director/moments-scenes.js`, from the scenes "Scavenge", "Pack, or loner", "Leave a dying patch" and "Boom and bust" in [principles.md](../principles.md)) give seed 2 something to cut to besides `trample`. The chase rule now needs a pursuit about to end (within 2.5 hunter sizes, closing, aimed within 0.3 rad, moving now and 1.5 s ago, no slower than the prey). On the recorded worlds of seeds 1, 3 and 4 that selects pursuits 4 in 5 of which end in a bite, a death or an escape inside the shot (the rule it replaced: 1 in 2). The measurement in `director:dry` is unchanged. On 72000 ticks `director.chase_precision` has one chase shot on seeds 1 and 4 and none on seeds 2 and 3, too few to read, so the same seeds were read at four times the length.

Read on 2026-11-20 at `--ticks 288000` (four times the length, the same seeds, the same director; the four seeds run in parallel):

| Seed | `director.chase_precision` | Chase shots  | `director.max_kind_share` | `director.shots_per_hour` | Sustained pursuits seen |
| ---- | -------------------------- | ------------ | ------------------------- | ------------------------- | ----------------------- |
| 1    | 1.000                      | 9 (9 held)   | 0.245                     | 122.3                     | 911                     |
| 2    | 0.800                      | 10 (8 held)  | 0.228                     | 141.8                     | 298                     |
| 3    | 1.000                      | 17 (17 held) | 0.191                     | 141.0                     | 636                     |
| 4    | 1.000                      | 3 (3 held)   | 0.266                     | 129.8                     | 57                      |
| All  | 0.949 pooled               | 39 (37 held) | 0.266 (largest)           | 122.3 to 141.8            | 1902                    |

Both the per-seed bars `director.max_kind_share` and `director.shots_per_hour` are met on every seed, and `director.chase_precision` pooled over the four seeds is 0.949 of 39 chase shots (the rule: at least 0.6 with at least 10 chase shots in total). T4b is built. A "sustained pursuit seen" is a distinct hunter and prey pair that passes the chase rule at a decision, counted again after 10 simulated seconds without one; most last a decision or two and a chase shot is taken only when the pursuit is the highest-scoring moment while the camera is wide, so shots are a small share of pursuits seen (the figures come from a throwaway wrapper over `director:dry` that counts the pairs; the shots, shares and rates are `director:dry`'s own).

## A death that reads

A death has three beats, all on the wall clock, all anchored to the body.

| Beat     | Length                  | What is drawn                                                                                                                                                                                                                                                                                                                                          |
| -------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Failing  | 0 to 400 ms             | The live loops keep running: `packBody` no longer zeroes the motion and body lanes of a pending body. The swim loop slows to rest over the beat. There is no frozen glide: a pending body with no record after 400 ms starts the starvation clip                                                                                                       |
| Breaking | 500 to 1400 ms by cause | The membrane fails. The membrane SDF gains a `tear` parameter (0 to 1): angular gaps open from the bite bearing for `EATEN`, from the lowest point for `STARVED`, and at scattered bearings for `DISEASE` and `POISONED`. The rim colour drains toward the palette's `rot` brown before any opacity falls. Organelle parts drift outward a body radius |
| Leaving  | 400 to 800 ms           | What is left fades. For `EATEN` the carcass model fades in over this beat as the body reaches `CARCASS_SCALE`, so two outlines never overlap at full strength                                                                                                                                                                                          |

- Particles spawn at the body's drawn position (`positionOf` in `js/app/renderer/dying.js`) and scale with the body's size, on the wall clock, so they end with the clip at any sim speed.
- Each of the seven causes in `DEATH_ANIMS` has its own breaking beat: `EATEN` (torn from the bite), `STARVED` (deflate, then split), `DISEASE` (pitting), `POISONED` (the fill clouds, then pits), `OLD_AGE` (a slow even fade with no tear), `COLLISION` (a flat split along the impact normal), `TRAMPLED` (flattened along the herd's heading, then split).
- A starving body shows it before it dies: under 15% energy the swim loop amplitude and the fill fall together (a `failing` condition loop in `js/app/renderer/clips.js`), so a death by starvation is anticipated.
- Birth: `birthPop` loses its elastic overshoot. A split is a fission (the parent's outline pinches and the child separates along the pinch axis); a mating birth is a bud that swells to size on an ease-out with no bounce.

The organelle drift of the breaking beat is open as T10b: the rig moves the whole model, not parts, so until a per-part channel exists the whole model tears.

The `tear` value rides the existing fade lane of a dying row, so the 16-attribute limit is not approached (10 used).

## Follow as a story

- **Hold through the death.** `stepFollow` holds for the death clip's length plus 600 ms, then hands off.
- **Hand off with a reason.** The next subject is, in order: the killer (when the death was `EATEN`), a living child, the nearest living kin of the same lineage, then `pickFollowAgent`. A caption names the relation for 3 s: "its killer", "its daughter", "its kin".
- **Framing.** `followStep` aims ahead of the body by its velocity times 0.4 s, capped at a fifth of the short side. During a pursuit (`js/app/pursuit.js`) it frames both bodies: the target is their midpoint and the zoom keeps both inside the middle 60% of the view.
- **Zoom breathes.** Zoom eases toward a target set by state: closer when the subject eats, mates or gives birth, wider with speed and in a pursuit. Manual zoom overrides it until the next handoff.
- **Boredom.** After 120 s with one subject and no event scoring above the movement score, follow hands off to `pickFollowAgent`'s best other subject. Manual selection disables the timeout for that subject.
- **Subject plate.** A small plate beside the ring: family colour and name, specialisation, age in seasons, children alive, kills, and the current condition (starving, pregnant, cold, hunted). It fades after 6 s and returns on a change; it takes the pixel shift of `applyPixelShift`. The ring becomes a smooth SDF ring.
- **Life line.** With the inspector open on a followed subject, the inspector follows the handoff and shows the subject's last 12 events as a strip (born, meal, bite given, bite taken, mate, birth, kill).

## A look that holds from across a room

These change the Look rules of [crisp-renderer.md](crisp-renderer.md); T18 edits that doc's rules in the same PR.

| Change           | Rule                                                                                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TV rim weight    | In TV mode `RIM_PX` rises from 1.5 to 2.25 and the minimum body size from 24 to 32 px; nothing glows at rest                                                                    |
| Void depth       | The depth points become three layers with parallax 0.2, 0.5 and 0.8 of the camera's move and a drift under 2 px a minute; pure black stays                                      |
| Event light only | A kill, a birth and a pack call may add a rim falloff of up to 6 px for up to 500 ms; idle bodies stay flat                                                                     |
| Night dim        | A brightness scalar by wall clock (`?dim=auto`, or fixed `?dim=<0.3 to 1>`): 1 by day, easing to 0.55 between 22:00 and 07:00 local, read through `js/app/prefs.js`             |
| Static lines     | In TV mode the border is off, and rocks, refuge rings and the wall column draw at 60% and shift with the director's slow drift, so no bright line sits on one pixel for an hour |

## Every reading one key away

The insights drawer opens with `D` and from the top bar (`I` stays the inspector; `D` and `T` are unbound in `js/app/ui/keymap.js` today). It reads what the worker already posts and what the app already keeps (`js/app/history.js`, `createMomentLog` in `js/app/director/moment-log.js`, the inspector data); a field the worker does not post yet is added to the stats message in `js/worker/protocol.js` with its validation.

| Tab      | Shows                                                                                                                                                                                                                                                                                                                                                                                  | Touch                                      |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| World    | the series of the charts drawer (`js/app/ui/charts.js`, which stays on `C`) beside tables of population by specialisation, births and deaths by cause per season, hunters alive, food energy, season and temperature, sim speed and ticks per second                                                                                                                                   | hover a series for its value               |
| Scenes   | the 15 scenes of `docs/principles.md`, each with its count in the last 4 seasons from `js/app/scene-counters.js` (new: counters from effect records, pursuit pairs and the moment log for the scenes with an on-screen signature: chase, abort, call, pack, refuge, scavenge, parent spends, boom and bust, cross or stay); a scene with no on-screen signature reads `no live signal` | click a scene to follow a live instance    |
| Families | the 12 largest lineages: colour, size, age, specialisation mix, kills, deepest generation                                                                                                                                                                                                                                                                                              | click a family to follow its oldest member |
| Records  | this world's longest life, most kills, most children, longest chase, with the holder if alive                                                                                                                                                                                                                                                                                          | click to follow the holder                 |
| Export   | the drawer's tables as CSV and the world's seed, config and tick as a `npm run replay` command                                                                                                                                                                                                                                                                                         | one button each                            |

`Shift+D` opens the same drawer as a full-screen board for a second monitor (`?board=1`), with the world drawn small in one corner.

## The scene reel

A behaviour change is reviewed by watching it. The reel is the clip of each scene, cut by the app, not chosen by hand.

- While the app runs, `js/app/reel.js` keeps a ring of the last 12 s of frames' camera and subject, and on a moment of a scene kind (`js/app/scene-counters.js`) saves a 10 s clip through `js/app/capture.js`: 6 s before the moment, 4 s after, framed by the follow of this doc. It keeps the best-scored clip per scene per world.
- The insights drawer gains a Reel tab: one tile per scene, the clip or `not seen yet`, the tick it happened and a button to jump the world's follow to a live instance.
- `npm run reel -- --seed <n> --ticks <t> [--config <file.json>] [--policy <name>] --out <dir>` runs the app headless in Chromium (the browser smoke's session, `scripts/lib/browser-session.mjs`) at x8 and writes one clip per scene seen and `reel.json` (scene, tick, score, file). On the WebGL2 software path the look differs from the real GPU; the reel shows behaviour, not the look.
- A PR that changes sim, evo or brain behaviour attaches the reel of seed 1 before and after for the scene it names (`create-pr` skill). The reel is a detector's companion, never fitness.
- The weekly watch: once a week the user watches the reel of the default world and the champions, and what the user says becomes tasks in the plan that owns the scene (`docs/principles.md`, "How the principles are used").

## Phases

### Phase 1 - The director on air

**Targets:** browser.frame_p95_ms, browser.draw_cpu_p95_ms

Both stay inside their [crisp-renderer.md](crisp-renderer.md) budgets with the director running. The `director:dry` readings meet the bars above on seeds 1 to 4.

| Chunk | Tasks    | Builder |
| ----- | -------- | ------- |
| A     | T1 to T4 | Sonnet  |
| A2    | T4b, T5  | Sonnet  |

### Phase 2 - A death that reads, and birth

**Targets:** browser.frame_p95_ms, browser.gpu_frame_p95_ms

Both stay inside budget at 1000 agents; the phase is judged by the clip.

| Chunk | Tasks     | Builder |
| ----- | --------- | ------- |
| B     | T6 to T11 | Sonnet  |

### Phase 3 - Follow as a story

**Targets:** none - camera and overlay logic on the main thread under 0.1 ms a frame; judged by the walk

| Chunk | Tasks      | Builder |
| ----- | ---------- | ------- |
| C     | T12 to T17 | Sonnet  |

### Phase 4 - The far-screen look

**Targets:** browser.gpu_frame_p95_ms, browser.frame_p95_ms

| Chunk | Tasks      | Builder |
| ----- | ---------- | ------- |
| D     | T18 to T22 | Sonnet  |

### Phase 5 - Every reading one key away

**Targets:** browser.main_long_tasks, browser.frame_p95_ms

The drawer open adds no long task and holds the frame budget.

| Chunk | Tasks      | Builder |
| ----- | ---------- | ------- |
| E     | T23 to T28 | Sonnet  |

### Phase 6 - The scene reel

**Targets:** browser.frame_p95_ms, browser.draw_cpu_p95_ms

Both stay inside budget with the reel's ring running; a clip is encoded off the frame.

| Chunk | Tasks      | Builder |
| ----- | ---------- | ------- |
| F     | T29 to T33 | Sonnet  |

## Decisions

| Decision                                                | Holds because                                                                                                                           |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| The membrane tears; nothing explodes                    | The art direction is restrained; a cell lyses, it does not burst into sparks                                                            |
| Light is added on events only                           | [crisp-renderer.md](crisp-renderer.md) forbids idle glow; a 500 ms falloff on a kill keeps that rule and reads at distance              |
| The variety penalty ages out after 15 simulated minutes | The repeat penalty is the kind's share of the last 20 shots; without an age cutoff a world with one kind of moment is shut out for good |
| The insights drawer computes nothing in the sim         | Detectors are read, never rewarded (`docs/principles.md`); the drawer reads posted stats and the app's own logs                         |
| A fission pinches the newborn, not the parent           | The BORN record carries only the child's genome                                                                                         |
| Every look change is verified on real WebGPU            | Software GL does not show the rim or MSAA as the OLED does                                                                              |

## Delivery requirements

| Concern                 | Names                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Architecture            | App only. `js/app/director/` (`pace.js`, `era-card.js`, the TV state in `js/app/tv-mode.js`), `js/app/follow.js`, `js/app/follow-target.js`, `js/app/follow-handoff.js` (new: the relation order), `js/app/camera.js`, `js/app/renderer/` (`dying.js`, `dying-pack.js`, `death-anim.js`, `effects-combat.js`, `clips.js`, the membrane SDF, `overlays.js`, `palette.js`), `js/app/ui/` (`caption.js`, `subject-plate.js`, `insights.js` and one module per tab), `js/app/pack/` only for the tear lane. `js/worker/protocol.js` for added stats fields. No `js/sim/` or `js/evo/` change                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Unit tests              | `test/app/tv-mode.test.js` (enter by URL, key and idle; leave restores camera, speed and HUD). `test/app/director/pace.test.js` and the director schedule tests (floor, ceiling, wide interval, repeat penalty). `test/app/renderer/death-anim.test.js` (three beats per cause, `tear` monotonic, colour drains before opacity, total length per cause). `test/app/renderer/dying-pack.test.js` (lanes kept while pending; the 400 ms default). `test/app/renderer/effects-combat.test.js` (particles at the drawn position, scaled by body size, wall clock). `test/app/follow.test.js` and `test/app/follow-handoff.test.js` (hold equals clip plus 600 ms; killer, child, kin, then pick; boredom at 120 s; manual selection exempt). `test/app/camera.test.js` (look-ahead cap, pair framing keeps both inside 60%). `test/app/ui/subject-plate.test.js`, `test/app/ui/insights*.test.js` (each tab from fixture stats; click-to-follow dispatches the action; CSV export). `test/worker/protocol.test.js` (new stats fields validate) |
| Headless e2e            | N/A for the sim: no `worldHash` moves. The browser smoke gains one spec inside its 5 s window: `?tv=1` draws 30 frames and reports TV mode on; the captions and the schedule are covered by unit tests and `director:dry`, not by the smoke                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Performance budget      | `npm run perf:browser -- --agents 1000 --viewport 3840x2160` before and after each phase on the real GPU, with the new `--url-params <query>` flag of `scripts/browser-perf.mjs` (T4) for `tv=1` and for the open drawer: `browser.frame_p95_ms` at or under 4.4, `browser.draw_cpu_p95_ms` at or under 2.5, `browser.gpu_frame_p95_ms` at or under 3.0, `browser.main_long_tasks` unchanged, against `bench/browser-baseline.json`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Evolution metrics       | N/A - no sim, evo or brain behaviour changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Determinism             | The sim is untouched. The director and follow use the app's seeded `js/app/prng.js`, so `npm run director:dry` replays a seed's shot list                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Config and persistence  | No `createConfig` key. URL parameters `tv`, `dim`, `board`; preferences in `js/app/prefs.js`: `tvIdleMinutes` (5), `dim` (`auto`), `followPlate` (true). No IndexedDB schema change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Logging and diagnostics | App log (`js/app/app-log.js`) events: `TvEntered`, `TvLeft` (`reason`), `DirectorShot` (`kind`, `subject`, `score`, `ms`), `FollowHandoff` (`from`, `to`, `relation`), `DeathClip` at debug (`cause`, `pendingMs`, `clipMs`). A stuck camera shows as no `DirectorShot` for 90 s; `window.__perf()` and the debug bundle carry the last 50 events                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Browser compatibility   | Chrome on WebGPU (the target) and the WebGL2 fallback; the tear and the rim falloff have a WebGL2 path or degrade to the current fade, stated per task. Verified on the 4K OLED at 240 Hz and the 1440p panel                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Docs                    | [crisp-renderer.md](crisp-renderer.md) (Look rules, the death and birth clips), [continuous-follow.md](continuous-follow.md) (the handoff and framing), [worker-and-renderer.md](worker-and-renderer.md) (T30, T50 to T52 marked built), `README.md` (TV mode, the keys), the help drawer. Once `Implemented` this doc describes the unattended experience                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Verification            | `scripts/check.sh --fix --quick` per chunk, CI `check` with the browser smoke, `npm run perf:browser` per phase, and the walk under Verification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

## Task breakdown

### Phase 1 - The director on air

| #   | Task                                                                                                                                                                                                                                                                                                      | Nature      | Depends on |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------- |
| T1  | Build [worker-and-renderer.md](worker-and-renderer.md) T30: `ui/caption.js`, the director wired in `main.js` and the frame loop, the TV border, cursor hiding; mark it built there                                                                                                                        | [judgement] | -          |
| T2  | Add `js/app/tv-mode.js`: enter by `?tv=1`, the `T` key and idle; leave on input with camera, speed and HUD restored; the app log events; tests                                                                                                                                                            | [judgement] | T1         |
| T3  | Build T52 (`director/pace.js`), T51 (the era card) and T49 (which T51 depends on) of that doc, with the shot floor, ceiling, wide interval and repeat penalty; tests                                                                                                                                      | [judgement] | T1         |
| T4  | Build T50 (`npm run director:dry`) and record the three readings on seeds 1 to 4; add the `?tv=1` smoke spec and `--url-params` to `scripts/browser-perf.mjs` with a test                                                                                                                                 | [judgement] | T3         |
| T4b | Meet the `director:dry` bars without the `hunting` bit ([worker-and-renderer.md](worker-and-renderer.md) T48 waits on world-balance Phase 1): a chase shot found and held from pursuit geometry, more moment kinds so one kind cannot fill a world (seed 2); re-read seeds 1 to 4, bars unchanged (built) | [judgement] | T4         |
| T5  | Conformance review of Phase 1 with `perf:browser` on the real GPU                                                                                                                                                                                                                                         | [judgement] | T2, T4b    |

### Phase 2 - A death that reads, and birth

| #    | Task                                                                                                                                                            | Nature       | Depends on |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T6   | Capture one kill, one starvation and one birth on the real GPU at x1 (`js/app/capture.js`) and attach the clips to the PR as the before                         | [mechanical] | -          |
| T7   | Keep the live lanes on a pending body, cut the pending wait to 400 ms, and move death particles to the drawn position, body scale and wall clock; tests (built) | [judgement]  | T6         |
| T8   | Add the `tear` parameter to the membrane SDF and the three beats per cause in `death-anim.js`, with the colour drain; WebGL2 path; tests (built)                | [judgement]  | T7         |
| T9   | Cross-fade the carcass in over the leaving beat; add the `failing` loop under 15% energy; tests (built)                                                         | [judgement]  | T8         |
| T10  | Replace `birthPop` with the fission and bud eases; tests (built)                                                                                                | [judgement]  | T6         |
| T10b | Drift organelle parts outward a body radius over the breaking beat: needs a per-part rig channel; until then the whole model tears                              | [judgement]  | T8         |
| T11  | Conformance review of Phase 2 with the after clips and `perf:browser` at 1000 agents                                                                            | [judgement]  | T9, T10    |

### Phase 3 - Follow as a story

| #   | Task                                                                                                                                   | Nature       | Depends on         |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------ |
| T12 | Hold follow for the clip length plus 600 ms; add `js/app/follow-handoff.js` (killer, child, kin, pick) and the relation caption; tests | [judgement]  | T7                 |
| T13 | Add look-ahead, pair framing and state zoom to `followStep`; tests                                                                     | [judgement]  | -                  |
| T14 | Add the boredom timeout and the manual exemption; tests                                                                                | [mechanical] | T12                |
| T15 | Add `ui/subject-plate.js` and the SDF ring; tests                                                                                      | [judgement]  | -                  |
| T16 | Make the inspector follow a handoff and add the 12-event life line; tests                                                              | [judgement]  | T12                |
| T17 | Conformance review of Phase 3                                                                                                          | [judgement]  | T13, T14, T15, T16 |

### Phase 4 - The far-screen look

| #   | Task                                                                                                                                    | Nature       | Depends on         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------ |
| T18 | TV rim weight and minimum size; the static-line dim and drift; the Look rules of [crisp-renderer.md](crisp-renderer.md) edited to match | [judgement]  | T2                 |
| T19 | Three parallax depth layers with slow drift; tests on the pack output                                                                   | [judgement]  | -                  |
| T20 | The event-only rim falloff (kill, birth, pack call), capped at 6 px and 500 ms; WebGL2 path; tests                                      | [judgement]  | T8                 |
| T21 | Night dim by wall clock with `?dim` and the preference; tests with an injected clock                                                    | [mechanical] | -                  |
| T22 | Conformance review of Phase 4 on the 4K OLED and the 1440p panel, with screenshots from 3 m                                             | [judgement]  | T18, T19, T20, T21 |

### Phase 5 - Every reading one key away

| #   | Task                                                                                                                                                                              | Nature       | Depends on |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T23 | Add `ui/insights.js`, the `D` key in `js/app/ui/keymap.js` and the top-bar entry, with the World tab from `js/app/history.js`; add any missing stats field to the protocol; tests | [judgement]  | -          |
| T24 | Add `js/app/scene-counters.js` and the Scenes tab, with click-to-follow; tests for each counter from fixture effect records                                                       | [judgement]  | T23        |
| T25 | Add the Families and Records tabs with click-to-follow; tests                                                                                                                     | [judgement]  | T23        |
| T26 | Add the Export tab (CSV and the replay command); tests                                                                                                                            | [mechanical] | T23        |
| T27 | Add the full-screen board (`Shift+D`, `?board=1`); tests                                                                                                                          | [judgement]  | T24, T25   |
| T28 | Conformance review of Phase 5 with `perf:browser` (drawer open)                                                                                                                   | [judgement]  | T26, T27   |

### Phase 6 - The scene reel

| #   | Task                                                                                                                                                         | Nature       | Depends on |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ | ---------- |
| T29 | Add `js/app/reel.js` (the ring, the 10 s clip on a scene moment, best clip per scene) on `js/app/capture.js`, with tests on fixture moments                  | [judgement]  | T24        |
| T30 | Add the Reel tab to the insights drawer with the jump-to-live button; tests                                                                                  | [judgement]  | T29        |
| T31 | Add `scripts/reel.mjs` and `npm run reel` on the smoke's browser session, writing clips and `reel.json`; a test on a 2000-tick world that it writes the file | [judgement]  | T29        |
| T32 | Add the reel to the `create-pr` skill and `docs/commands.md`, and the weekly watch to `docs/principles.md`                                                   | [mechanical] | T31        |
| T33 | Conformance review of Phase 6 with `perf:browser`                                                                                                            | [judgement]  | T30, T32   |

## Verification

- `scripts/check.sh --fix --quick` and CI `check` (with the browser smoke) are green for each chunk.
- `npm run perf:browser -- --agents 1000 --viewport 3840x2160` on the real GPU holds every budget after each phase.
- Walk, on the 4K OLED:
    1. Open `/?tv=1` and leave it 30 minutes. The camera never rests over 90 s, a chase is held to its end, a caption names what is shown, and no HUD element stays lit.
    2. Press a key: the camera, speed and HUD return. Wait 5 minutes: TV mode resumes.
    3. Press `F` on a hunter. It frames the hunter and its prey together during a pursuit. When the subject dies the camera holds until the outline is gone, then moves to its killer or kin with a caption.
    4. Watch a kill and a starvation at x1 and x4: the body slows, the membrane tears from the bite or the base, the colour drains, the carcass appears as the body leaves; the particles end with the clip at both speeds.
    5. Press `D`: each tab fills within 1 s; a click on a scene, family or record follows it.
    6. View from 3 m: a hunter, a forager and a carcass are told apart.
