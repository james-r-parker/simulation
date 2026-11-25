### 2026-10-17 - Alarm-call spam, and why call costs are 0.5

The first E20 run at the original Phase 1 defaults (`alarmCost` and `huntCallCost` 4) was worse than E17: fed lifespan
-17.4%, births -14.5%, `eval.floor_episodes` +44%. The cause was alarm-call spam: at a cost of 4 per call, agents that
fired the alarm output at every opportunity paid for it in energy. A 74-screen sweep of four seeds each chose `alarmCost` and `huntCallCost` 0.5 (calls stay
a real cost, not a tax on being alive), with `maxFood` 1600, `foodTargetPerAgent` 12 and `huntSizeRatio` 1.03. The choice
(d7) held at seeds 1-16 and at fresh seeds 17-32.
