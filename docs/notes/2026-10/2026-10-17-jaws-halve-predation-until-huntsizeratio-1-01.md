### 2026-10-17 - Jaws halve predation until `huntSizeRatio` 1.01

T8c's forward bite arc (`biteArc` PI / 4) cut `eval.predation_per_1k` to about half of the same economy without jaws
(0.00068 against 0.00135), because a hunter now has to face its prey. Lowering `huntSizeRatio` to 1.01 gave 0.00129 (96% of the reference) on the
same four seeds; 1.0 did not (0.00057). `huntSizeRatio` 1.01 is the default. The detail is in the Jaws entry above.
