### 2026-10-22 - Carcasses are food items: they fill `maxFood` and the food target

`leaveCarcass` writes the meat into the lowest free food slot, so a carcass raises `foodCount` like any item. Under the
population rule a death-heavy stretch therefore lowers the plant spawn (`target - food` shrinks and `maxFood - food` caps
the count), and when the pool is full `leaveCarcass` leaves no carcass and draws nothing. The area rule
(`foodAreaCapacity`) has no population term, but `spawnFood` still stops at `maxFood - foodCount`. Read `foodKind` when
counting plant food; `foodCount` and the snapshot's food count include meat.
