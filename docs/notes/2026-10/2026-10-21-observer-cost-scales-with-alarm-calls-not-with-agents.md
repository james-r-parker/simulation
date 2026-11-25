### 2026-10-21 - Observer cost scales with alarm calls, not with agents

About 4.7 alarm calls land per tick in the frozen bench world (100 hunters among 500 agents, 3.8 with every feature on).
The follow-up used to do O(agents) work in each call (refill band, genome and speed; a hunters-by-agents distance scan
once per tick), so its cost depended on how often evolved agents call. It now fills one snapshot per tick that all the
tick's calls share, and a call adds only its role row. When a future observer feature does per-event work over every
slot, share what does not depend on the event across the tick's events first. A sorted-x scan seeded with each agent's
nearest hunter of the last call is exact (`dx * dx <= dx * dx + dy * dy` holds in floating point) and cheaper than the
all-pairs scan (the combat part 0.091 to 0.069 ms per tick); a uniform grid of the hunters was no faster than all-pairs in a 14400 x 8100 world
(hunters cluster, so rings of empty cells are searched), and was dropped.
