### 2026-11-06 - Rewarded Hebbian learning does not teach hunters (E124)

Reward-gated Hebbian plasticity (`hebbianRate` 0.0001 scaled by a trace of kills, bites or meat) gave no within-lifetime
gain: conversion at ages 3000-3999 minus 1000-1999 was negative in all nine arms, and the shuffled-reward control scored
best (-0.005; reward arms -0.020 to -0.045, no plasticity -0.048). The trace is fed mostly by bites (9.6 per 1000 hunter
agent-ticks against 0.3 kills), and plasticity touches only the hidden-to-output block, so the channel is too weak and too
noisy to credit a kill. Competence in this world comes from inherited weights (the flip reflex), not lifetime learning.
