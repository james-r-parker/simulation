# E-TS-1m, first run: invalid

The first screen run of E-TS-1m (`evals/train-screens/food-behind.grid.json`) measured nothing and is discarded. E-TS-1m keeps its id for the rerun (`E-TS-1m-2`).

- The `nursery-scatter` and `turn-rung` arms (the latter trains its `forage-turn` rung on the scatter world) passed nothing on all 16 offsets. Every archive had coverage 0.002 and the same `qdScore` 5.822 across offsets, the gate drill readings were null (no champions) and every stage plateau-stalled at generation 30.
- Cause: the scatter world at 20 food items starved the population before the trainer's offer window (`OFFER_FROM_TICK` 10000 of a 60000-tick episode). No death was offered, so the archive stayed at its founders. The T66 smoke ran only 3000 ticks and missed it.
- Census (seed 1, 60000 ticks, base archive offset 0 generation 59 as founders; run beside the base nursery world): the 20-item world fell from 22 prey at tick 0 to 3 at tick 2000, 2 at tick 5000 and 0 at tick 10000, with 0 offers; at 30, 45 and 60 items the same episodes also reached 0 offers on most seeds, while 90 items matched or beat the base nursery's episodes-with-offers (seeds 3 to 8, 30000 ticks, fresh and generation-0 founders: episodes with offers base 5 of 12, 60 items 3, 90 items 6).
- The base arm's reuse worked on 16 of 16 offsets and stays valid.
- Fix: `nursery-scatter.json` uses `maxFood` and `initialFood` 90 (about 6.6 items in a forager's 300 px view, still a third behind on a uniform bearing), and `test/train-scatter.slow.test.js` now asserts a population and an offer after `OFFER_FROM_TICK` + 1000 ticks.
