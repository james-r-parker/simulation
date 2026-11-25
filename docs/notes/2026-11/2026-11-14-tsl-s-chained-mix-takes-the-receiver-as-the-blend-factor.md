### 2026-11-14 - TSL's chained `mix` takes the receiver as the blend factor (crisp-renderer)

In `three/tsl`, `a.mix(b, t)` is `mix(b, t, a)`: the node the method is called on is the factor, not the first colour.
`acc.rgb.mix(color, alpha)` therefore washed every fill towards pastel. Use the function form `mix(a, b, t)`.
