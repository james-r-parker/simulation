# E270 - effect share baseline at neutral numbers

`npm run eval -- --seeds 16 --ticks 200000 --policy live --workers 12` on `main` 7f404cdb (status-effects.md T12).
Each value is the share of agent-ticks with the effect on, over all bodies.

| Effect      | Share     |
| ----------- | --------- |
| `chilled`   | 0.199     |
| `wounded`   | 0.0149    |
| `shaken`    | 0.0039    |
| `panicked`  | 0.0032    |
| `hoarse`    | 0.0000005 |
| `rallied`   | 0         |
| `answered`  | 0         |
| `alert`     | 0         |
| `huddled`   | 0         |
| `staggered` | 0         |

`eval.rally_bite_share`, `eval.hunt_call_answer` and `eval.alarm_response` are null on every seed: no social effect is
raised while its strength is 0. Status-effects Phase 3 (T15 to T17) chooses the numbers that can move them.
