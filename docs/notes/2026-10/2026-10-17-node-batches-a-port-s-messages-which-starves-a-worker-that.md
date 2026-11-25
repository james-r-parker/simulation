### 2026-10-17 - Node batches a port's messages, which starves a worker that yields through `MessageChannel`

A `MessageChannel` slice loop (the shell `sim-worker.js` posts the next slice to itself while ticks are owed) never lets
`parentPort` messages through when run in a Node `worker_threads` worker: Node handles up to 1000 messages of one port in a
single loop turn, including ones posted while it handles them, so at a speed the sim cannot sustain no `returnBuffer`,
`pause` or `reset` is read for as long as the backlog lasts. Browsers deliver each message as its own task, so the page is
not affected; a Node harness around the shell must replace `MessageChannel` with `setImmediate`.
