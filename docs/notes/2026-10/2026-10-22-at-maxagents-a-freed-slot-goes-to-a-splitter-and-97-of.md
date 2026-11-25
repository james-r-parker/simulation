### 2026-10-22 - At `maxAgents` a freed slot goes to a splitter, and 97% of pregnancies are lost

`giveBirth` is tried every tick by every agent above `splitMinEnergy`, so with 320 to 420 of 500 agents rich the event ring
takes about 350 capacity `BIRTH_BLOCKED` events per tick (3 to 4 million per 10000 ticks). A slot freed by `reap` is taken by
`splitAll` on the next tick unless a pregnancy happens to fall due that tick (`advancePregnancies` runs first); a pregnancy that
falls due at the cap is dropped, with the `mateCost` and 480 ticks spent. `eval.mating_share` at the cap is therefore about
0.01 whatever the mating rules are; a mating target needs a rule for the cap (a waiting pregnancy, or slots held back from
splits), tested at 0.14 and 0.20 on one seed. Any per-agent per-tick event at the cap multiplies by the population.
