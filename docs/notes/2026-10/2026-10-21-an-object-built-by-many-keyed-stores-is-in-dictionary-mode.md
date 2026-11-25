### 2026-10-21 - An object built by many keyed stores is in dictionary mode, and slow in every hot loop

`allocateWorld` (`js/sim/world.js`) added about 110 fields with `world[name] = ...` inside `allocRows`, and
`createIntentState` added 50 slot arrays the same way; V8 moves an object to dictionary ("slow") properties once keyed
stores pass a small limit, so every `world.x[slot]` in a hot loop was a hash lookup, field loads could not be folded, and
the cost grew with the number of distinct fields a loop touched. Check with `node --allow-natives-syntax -e` and
`%HasFastProperties(obj)`. Copying with a spread (`return { ...world }`) gives a fast object (`Object.assign({}, o)` and
`Object.fromEntries` do too; the prototype trick and a plain return do not). Fixed, the bench step at 500 agents fell
from 3.9 to 2.45 ms (frozen) and from 6.7 to 3.4 ms (all features on); the "all-on physics tripling" was this plus 76 more
`obstacleBounce` calls per agent from the basins rocks. `test/sim/world-shape.test.js` fails if the world or the intent
state falls back. Any new object that is filled by a loop of keyed stores and then read in a per-tick loop needs the same
copy; a one-off check is the `fast4`-style walk: from the world, observer and policy, report objects of more than 8 keys
whose `%HasFastProperties` is false (none were left after the fix).
