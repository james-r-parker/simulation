### 2026-10-22 - Five evals at once with default workers oversubscribe the host

`npm run eval` defaults `--workers` to `os.availableParallelism()` (32 here), so one eval fills the machine. Five started
together at the defaults pushed the load average to 86 on 32 cores, and every run slowed. Give each concurrent eval a share of
the cores (`--workers`), or run the arms as one `npm run screen` grid, which shares one worker pool (`--workers <total>`) under
one `flock` on the CPU lock. A bench taken while another eval runs measures the host, not the sim.
