### 2026-10-16 - Food is visible and a sensible forager thrives

On the reachable-births defaults (seed 2, tick 3000, baseline-v5 brains): 68% of agents have food within their
specialisation's `visionRange` (1.65 items on average), and 52% see food on at least one of their 16 rays, so about three
quarters of in-range food is seen despite rays 22.5 degrees apart (about 120 px apart at 300 px, against a 40 px food
item). The median distance to the nearest food is about 250 px. With the floor and immigration off, the scripted
`foodSeeker` grows from 100 agents to 213 (thrust 0.4) or 324 (thrust 0.25) in 20000 ticks, but dies out by tick 7200
at thrust 0.6 or 1: the world rewards steering to food at a moderate speed and punishes rushing. Evolved
`map-elites-v1` populations stay near the floor of 100, so the gap is in what evolution finds, not in the economy.
