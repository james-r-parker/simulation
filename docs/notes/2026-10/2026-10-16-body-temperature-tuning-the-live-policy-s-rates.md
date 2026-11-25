### 2026-10-16 - Body temperature: tuning the live policy's rates

The live policy (`map-elites-v1q`) lived 17% shorter at the legacy rates (E12). Halving `temperatureGainMove` and
`temperatureLossPassive` (E15) cut that to -5.4%, just past the 5% rule, so the rates alone did not
close it. A sweep of seven candidates (A-G) on seeds 29-32 then softened the extremes:
`temperaturePassiveLossFactor` 4 to 2 with heat efficiencies 0.9 and 0.6 (candidate C, 16 seeds: fed lifespan -1.2%, food -2.9%, births +0.1%, none a verdict) and C with
`temperatureGainMove` 0.01 (candidate H: -1.9%, +1.9%, +3.5%, none a verdict). H is the default. A sitter and a
full-thrust agent still die (the scripted check ends with 0 agents at thrust 0 and at thrust 100, and 332 at thrust 20), while two softer
candidates (F and G) let thrust 100 survive and were dropped. Both C and H still read `worse` on `eval.floor_episodes`
(+11.1% and +9.5%) and on several fitness means and p90s, and `better` on coverage; these are recorded (E16, E17) and
were not part of the pass rule, which names only fed lifespan, food and births.
