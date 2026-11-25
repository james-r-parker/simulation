### 2026-10-17 - A policy that counts the observer's death rows must follow a drain

`map-elites-v1` numbers death-log rows from the start of the run (`deathsSeen`) and reads each row back by that index. The
worker empties the log after every stats message (`drainObserverLogs`) so a run that never ends does not grow it, which
would send the policy to the wrong row. The observer therefore counts the rows it has removed (`deathsDrained`) and the
policy subtracts that count. Any new policy that indexes the observer's `deaths` or `series` logs by a running count
needs the same offset.
