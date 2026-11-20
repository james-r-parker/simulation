# Principles

Version 2 (user, 2026-10-29). The text of the traits, the scenes, the refusals and the selection rules is the user's.
The section "Measure scenes, reward them almost never" is the working note that ties it to the code and the metrics.
Which metric detects which scene, and what each reads now, is in [scene-scorecard.md](scene-scorecard.md) (generated).

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

| Scene                       | What you see                                                                                                                                  | What must stay true                                                                                               |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Leave a dying patch         | A forager quits a patch that is empty and crosses to another, instead of orbiting the old one                                                 | Depletion is perceivable. Movement costs. Memory or scent can outlast the last bite                               |
| A real chase                | A predator closes on a heading; a nearby hunter can also start a herd stampede. The prey breaks line, uses cover, or crosses the herd heading | Bite arc, vision, and sprint are limited. Losing sight is not the same as the prey ceasing to exist               |
| Abort                       | A hunter peels off a target that is too big, too far, or too well surrounded                                                                  | Giving up is a success, not a failed output                                                                       |
| Call, or don't              | An alarm moves neighbors. Another blob in the same trouble stays quiet and keeps the meal                                                     | Calling has a cost. Hearing is not obedience                                                                      |
| Pack, or loner              | Two hunters arrive on one prey inside the pack window, or a hunter deliberately does not share                                                | Kin and hunt-call are optional strategies, not a buff                                                             |
| Refuge                      | Under threat, prey stack into a rock ring or a cold margin and then leak back out to feed                                                     | Cover blocks rays. Cover is not free food                                                                         |
| Scavenge                    | A large herd carcass pulls a meat-eater and is skipped or risked by everyone else                                                             | Death has a location and a timer                                                                                  |
| Condition changes the walk  | A pregnant, cold, or starved blob takes a different path from its own earlier self                                                            | Body inputs are allowed to dominate the action. One output mapping for all states is a failure                    |
| Season changes the map      | Winter in a basin is slower, tighter, and nearer shelter; herds follow season-weighted fruiting patches as they move. Summer spreads          | Season and temperature are felt locally. A genome that is optimal in both without changing behavior is suspicious |
| Cross or stay               | Some lineages and herds use the wall gaps; others never do, and a drought kills them for it                                                   | The basins are real isolation, not decoration                                                                     |
| Parent spends               | A rich mother funds a larger child. A poor one waits or gives less                                                                            | `childShare` and the birth cap are life-history, not just numbers                                                 |
| Same spec, different custom | Two predator lines, one courser and one ambusher at the rocks                                                                                 | Archive and fitness must be able to keep both. A single "best hunter" score will delete one                       |
| Boom and bust               | A local population swells, strips a patch, crashes, and is recolonized; a herd grazes patches then moves on                                   | Caps and immigration must not smooth this into a flat line                                                        |
| Other blobs are the climate | Herds graze patches and leave carcasses and dung; blobs respond to the food landscape they create                                             | Herds remain environment, not brain-equipped agents or an added fitness reward                                    |
| Something unnamed           | A tactic no metric asked for, still obvious on screen                                                                                         | Do not add a reward for every scene above. Leave room for a strategy the score does not know                      |

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
high `fitnessV6` at death is a eulogy. It changes nothing unless that eulogy is copied back in as a birth. The archive
and the floor guard are breeders, not museums, for as long as they put bodies on the map. (The immigration pulse and predator rescue were deleted in the big bang.)

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

| Choice                                              | Keep                                          | Change                                                                                                              |
| --------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Split gate at 300 deliberate                        | The hard bar                                  | Also require deliberate share, and require the child to clear it. A total one lucky afternoon can hit is not a gene |
| Chance weighted at 0.25                             | A small door for scavengers                   | Do not let it move mate rank, birth energy, or archive rank. Chance may feed a body. It may not breed               |
| Mate ranked by energy                               | -                                             | Rank by skill the children can inherit, or by offspring that reached maturity. Energy is the luck tank              |
| Archive and immigration                             | A memory of what once worked                  | Immigrants enter poor and unproven, and they do not re-enter at all while the living are replacing themselves       |
| Diversity bonus for a rare niche                    | Two strategies that both replace themselves   | A rare failure is still a failure. Rarity is not fitness                                                            |
| Pack and family terms                               | Kin as a real sensed fact                     | Pay only what comes back as grandkids. Nearby kin are not a team                                                    |
| Predator rescue and the floor bypass (both deleted) | A world that can be recolonized by the living | Not a restock. Recolonizers are whoever survived next door                                                          |

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
- **Proof.** A `verified` metric that detects the scene (`docs/designs/metrics.md`), compared with `eval:compare` at
  the seed count the registry gives for it. A scene with no verified detector is shown by the clip, and the PR says so.
- **Detectors are encouraged.** Rewards (fitness or merit terms) for a scene are refused unless the scene is
  impossible otherwise, and then only for a fact the blob can sense.

This is how "if it only moves a number, it does not belong" and the `AGENTS.md` rule "a claim carries the
measurement" hold together: the number is a detector of a scene, never a payment for it. A detector reads the world;
a reward changes who breeds.

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
- An evaluation outcome (an eval, screen, ladder, probe, long run, training, drill or reflex run) becomes new tasks only
  through the practice in the `run-evolution-loop` skill ("Check the detector first" and "Outcome to task"): the
  detector is checked before the sim is blamed, the theory is checked against the rules above, and one that pays for an
  act is refused. The trainer's minimum evidence is in `docs/designs/training.md` ("From outcome to task").
- When something fails (a type dies out, a population collapses, a behaviour never emerges), first find how nature
  meets the same problem and build the fix from that mechanism, before tuning a number or adding a rescue (user,
  2026-10-30). The plan's Decisions row and the PR body name the biology. Example: predators that starve as beginners
  get a gorge-and-fast metabolism (a low resting burn, a larger fat store, a big meal per kill), as real carnivores do,
  not a restock.
- A realistic mechanism stays when it does no harm and costs little, even if its scene has not appeared (user,
  2026-11-06 and 2026-11-11). Harm is `npm run eval:compare -- --keep-rule` reading `WORSE` on 64 matched floor-on
  seeds: an exact paired test on the seeds with hunters alive and on the seeds that held their population, and an
  interval on each verified guard metric. The rule prints the smallest loss it could have seen; a guard that cannot see
  a loss of a quarter of the seeds has not shown no harm. Cost is harm too: a new brain input, or a step slower by more
  than its margin, needs a scene metric to move. A kept mechanism keeps its switch until the bundle it joins has been
  read once with it off, then the switch is deleted. A mechanism that harms, or that nature does not do, is deleted.
- The combined world is adopted when, on 64 matched seeds against the current defaults, no keep-rule guard is worse
  and the scene the change serves is better on a verified detector or in the clip (user, 2026-11-11). Raw counts
  against a fixed line are not a test: the defaults themselves fail 12 of 16 more often than they pass.
- The world is watched every week (user, 2026-11-20). The user watches the scene reel of the default world and of the
  current champions ([ambient-display.md](designs/ambient-display.md), "The scene reel"); what the user says becomes
  tasks in the plan that owns the scene. A behaviour change that has not been watched is not finished.
- A decision reads the headline metrics, one per scene ([metric-noise.md](designs/metric-noise.md) Phase 5). The other
  metrics explain a headline; they do not replace it.
