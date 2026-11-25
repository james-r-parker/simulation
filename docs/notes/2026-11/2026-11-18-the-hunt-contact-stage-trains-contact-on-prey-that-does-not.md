### 2026-11-18 - The `hunt-contact` stage trains contact on prey that does not run: theory 1 (training-stages T34)

E-TS-1's predator elites win a `prey-ahead` whose prey is inert (zero outputs) on 32 to 54 of 64 trials (the best elite of each
offset 0, 64 and 128; the second elite of offset 0 wins 5) and win 0 or 1 of 64 against the scripted fleer on the same bearings;
the `memoryless` reference wins 8 of 64 against the inert prey and 5 against the fleer. The gate reads `hunt`, not contact
(theory 1); contact is learned, and the one weak elite (offset 0, cell 6) is the only support for theory 2. In the stage world
20 to 29 of the 27 to 39 kills of a 20000-tick episode fall in the first 400 ticks, on prey that has not yet moved away, and almost
none after tick 5000. Method and numbers: `evals/decisions/E-TS-1/results.md` (T34), `contact-diagnostic.mjs`, `stage-kills.mjs`.
