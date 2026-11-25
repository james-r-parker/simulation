### 2026-11-07 - parental provisioning deleted (realistic-keepers T20)

`provisionEnabled` (a hunter hands `provisionShare` of a stored meal to its young in range) failed the keep rule in `E134`
on 16 floor-on seeds: hunters alive 10/16 against the defaults' 14/16, 9 seeds ended under 80 agents (defaults 7) and
`eval.prey_types_at_end` was worse. It was deleted with `provision.js`, `provision-state.js`, `eval.provisioned_energy_share`,
the three keys (`provisionEnabled`, `provisionShare`, `provisionRange`), the invariant and the `Provisioned` log emitter.
The `PROVISIONED` event code (32) stays in `events.js` unused so later codes do not renumber. The juvenile dependency, which
keeps the kin-floor half of the reflex, stays.
