### 2026-11-07 - Prey live in the food patches, the cover does not (habitat-cover.md, draft E-D-1)

Draft entry from the habitat-cover research stream; the coordinator assigns the real experiment id.

On the default floor-on world (`map-elites-v6`, seeds 1 to 4, 20,000 ticks, non-hunting agents sampled every 200 ticks
over the second half) the median prey stands 1,953 to 2,667 px from the nearest ring edge, 1.1 to 5.2% of samples are
within 300 px of one (the flight of a prey) and 2.2 to 12.6% within 600 px, and 0 to 0.5% are inside. Meanwhile 28 to 45%
of samples are inside a food patch disc, which covers about 7% of the map, and the median prey is 448 to 722 px from a
patch centre. So prey are tied to the patches and the rings, drawn at random from the `obstacles` stream in
`placeRefuges`, are not. Cover on the patch rims would be within a flight of the prey that feed there. The script is a
throwaway: it steps a `createWorld` world with the live policy and measures positions, no sim change.

Nature: flight initiation distance rises with the distance to refuge (Dill and Houtman 1989, gray squirrel; Bonenfant and
Kramer 1996, woodchuck, 0 to 25 m from the burrow), the flight decision trades food against capture risk (Ydenberg and Dill
1986; Stankowich and Blumstein 2005) and foragers feed near cover (Kotler 1984; Brown 1988; Lima and Dill 1990). The first
two were checked against their abstracts; the rest are cited from memory and need a full read before they go anywhere
else.
