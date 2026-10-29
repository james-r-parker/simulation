# Principles

Version 2 (user, 2026-10-29). The text of the traits, the scenes, the refusals and the selection rules is the user's.
The sections "Measure scenes, reward them almost never", "How each scene is detected", "What the user flagged" and
"Known violations today" are the working notes that tie it to the code and the metrics.

A change is worth making only if a person watching the arena, with no charts open, can point at a life and narrate it.
The narration has to be about a body, a place, and other blobs. If a new brain, fitness term, or world rule only moves
a number, it does not belong.

These are the traits every later choice has to keep true, and the scenes those traits are there to produce.

## Traits

- **A body is a budget.** Energy, heat, vision, size, birth, sprinting, biting, and calling all spend the same life.
  Nothing important is free, and nothing is best at all of them. A forager, a predator, a scout, a defender, and a
  reproducer are different answers to that budget, not costumes.
- **Senses are local and lossy.** A blob knows what its rays, scent, and calls tell it, plus its own body. It does not
  know the map, the season's name, or another blob's intent. Interesting behavior is what partial information looks
  like: hesitation, false starts, walking into a trap.
- **Needs conflict in the same tick.** Hunger, cold, a mate, a pregnancy, a pursuer, and a child can all be true at
  once. The brain's job is to choose badly sometimes. A policy that always does the "right" thing is less natural than
  one that abandons a patch because it is bleeding.
- **The same genome is a different animal at each age.** Juvenile, mature, pregnant, recently bitten, overheated, and
  starving should move differently because the body inputs changed, not because a script swapped modes. You should be
  able to guess condition from the movement.
- **Individuals differ inside a type.** Two foragers from different lineages should not be interchangeable. If
  selection collapses everyone to one gait, the world has failed even if fitness is high.
- **Kin is not a stranger.** Parent, child, and sibling already exist as a sensed fact. Tolerance, staying near, and
  refusing a bite should be possible, and so should getting it wrong or exploiting it. Relatedness that never changes
  a decision is a wasted channel.
- **Signals cost, and they can be false.** Alarm, hunt call, and smoke are only natural if staying quiet is sometimes
  better, and if a call can be ignored, late, or self-serving. A signal everyone always obeys is a remote control.
- **Place is part of the animal.** Patches, rock rings, the wall gaps, the cold north and south edges, and the two
  basins are habitats. A blob should be understandable from where it is: feeding, hiding, crossing, or stranded.
- **Other blobs are the climate.** Prey get harder because predators got better, and the reverse. A fitness function
  that can be solved against a fixed world will be solved, and then the picture stops changing.
- **Time has more than one speed.** A dodge is a few ticks. A chase is seconds. A pregnancy is hundreds of ticks. A
  season is 36,000. A lineage is longer than a life. Memory, leak, and the two memory cells are for these gaps. A
  brain that only reacts has no seasons in it, even if the map does.
- **Death stays in the world.** A kill leaves a carcass, heat, scent, and a witness. Scavenging, avoiding a fight site,
  and a predator arriving late are the difference between an ecosystem and particles despawning.
- **Luck is not skill.** Eating because a plant spawned on you is not foraging. A bite landed because two blobs bounced
  is not a hunt. Deliberate approach, abort, and pursuit are the behaviors worth selecting. Chance contact can feed a
  blob. It should not define a good genome.

## Scenes

If a proposed change makes any of these impossible, reject it. If the sim never shows them, the work is not done.

| Scene                       | What you see                                                                                                                       | What must stay true                                                                                               |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Leave a dying patch         | A forager quits a patch that is empty and crosses to another, instead of orbiting the old one                                      | Depletion is perceivable. Movement costs. Memory or scent can outlast the last bite                               |
| A real chase                | A predator closes on a heading. The prey breaks line, uses a rock ring or smoke, and the predator either cuts the exit or gives up | Bite arc, vision, and sprint are limited. Losing sight is not the same as the prey ceasing to exist               |
| Abort                       | A hunter peels off a target that is too big, too far, or too well surrounded                                                       | Giving up is a success, not a failed output                                                                       |
| Call, or don't              | An alarm moves neighbors. Another blob in the same trouble stays quiet and keeps the meal                                          | Calling has a cost. Hearing is not obedience                                                                      |
| Pack, or loner              | Two hunters arrive on one prey inside the pack window, or a hunter deliberately does not share                                     | Kin and hunt-call are optional strategies, not a buff                                                             |
| Refuge                      | Under threat, prey stack into a rock ring or a cold margin and then leak back out to feed                                          | Cover blocks rays. Cover is not free food                                                                         |
| Scavenge                    | A carcass pulls a meat-eater and is skipped or risked by everyone else                                                             | Death has a location and a timer                                                                                  |
| Condition changes the walk  | A pregnant, cold, or starved blob takes a different path from its own earlier self                                                 | Body inputs are allowed to dominate the action. One output mapping for all states is a failure                    |
| Season changes the map      | Winter in a basin is slower, tighter, and nearer shelter. Summer spreads. A drought on one side empties that side                  | Season and temperature are felt locally. A genome that is optimal in both without changing behavior is suspicious |
| Cross or stay               | Some lineages use the wall gaps. Others never do, and a drought kills them for it                                                  | The basins are real isolation, not decoration                                                                     |
| Parent spends               | A rich mother funds a larger child. A poor one waits or gives less                                                                 | `childShare` and the birth cap are life-history, not just numbers                                                 |
| Same spec, different custom | Two predator lines, one courser and one ambusher at the rocks                                                                      | Archive and fitness must be able to keep both. A single "best hunter" score will delete one                       |
| Boom and bust               | A local population swells, strips a patch, crashes, and is recolonized                                                             | Caps and immigration must not smooth this into a flat line                                                        |
| Something unnamed           | A tactic no metric asked for, still obvious on screen                                                                              | Do not add a reward for every scene above. Leave room for a strategy the score does not know                      |

## What to refuse

- **A global reward for a fact the blob cannot sense.** Selection can keep it, but it will not look like knowledge.
- **A free action.** If alarm, smoke, sprint, or birth becomes cheap, the picture fills with spam and the trait
  disappears.
- **A scripted mode that bypasses the brain.** Specializations may change costs and permissions. They should not play
  the life for it.
- **One niche allowed to win the whole map.** The gaps, the seasons, and the archive exist so a second way of living
  can hold ground.
- **Smoothing away crashes.** A world that cannot go locally extinct cannot be recolonized, and recolonization is half
  of what makes the natural world watchable.
- **More sensors or more hidden units as a substitute for a scene.** Add them only when a scene above is impossible
  with the senses and memory the blob already has.

The test for a pull request is a sentence a viewer could say out loud: "that one left the patch," "that one lost it at
the rocks," "those two are not the same kind of hunter," "this basin is in winter." If the change does not make one of
those sentences more often true, it is not serving the sim.

## Selection

Add a selection rule underneath the scenes. The scenes say what is worth watching. These say which genes are allowed to
keep doing it. Right now a lucky life can still breed, and a dead failure can still come back.

Natural selection is not a leaderboard. A gene wins only if its bearers leave offspring that also leave offspring. A
high `fitnessV6` at death is a eulogy. It changes nothing unless that eulogy is copied back in as a birth. The archive,
the immigration pulse, and predator rescue are breeders, not museums, for as long as they put bodies on the map.

### Rules

1. **Death is final.** A failed genome is gone when its living bearers are gone and nothing copies it back. Archive
   seeds, random floor entrants, predator restocking, and opening the split gate whenever the population dips all
   grant children to genes that already lost. A rare niche is not a pardon. Store a loser if you want a record. Do not
   let it breed until the living have actually failed to fill the map.
2. **A lucky life does not found a line.** Chance food still pays a quarter in fitness and in merit, and the split gate
   opens on a raw deliberate total of 300, not on the share of a life that was deliberate. One good hour clears the
   bar. Require the same bar of the offspring before that line is established. A parent that ate by collision, and
   children that cannot repeat the skill, is luck. Luck does not get a dynasty.[^1]
3. **The whole genome is a bag until something breaks it.** A split copies the useful weights and the broken ones
   together. Failed genes hitchhike on one good reflex for as long as births are clones. They die out only if a hard
   season, or mating, separates them from the part that works. Selecting on energy, or on one life's loot, never looks
   inside the bag.
4. **Strength is who remains after the bad season.** The strongest survivor is not the fattest blob in summer and not
   the highest score in the archive. It is the lineage still present after winter, a drought, and being hunted. Rescue
   a role before that sieve finishes and you are keeping the genes the season was about to delete. If predators cannot
   live on what they catch, change the cost or the prey. Do not restock them.
5. **Incompetence kills first. Fertility is second.** Starving, freezing, and being eaten have to actually remove
   bodies. Among the ones left, skilled parents leave more. A population pinned at the cap, where almost everyone lives
   and mates are ranked by energy, is a lottery. Energy is the tank luck fills. Mate choice has to point at
   demonstrated skill or at offspring that lived, or sexual selection undoes the split gate.
6. **Hunting wins by the chain, and the chain fails closed.** Detect, commit, pursue, kill, and still be alive. A chase
   that never bites, a bite that was a bounce, and a kill that costs more than it returns are failed genes, even if
   fitness paid a little for the attempt. Aborting a bad chase needs no prize. The one who turns back is alive to
   breed, and the one who does not is not.
7. **Team and family skills win only if the payoff returns to the actor's offspring.** A pack point paid to every kin
   inside call range, except the two who actually bit, rewards standing nearby. Passengers are lucky agents with the
   right relatives. Credit the blob whose own children increase: kin that were fed, a recruit that shared the kill
   back, a sibling that lived because of an alarm. A helper whose cousins do not breed has a failed social gene.
8. **Cheaters are the test.** Family tolerance that cannot tell a stranger, a hunt call that feeds a non-kin, an alarm
   that costs the hearers and not the liar. If the cheater leaves more offspring, the social gene is not real and
   adding points will not make it real. Turn the credit off. Do not protect it.
9. **Do not pay a behavior the children cannot repeat.** Watch terms for chase, pack, and migration are worth keeping
   only when the next generation does the thing again without the bonus. If the score rises and the children go back
   to bumping into food, the term is paying luck or a hitchhiker.

### What this changes in choices already made

| Choice                               | Keep                                          | Change                                                                                                              |
| ------------------------------------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Split gate at 300 deliberate         | The hard bar                                  | Also require deliberate share, and require the child to clear it. A total one lucky afternoon can hit is not a gene |
| Chance weighted at 0.25              | A small door for scavengers                   | Do not let it move mate rank, birth energy, or archive rank. Chance may feed a body. It may not breed               |
| Mate ranked by energy                | -                                             | Rank by skill the children can inherit, or by offspring that reached maturity. Energy is the luck tank              |
| Archive and immigration              | A memory of what once worked                  | Immigrants enter poor and unproven, and they do not re-enter at all while the living are replacing themselves       |
| Diversity bonus for a rare niche     | Two strategies that both replace themselves   | A rare failure is still a failure. Rarity is not fitness                                                            |
| Pack and family terms                | Kin as a real sensed fact                     | Pay only what comes back as grandkids. Nearby kin are not a team                                                    |
| Predator rescue and the floor bypass | A world that can be recolonized by the living | Not a restock. Recolonizers are whoever survived next door                                                          |

The scenes from before still stand. Selection's job is to delete every genome that cannot produce them and to keep
every genome that can, including two different ways of hunting. A courser and an ambusher are not failed genes. A blob
that ate because a plant spawned on it, and a genome that comes back from the archive after its line starved, are.

[^1]:
    Written before T48g. Since T48g the split gate also requires a deliberate meal share of 0.2 (`splitDeliberateShareMin`),
    so the share condition exists today (K8). The condition on the child is new, and is planned in
    [natural-selection.md](designs/natural-selection.md) (the proof rule).

## Measure scenes, reward them almost never

User, 2026-10-29.

- **Purpose.** A change exists to make a scene happen more often.
- **Proof.** A metric that detects the scene, compared on 16 seeds with `eval:compare`.
- **Detectors are encouraged.** Rewards (fitness or merit terms) for a scene are refused unless the scene is
  impossible otherwise, and then only for a fact the blob can sense.

This is how "if it only moves a number, it does not belong" and the `AGENTS.md` rule "a claim carries the
measurement" hold together: the number is a detector of a scene, never a payment for it. A detector reads the world;
a reward changes who breeds.

## How each scene is detected

"Now" is E63 (current defaults, 16 seeds x 200000 ticks) or E42 (the same defaults, 16 seeds x 600000 ticks), both in
[sim-notes.md](designs/sim-notes.md) on 2026-10-29, as E63 / E42. A row with `none yet` is a gap: it is planned as a
metric before a change claims the scene (`natural-selection.md` T1 and T2).

| Scene                       | Detector today                                                                                                           | Now (E63 / E42)                                                   | Gap and proposed detector                                                                                                            |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Leave a dying patch         | `eval.migration_index` (distinct patches visited per life, a proxy)                                                      | 0.066 / 0.079                                                     | `eval.patch_stay_depleted`, `eval.patch_leave_depleted` (built, natural-selection.md T1)                                             |
| A real chase                | `eval.pursuit_kill_share`, `eval.escape_rate`, `eval.catch_rate`, `eval.pursuit_bite_share`                              | pursuit kills 0.075 / 0.22; escape 0.81 / 0.87                    | `eval.chase_catch_share`, `eval.chase_escape_share`, `eval.chase_giveup_share` (built, T1): outcomes from the first closing sighting |
| Abort                       | none                                                                                                                     | -                                                                 | `eval.hunt_abort_rate` (built, T1)                                                                                                   |
| Call, or don't              | `eval.alarm_precision`, `eval.alarm_response`, `eval.hunt_call_precision`, `eval.idle_signals_per_1k`, `eval.alarm_rate` | precision 0.0003 (E42); response about 0; alarm rate 8.1 per 1000 | -                                                                                                                                    |
| Pack, or loner              | `eval.pack_kill_share`, `eval.pack_convergence`, `eval.hunt_call_answer`                                                 | pack kills 0.030 / 0.059; answer 0.015 / 0.025; convergence null  | -                                                                                                                                    |
| Refuge                      | none (`eval.group_cohesion_under_threat` counts same-lineage neighbours, not cover)                                      | -                                                                 | `eval.refuge_use_under_threat` (built, T1)                                                                                           |
| Scavenge                    | none                                                                                                                     | -                                                                 | `eval.carcass_meal_share`, `eval.carcass_hunter_share` (built, T1)                                                                   |
| Condition changes the walk  | none                                                                                                                     | -                                                                 | `eval.condition_gait_shift` (built, T1b)                                                                                             |
| Season changes the map      | `eval.winter_pop_ratio`, `eval.migration_index`                                                                          | not recorded in E63 or E42                                        | `eval.winter_basin_density`, `eval.winter_shelter_distance` (built, T1b)                                                             |
| Cross or stay               | none                                                                                                                     | -                                                                 | `eval.gap_crossers`, `eval.gap_never_share` (built, T1)                                                                              |
| Parent spends               | `eval.trait_spread` (the `childShare` trait spread), `eval.offspring_per_life`                                           | not recorded in E63 or E42                                        | `eval.mother_wait_by_condition`, `eval.childshare_by_condition` (built, T1b)                                                         |
| Same spec, different custom | `eval.body_plan_coverage`, `eval.behaviour_coverage`, `eval.motion_coverage`, `eval.spec_effective`                      | spec effective 2.19 / 1.66                                        | `eval.style_separation` (built, T1b)                                                                                                 |
| Boom and bust               | `eval.floor_episodes`, `eval.population_mean`, `eval.predator_share_cv`                                                  | floor episodes 21.3 (E63 candidate)                               | `eval.basin_pop_cv`, `eval.basin_recolonisations` (built, T1)                                                                        |
| Something unnamed           | none, by design                                                                                                          | -                                                                 | The user's watch of the default world (`Shift+P`)                                                                                    |

The selection rules have their own detectors, planned in `natural-selection.md`: lineage persistence through winter,
drought and predation (rules 1 and 4), heritability of the skill without the bonus (rules 2 and 9), and the share of
births by source (archive, immigrant, floor, rescue, split, mate).

## What the user flagged

The earlier version of this page (v1) held these two lists. They stay as the measured side of the traits above, each
now pointing at a scene.

| #   | Failure                                  | Metrics                                                                                  | Now (E63 / E42)                                                                                                        | Scene or rule it breaks                         |
| --- | ---------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| N1  | Agents spinning on the spot              | `eval.circling_share`, `eval.output_saturation`                                          | 25-65% circling at 200k ticks (diagnosis, 4 seeds); the metrics are new in T48h                                        | Leave a dying patch; Condition changes the walk |
| N2  | Every agent the same type                | `eval.spec_dominance`, `eval.spec_effective`                                             | 0.74 / 0.85 dominance; 2.19 / 1.66 effective types. The live app showed 97% scouts                                     | One niche allowed to win the whole map          |
| N3  | Agents that never travel across the map  | `eval.migration_index`; a ground-covered measure (none yet)                              | 0.066 / 0.079                                                                                                          | Cross or stay; Leave a dying patch              |
| N4  | No hunting                               | `eval.predator_presence`, `eval.predator_births`, `eval.pursuit_kill_share`              | presence 1.0 / 1.0; births 70 / 1101 per seed (one seed carries most); pursuit kills 0.075 / 0.22                      | A real chase                                    |
| N5  | No evolution: bad agents living too long | `eval.skill_trend`, `eval.lineage_turnover`, `eval.energy_over_split`, `eval.alarm_rate` | skill trend +0.003 / +0.036; turnover 4.5 / 1.7; agents hold 3-8x the split threshold; alarms are free and meaningless | Selection rules 1 and 5; Signals cost           |

| #   | Goal                                                                      | Metrics                                                                                                | Now (E63 / E42)                                                              | Scene                          |
| --- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | ------------------------------ |
| G1  | Many different gene pools: small families fighting to survive             | `eval.lineages_alive`, `eval.lineage_dominance`, `eval.lineage_turnover`, `eval.spec_effective`        | 20 / 20 lineages; dominance 0.39 / 0.65 (one family takes over in long runs) | Same spec, different custom    |
| G2  | Families and groups working together                                      | `eval.kin_within_call_radius`, `eval.alarm_response`, `eval.hunt_call_answer`                          | kin nearby 1.6 / 2.1; alarm response about 0; hunt-call answer 0.015 / 0.025 | Call, or don't; Pack, or loner |
| G3  | Hunting in packs                                                          | `eval.pack_kill_share`                                                                                 | 0.030 / 0.059                                                                | Pack, or loner                 |
| G4  | Natural-world behaviour: foraging trips, fleeing, seasonal movement, rest | `eval.escape_rate`, `eval.deliberate_food_share`, `eval.migration_index`; seasonal movement (none yet) | escape 0.81 / 0.87; deliberate food 0.17 / 0.17                              | Season changes the map; Refuge |

## Known violations today

Each claim below was checked in the code on 2026-10-29 (`origin/main` at the head of this PR). Fixes are planned in
[natural-selection.md](designs/natural-selection.md) except K12 ([brain-capacity-and-memory.md](designs/brain-capacity-and-memory.md) H1), K7 (the E64 economy, the specialisation budgets, the Phase 3 attribution and, if needed, a habitat lever, T17b) and K16 (accepted; T17d revisits it).

| #   | Breaks                                                                  | What the code does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| K1  | Trait: senses are local                                                 | `writeBodyInputs` in `js/sim/body-inputs.js` writes the sine and cosine of the year phase into body inputs 9 and 10 (`season sine`, `season cosine` in the inspector labels of `js/worker/inspect.js`). Every blob is told the calendar. It should feel the season through local temperature and food                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| K2  | Refusal: smoothing away crashes; selection rule 1                       | `fillFloor` in `js/sim/population.js` tops the world up to `minAgents` (40) with `spawnAgent(..., BORN_CAUSE.FLOOR)` every tick it is under. The seeder (`createSeeder` in `js/evo/policies/map-elites-seed.js`) gives each entrant, once the archive holds 10 cells: 50% a mutated archive child, 30% an unmutated archive clone, 20% random weights; before that all random. The spec is a random elite's (`specMutationRate` 0.002 is above 0). The entrant lands at a uniformly random point of either basin with `initialEnergy` 800. E64's best arm (`max-2000-scout-move-1`) had 91.6 floor episodes per seed in 200000 ticks, against 7.0 for the reference. The world is floor-bound, and a crashed basin is refilled from the archive, not recolonised through the gaps |
| K3  | Refusal: smoothing away crashes; selection rule 1                       | `immigrationInterval` 600 spawns one more entrant from the same seeder whenever the population is under `maxAgents` (500), about 330 per 200000 ticks, at a random point of either basin, whatever the births are doing. `predatorRescueMin` 3 and `predatorRescueInterval` 450 (`rescuePredators` in `js/sim/predator-rescue.js`) spawn one entrant as a hunter, from the predator cell of the archive, every 450 ticks while fewer than 3 hunters live                                                                                                                                                                                                                                                                                                                          |
| K4  | Selection rules 1 and 2                                                 | `splitGateOpen` in `js/sim/reproduction.js` opens for every agent when `population < meritSplitFloorPop` (80). With a mean population of 146 in E64's best arm and a floor of 40, the bypass is open often. Entrants are not poor: `initialEnergy` is 800, near the split threshold (about 900)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| K5  | Trait: individuals differ; scene: same spec, different custom           | `descriptorV6` in `js/evo/descriptors.js` places a death at (deliberate share of intake, body plan) inside the grid of its specialisation. Neither axis describes a style, so a courser and an ambusher of one spec and one body plan fall in one cell, and the cell keeps one elite. The cell is the archive's only memory of the pair                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| K6  | Trait: signals cost                                                     | `alarmCost` is 0.5 energy per call (`js/sim/calls.js`), about 2% of intake, and `eval.alarm_precision` is 0.0003 in E42 (0.00015 in the 4 seed diagnosis) with `eval.alarm_response` about 0. Alarms are near-free and carry no information. `eval.alarm_rate` is 8.13 per 1000 agent-ticks on the reference                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| K7  | Refusal: one niche wins; N1                                             | Scouts: `eval.spec_dominance` 0.781 in the E64 reference (0.74 in E63, 0.85 in E42); the best arm brings it to 0.536, not under 0.5. Spinning: `eval.circling_share` 0.441 in the reference and 0.331 in the best arm; no arm gets under 0.30. Output saturation 0.481 to 0.305                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| K8  | Selection rules 2 and 5                                                 | The split gate is now both `splitDeliberateMin` 300 (raw deliberate energy) and `splitDeliberateShareMin` 0.2 (deliberate meals over meals, a count share), judged on the parent only. The child's counters start at zero (`freeAgent`), so a line is established by its first split with no test of the child. The "raw total of 300, not share" in the rule 2 text is stale since T48g; "the child must clear it" is not built                                                                                                                                                                                                                                                                                                                                                  |
| K9  | Selection rules 2 and 5                                                 | Chance food and bites pay `CHANCE_WEIGHT` 0.25 in `fitnessV6` (`js/evo/fitness-v6-skill.js`) and `meritChanceWeight` 0.25 in merit. Merit does not yet move mate rank (`meritMateWeight` 0) or birth energy (`meritBirthBoost` 0), so chance reaches breeding only through archive rank today. The 0.25 would reach mate rank and birth energy the moment either weight is raised                                                                                                                                                                                                                                                                                                                                                                                                 |
| K10 | Selection rule 5                                                        | `mateScore` in `js/sim/mate-search.js` is `energy / maxEnergy` at the default `meritMateWeight` 0. Mates are ranked by energy alone                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| K11 | Selection rule 7                                                        | The pack term of `fitnessV6` (`PACK` 30 in `js/evo/fitness-v6-watch.js`, counted by `notePackKin` in `js/evo/observer-watch-counters.js`) pays the other kin within `callRadius` of where the victim fell, and the two who bit are paid by the skill group instead. Standing nearby is what it rewards. Nothing checks that the paid blob's children benefit                                                                                                                                                                                                                                                                                                                                                                                                                      |
| K12 | Selection rule 3                                                        | A split is a mutated copy of one parent: `childBrain` in `js/evo/policies/natural-birth.js` mutates every gene by the birth's sigma and crosses neuron blocks only on a mate birth. The claim in rule 3 holds; the mutation is dense, which `brain-capacity-and-memory.md` H1 tests. Deferred to H1 and `E50`, not fixed by the switch                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| K13 | Selection rule 1                                                        | `fitnessV6` carries a diversity factor (`js/evo/fitness-v6-diversity.js`) that pays rarity. Whether the paid niches replace themselves is not measured                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| K14 | Refusal: smoothing away crashes; selection rule 1                       | `invade` in `js/sim/invasion.js` adds 12 immigrants of one lineage at a world edge every `invasionInterval` (180000) ticks while `erasEnabled`; the first draws its genome from the archive and the others copy it. A crashed world is restocked by a pulse of a lineage that was not there. Turned off in the switch (`invasionInterval` 0), so the era cards for invasions lose their trigger and the renderer's director moments handle a world without them                                                                                                                                                                                                                                                                                                                   |
| K15 | Refusal: a reward for a fact the blob cannot sense; rules 5, 6, 7 and 9 | `fitnessV6` pays acts: `CHASE` 0.5 per chase tick (cap 600) and `MIGRATE` 40 per patch visited (cap 8) in `fitness-v6-watch.js`, `MATING` 100 per mating in `fitness-v6-lineage.js`, `ALARM` 40 and `HUNT_CALL` 40 in `fitness-v6-skill.js`. They pay doing, not offspring. The switch zeroes all five (arm `restore-act-terms`). Rule 6: zeroing `CHASE` is the switch's only action; the chain is measured by detectors (`eval.chase_catch_share`, `eval.hunt_abort_rate`), not paid                                                                                                                                                                                                                                                                                            |
| K16 | Accepted for now                                                        | Births are capped by `maxBirthsPerWindow` 5 per mother, `capBirthsEnabled` (pregnancies wait at `maxAgents`, splits stop `splitCapMargin` 50 short) and `maxAgents` 500. They keep a lottery population from filling the map and stop a boom from clipping the CPU budget; they smooth booms. Kept in the switch; natural-selection.md T17d screens removing or raising them only if `eval.basin_pop_cv` stays flat after T17, since the cap is then what hides the crash                                                                                                                                                                                                                                                                                                         |

Checks that came out as the user's text says: the floor and immigration seed from the archive (K2, K3), the predator
rescue restocks on a timer (K3), mates are ranked by energy (K10), chance pays 0.25 in fitness and merit (K9), and the
pack term pays standers-by (K11).

## How the principles are used

- A plan's done criteria cite the scenes and selection rules its phase serves. A phase does not close while it leaves
  an N failure worse, or while an N failure it set out to fix is still visible in the app.
- A PR that changes sim, evo or brain behaviour names the scene or rule it serves and the detector that shows it
  (`AGENTS.md` Hard rules; the `create-pr` skill body template).
- Natural selection does the work. The world punishes waste hard enough that a failing behaviour dies out rather than
  living on stored energy; rewards are added only where the "Measure scenes, reward them almost never" rule allows.
- The app is checked by eye as well as by metrics: a phase that changes behaviour ends with a clip of the default
  world (`Shift+P`) for the user.
- A gap marked "none yet" is planned as a metric before a change claims to fix it.
