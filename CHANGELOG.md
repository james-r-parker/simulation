# Changelog

## [11.0.0](https://github.com/james-r-parker/simulation/compare/v10.1.0...v11.0.0) (2026-11-21)


### ⚠ BREAKING CHANGES

* **sim:** three config keys join rulesHash, which moves from 932adb808ad9fb65 to 5ea8af3e744bdb8f; season 12 (unreleased) moves in place.
* **sim:** the rules hash of the defaults moves (scout keys removed, the non-hunter body defaults added). Season 12's rulesHash is moved in place in library/seasons.json (6f15ef05d2f2408a to e565bb55070b2378); season 12 is unreleased, so no new season.
* **sim:** the rules hash of the defaults changes (foodSpawnRate removed).
* **sim:** hoarseCost leaves and hoarseFactor joins rulesHash, which moves from 08ca9e3fcb28d4ad to aca43db0dc6cb1ae; season 12 (unreleased) moves in place.
* **sim:** eight config keys join rulesHash, which moves from 42810177414870f3 to e2a602d8d06669c5; season 12 (unreleased) moves in place.
* **sim:** ten config keys join rulesHash, which moves from b2cc531f562eb08f to 42810177414870f3; season 12 (unreleased) moves in place.
* **sim:** seven config keys join rulesHash, which moves from de689f375a7187ac to b2cc531f562eb08f; season 12 (unreleased) moves in place.
* **evo:** rulesHash changes from 8ef02908a0020680 to de689f375a7187ac; champions and archives bred before this commit do not load.
* **sim:** rulesHash changes from 803dedf939a0c1df to 8ef02908a0020680; champions and archives of season 12 rules before this commit do not load.
* **sim:** the brain layout is pooled-v6 (106 inputs, 5524 weights at 32 hidden); pooled-v5 genomes, archives and champion files are refused at load.
* **sim:** rulesHash changes from c15b0d2869de5a5d to 803dedf939a0c1df; champions and archives of season 11 do not load under season 12 rules.

### Features

* **app:** a calm camera - fewer cuts, zoom out, pan, zoom in ([ca7bee9](https://github.com/james-r-parker/simulation/commit/ca7bee943ebdc884bc8d78d7b4dc985b9ceee404))
* **app:** add the calm camera move, zoom out then pan then zoom in ([595a9e8](https://github.com/james-r-parker/simulation/commit/595a9e894ae1b933dd11371c059d191f3f3e3589))
* **app:** add the Reel tab to the insights drawer ([b005ddc](https://github.com/james-r-parker/simulation/commit/b005ddcd239e72748dab18d51f741ea305d3d7fe))
* **app:** add the scene reel and npm run reel ([8229995](https://github.com/james-r-parker/simulation/commit/8229995efc9d0bc7264d6d4bad83b9ac90cada47))
* **app:** add the scene reel's ring, moments and rolling recorder ([85d294d](https://github.com/james-r-parker/simulation/commit/85d294d21d74c716a2d54702e7bf2753f24f6920))
* **app:** director:dry reads the shortest shot, bar shots per hour at 20 to 60 ([ffcd468](https://github.com/james-r-parker/simulation/commit/ffcd468f3b09cb39202ba070a396f354d3b4fd1d))
* **app:** drive the director's glide, pullback and wide framing by the calm move ([2e75389](https://github.com/james-r-parker/simulation/commit/2e75389174ef70889bc704c9ec9955b4c2ac227e))
* **app:** ease a follow handoff with the calm move ([6de2e68](https://github.com/james-r-parker/simulation/commit/6de2e681fbddd99959ad4b305f32b49345e430f3))
* **app:** every reading one key away - the insights drawer and board ([818ff90](https://github.com/james-r-parker/simulation/commit/818ff9018960e4866e00124d4b1215edd3eb1fdb))
* **app:** fewer, longer shots with a 30 s minimum hold ([f076a2d](https://github.com/james-r-parker/simulation/commit/f076a2d9f688fb2513386a5477da2683bb9b95d5))
* **app:** frame a moment less tight, at most four times the home zoom ([d4c362b](https://github.com/james-r-parker/simulation/commit/d4c362b880ce665fbb8e4672e834d763920d7b19))
* **app:** Shift+D and ?board=1 show the insights as a full-screen board ([bb8d4c4](https://github.com/james-r-parker/simulation/commit/bb8d4c4f145d369193b2451ebe3d25277ee76d5b))
* **app:** show each visible effect in the inspector, and read pregnancy from its effect (status-effects T5) ([316de41](https://github.com/james-r-parker/simulation/commit/316de41fbc9040463d3fb4c894b41a34a9348c0d))
* **app:** show the trait ratios and body sense of a followed agent (body-genes T9a) ([246c864](https://github.com/james-r-parker/simulation/commit/246c86457640029001c1ef521065fc90ade6d5dc))
* **app:** the Export tab downloads the tables as CSV and copies the replay command ([bc0d3a0](https://github.com/james-r-parker/simulation/commit/bc0d3a01f88b840706744f97b3821f31fb8a0eab))
* **app:** the insights entries live in the overflow menu, and a smoke spec covers them ([158c881](https://github.com/james-r-parker/simulation/commit/158c881cb1ec7e5b1942c9fd6bf281b3af6c7b72))
* **evals:** experiment ledger as one file per record, with kinds, outcomes and the experiment command ([83950c6](https://github.com/james-r-parker/simulation/commit/83950c648b55a140a505385e07adf43199c46d20))
* **evals:** fail a cited experiment id with no record and a compare with no verdicts ([06f3916](https://github.com/james-r-parker/simulation/commit/06f39162319391ec987e669c8dc49b9d985d47c4))
* **evals:** split the experiment ledger into one file per record ([92cfab3](https://github.com/james-r-parker/simulation/commit/92cfab3cf3d45fe638a21e0c3f0b126bfdbf6348))
* **evals:** type every experiment record and backfill from E151 ([0df219b](https://github.com/james-r-parker/simulation/commit/0df219bbf2767db92fed0c4cdf4e8922bc06cb8f))
* **evo:** a reflex case for each role (brain-reflex-tests T20, T21) ([8c9d0e6](https://github.com/james-r-parker/simulation/commit/8c9d0e6e02b084391003c576317c5f5dd61c0268))
* **evo:** a reflex case for each role (brain-reflex-tests T21) ([79cee34](https://github.com/james-r-parker/simulation/commit/79cee34f719b2336d1c55f3d04feebd3899fe727))
* **evo:** add the gene spread and edge share detectors (body-genes T9) ([1d89455](https://github.com/james-r-parker/simulation/commit/1d894550686a1b2921268121d46d905398cd64e7))
* **evo:** add the hunter-choice detectors (body-genes T22) ([0a16ac3](https://github.com/james-r-parker/simulation/commit/0a16ac37a6d1dc9c1950da4e05925b028e58880e))
* **evo:** add the status-effect detectors and their thirteen metrics (status-effects T12) ([d0cd27f](https://github.com/james-r-parker/simulation/commit/d0cd27f76a8548acb15cf455b823ee2f55278bf6))
* **evo:** E-RB-4, the Phase 4 readings and the plan as built (role-budget T19) ([50e2e6d](https://github.com/james-r-parker/simulation/commit/50e2e6dec00b676b3048ab6d1104b283fa265001))
* **evo:** E-RB-5, the herd readings and the plan as built (role-budget T22) ([e73f527](https://github.com/james-r-parker/simulation/commit/e73f527e0b5b2dd3b6908d6976307cfaa879cb19))
* **evo:** gene spread metrics, the layout keep-rule read and the bench baseline (body-genes T9, T36, T37) ([9188757](https://github.com/james-r-parker/simulation/commit/918875783cb9e07ade71eb19cb4cee332c32d262))
* **evo:** inherit the trait genes through the registry (body-genes T33) ([c8fed50](https://github.com/james-r-parker/simulation/commit/c8fed50f6df14851f64b546894462fea506c0a8f))
* **evo:** read the defender row in a guard posture ([47e4ef2](https://github.com/james-r-parker/simulation/commit/47e4ef2f7710f79e9ffde1efdc41ca6d9d0612ea))
* **evo:** reflex bars derived from the herd and warn rows (brain-reflex-tests T22) ([dbb574b](https://github.com/james-r-parker/simulation/commit/dbb574b6e549f167a7470306029c3a358009d96e))
* **evo:** reflex bars from the role budget (brain-reflex-tests T22) ([4ee6d06](https://github.com/james-r-parker/simulation/commit/4ee6d0632fb6666efbbdf2bb83ab71eaff6ef585))
* **evo:** reflex bars from the role budget (brain-reflex-tests T22) ([a05fa2e](https://github.com/james-r-parker/simulation/commit/a05fa2ef82b6646f2ed6490522c88aa8c259db3c))
* **evo:** role drills clear-herd and make-a-living, and warn-herd's control trial (training-loop T34) ([41c636b](https://github.com/james-r-parker/simulation/commit/41c636b60575aae2099da40c3dc562cc88efcbe4))
* **evo:** role drills defend-caller and warn-herd (training-loop T34, part 1) ([42168bf](https://github.com/james-r-parker/simulation/commit/42168bf6a773fc6fcbac454ba0a3fcc040295be5))
* **evo:** role drills defend-caller and warn-herd (training-loop T34, part 1) ([1658960](https://github.com/james-r-parker/simulation/commit/1658960cd0625a2d4b7b56fbf5fb62826aa3797d))
* **evo:** role tags and eval:compare --role, predator metrics against a planted chase ([1574f8a](https://github.com/james-r-parker/simulation/commit/1574f8a9480487307337a3ec5b9d870b43a013a2))
* **evo:** ROLE_DRILLS holds the four role drills; validity names a scene easier than its row (training-loop T34 built) ([11e3bad](https://github.com/james-r-parker/simulation/commit/11e3badce4cb2ee6477184e24ae772730a7c9f9b))
* **evo:** tag each role's metrics in the registry and add eval:compare --role ([4c590a2](https://github.com/james-r-parker/simulation/commit/4c590a2caa4f21caaa7526db00334cac28ba99ee))
* **evo:** the average and best hunter rows and the target choice (role-budget T4a) ([6c9acde](https://github.com/james-r-parker/simulation/commit/6c9acde9535c3add7bcb123c07d3dd092a768e38))
* **evo:** the body-sense and call reflex cases (brain-reflex-tests T21a) ([f0f8290](https://github.com/james-r-parker/simulation/commit/f0f8290bfb93537a672cc2df6d761d89d515e70f))
* **evo:** the budget matrix and the one-setting search (role-budget T4) ([e1aa149](https://github.com/james-r-parker/simulation/commit/e1aa14968e45878f3d45086bb05bd123127aea75))
* **evo:** the chase timeline, the prey bounds and the delay bisection (role-budget T3) ([15f9a53](https://github.com/james-r-parker/simulation/commit/15f9a53a6ba94cf32d80f3c4f013fb1279160a4c))
* **evo:** the clear-herd drills, a genome in the body's seat of playStampede (training-loop T34) ([2539367](https://github.com/james-r-parker/simulation/commit/2539367a6a2f50319b91bd52ff3d6f9ace7ece1f))
* **evo:** the defence and smoke scenes in the real sim, and --check for the defender (role-budget T11) ([356e389](https://github.com/james-r-parker/simulation/commit/356e3895bc8187f8cb941381f390d3d6d74a5972))
* **evo:** the defender's budget, hear, turn, run and intercept (role-budget T9) ([90511c0](https://github.com/james-r-parker/simulation/commit/90511c01891874bd64eb36bd1b0d824a34b69de9))
* **evo:** the detector and oracle normalisers read the body lanes (body-genes T51) ([a6916c9](https://github.com/james-r-parker/simulation/commit/a6916c9e055478eb16dbbb3a38f244b94dd801fd))
* **evo:** the first-meal rows of the role budget (role-budget T17b) ([aba2891](https://github.com/james-r-parker/simulation/commit/aba2891cbc7dd7d4aa86a330fb3db9ccdc8fd654))
* **evo:** the forager and reproducer rows of the role budget (role-budget T17) ([95e3f4b](https://github.com/james-r-parker/simulation/commit/95e3f4b980db77eaf6b8100273ec637fb7920bcf))
* **evo:** the herd rows of the role budget (role-budget T21) ([04542c1](https://github.com/james-r-parker/simulation/commit/04542c198a4f43287ed29b62238d6dbfcbdb24ab))
* **evo:** the hunter's living row of the role budget (role-budget T17a) ([ae5d2c7](https://github.com/james-r-parker/simulation/commit/ae5d2c76e28504fe05f7b86b6e39aa43ba19bc5c))
* **evo:** the make-a-living drill, a genome in the hunter's seat of playLiving (training-loop T34) ([008e014](https://github.com/james-r-parker/simulation/commit/008e014f26426cbd4a2f2db4809bc41f74316919))
* **evo:** the performer tiers and the learn slope of the hunter budget (role-budget T3a) ([5c1a1dc](https://github.com/james-r-parker/simulation/commit/5c1a1dc469812d3290c5d1bce5817d418806199a))
* **evo:** the Phase 4 scenes and cross-check of the role budget (role-budget T18) ([05b538b](https://github.com/james-r-parker/simulation/commit/05b538bb8396d96ee95d327bfe55f83236bcf4a4))
* **evo:** the role budget calculator, the hunter and the search (role-budget Phase 1) ([2ddb032](https://github.com/james-r-parker/simulation/commit/2ddb0328aa22c5c848168b9d2e7f755d85aa3b71))
* **evo:** the role budget reads effects, and the pack row (status-effects T13) ([7f404cd](https://github.com/james-r-parker/simulation/commit/7f404cdb3bb8ea6c7db68654b020978cfee3fd52))
* **evo:** the role budget reads effects, and the pack row (status-effects T13) ([38407ec](https://github.com/james-r-parker/simulation/commit/38407ecb0ecb0e7dd31a0584344bc02520139ebe))
* **evo:** the role budget reads the trait corners (body-genes Phase 2, T10) ([e2ac2b7](https://github.com/james-r-parker/simulation/commit/e2ac2b723c5c5063b162311df05b5a44f0b8c0a6))
* **evo:** the role budget reads the trait corners (body-genes Phase 2) ([8c57cb4](https://github.com/james-r-parker/simulation/commit/8c57cb4c2a16f3f792cc86fb3a31d20ddeb493dc))
* **evo:** the role budget, the defender (role-budget Phase 2) ([7a87584](https://github.com/james-r-parker/simulation/commit/7a87584998f85f7473914ff87e419dfbef1166af))
* **evo:** the role budget, the forager and the reproducer (role-budget Phase 4) ([5106049](https://github.com/james-r-parker/simulation/commit/51060493df24e82f13033a50c6de6e4d6c9bbb96))
* **evo:** the role budget, the herd (role-budget Phase 5) ([d0aecd5](https://github.com/james-r-parker/simulation/commit/d0aecd5921d7ff154a0dda7aa5271c9b837005dd))
* **evo:** the role budget, the scout (role-budget Phase 3) ([27955da](https://github.com/james-r-parker/simulation/commit/27955da28c569163a50df81266da92eb8d53600e))
* **evo:** the role budget's kinematics and senses, and the anchors that pin them (role-budget T2) ([ddf6113](https://github.com/james-r-parker/simulation/commit/ddf61138b253081ca92d9749bd5daf8a32dcca45))
* **evo:** the role budget's model options and body numbers (role-budget T1) ([88f1dea](https://github.com/james-r-parker/simulation/commit/88f1dea85bec52ea43c2f394b1a058d8b0013427))
* **evo:** the scout's budget, the row scout:predator (role-budget T14) ([38392a6](https://github.com/james-r-parker/simulation/commit/38392a62d54a2dc8bfc217b1949bf99a65a67b1a))
* **evo:** the scout's warning scene, the oracles that play it and E-RB-3 (role-budget T15) ([005597c](https://github.com/james-r-parker/simulation/commit/005597c707994a83317508b704bf5aa048d19663))
* **evo:** the sitter rows, the birth-energy search and the matrix rows of Phase 4 (role-budget T17c) ([3b21914](https://github.com/james-r-parker/simulation/commit/3b2191463c671cfc181a1cecfa8e9bf77ab38187))
* **evo:** the slow cross-check of the hunter budget against audit:chase, and --check with RoleBudgetDrift (role-budget T6) ([82bebf6](https://github.com/james-r-parker/simulation/commit/82bebf6b1ec08cb79a80bd13c9ca7622167c5e76))
* **evo:** the smoke cells, the shadow geometry and the defender's release (role-budget T10) ([e2b4623](https://github.com/james-r-parker/simulation/commit/e2b4623a459e026f7729715094b4bf0be9636abb))
* **evo:** the stampede scene and cross-check of the herd rows (role-budget T22) ([c37010c](https://github.com/james-r-parker/simulation/commit/c37010ccd6c87bd51d339043e07064f30b28cc90))
* **evo:** warn-herd opens with a quiet field, so a scout that always calls loses ([14939d3](https://github.com/james-r-parker/simulation/commit/14939d3c61299b9c8f0c13fc4769f81c4ee4ae83))
* hunter-choice metrics, trait inspector and trait table (body-genes T22, T9a, T34, T35) ([0c8aa65](https://github.com/james-r-parker/simulation/commit/0c8aa65db9bee7c5b08482c841b8611d60553bb3))
* **role-budget:** read the defender row at an escort distance ([018154f](https://github.com/james-r-parker/simulation/commit/018154fa4106f797905ac096c6652515f63b5372))
* **scripts:** add experiment.mjs with new, list, tally and renumber ([737abf7](https://github.com/james-r-parker/simulation/commit/737abf70b4fd967bfee2de5928a80852e9c8caff))
* **scripts:** add npm run reel, the scene reel of a seed ([3ee6330](https://github.com/james-r-parker/simulation/commit/3ee63308635480c2e62ef1997b5e1bffcc9e6216))
* **scripts:** add npm run traits and the generated trait table (body-genes T34) ([fe1b02f](https://github.com/james-r-parker/simulation/commit/fe1b02f8b5237f07fe7da6719d2d9551c2c55041))
* **scripts:** merge main with generated files regenerated, and plan less merge churn ([ac2fff5](https://github.com/james-r-parker/simulation/commit/ac2fff5b1b42655f18faca011f0946acd74f1a10))
* **scripts:** merge main with generated files regenerated, and plan less merge churn ([89e180a](https://github.com/james-r-parker/simulation/commit/89e180acb65852db0053476f6ecea40053c33e59))
* **scripts:** npm run role:budget prints the hunter matrix, runs the search and reads the config (role-budget T5) ([e7b1890](https://github.com/james-r-parker/simulation/commit/e7b1890fee96027c2043b8aa99e126e2b0955816))
* **scripts:** read the experiment ledger through readLedger ([240508d](https://github.com/james-r-parker/simulation/commit/240508de3b86f99f7dfb3650d60ab54a8646d158))
* **scripts:** report records scope and run the docs gate plus ledger checks for it ([0ec0e87](https://github.com/james-r-parker/simulation/commit/0ec0e879ee0f9f6f1afabaf0a6ac503882691f7b))
* **scripts:** report records scope; review agent-workflow phases 3 and 4 ([e002513](https://github.com/james-r-parker/simulation/commit/e00251370183abe02cb735381deebba7c23d8912))
* **sim:** add the chilled, wounded, panicked and shaken effects at 0 (status-effects T9) ([e377eee](https://github.com/james-r-parker/simulation/commit/e377eee1bfe83d1ba99ff8ddbe144ccdf78fe5af))
* **sim:** add the effect registry, its readers and appliers (status-effects T1) ([b19cb1f](https://github.com/james-r-parker/simulation/commit/b19cb1fbaeed2b47a653e6f967e6e875baa49d9c))
* **sim:** add the hearing, nose and smoke-sight cost keys (body-genes T46) ([2465cb1](https://github.com/james-r-parker/simulation/commit/2465cb1a73fa2fd42e3c5ac27ccc8ee6fe822b20))
* **sim:** add the lane catalogue, the spec body map and world.lanes (body-genes T2) ([0cba36a](https://github.com/james-r-parker/simulation/commit/0cba36a922e5e6739fd07223bb6a276f77174b94))
* **sim:** add the paired cost keys of the body traits (body-genes T13) ([eda3993](https://github.com/james-r-parker/simulation/commit/eda3993b8cbfca6d0de33d8a579cb3a80f6f2fbf))
* **sim:** add the rallied, answered and hoarse effects at 0 (status-effects T10) ([cec2cb7](https://github.com/james-r-parker/simulation/commit/cec2cb7d9796a09fe527722068138d1888d5363b))
* **sim:** add the trait registry, the gene menu and applyTraits (body-genes T32) ([4eee47e](https://github.com/james-r-parker/simulation/commit/4eee47ee48a5c2d26da0c4bad0d28dbb7c61ca59))
* **sim:** declare the stored effect rows in agentSpecs (status-effects review) ([4f625d1](https://github.com/james-r-parker/simulation/commit/4f625d134de95f4d072ceae46cf251470161467b))
* **sim:** grade the sprint by its effort with the sprint store on (fair-chase T7a) ([355e6c4](https://github.com/james-r-parker/simulation/commit/355e6c4d84f93dcd6255040983e97c8c079c5709))
* **sim:** hash the rest timer in the world hash ([aeae6a2](https://github.com/james-r-parker/simulation/commit/aeae6a24aa1d86793342b73bfaedb350e277fecf))
* **sim:** hoarse prices a wasted call, and each stack multiplies the next cost (status-effects T10, user 2026-11-21) ([3f9b1ed](https://github.com/james-r-parker/simulation/commit/3f9b1ed2771897426042e0f1489476afcab7a710))
* **sim:** move the body modifiers into the effect registry (status-effects T2) ([5e221ae](https://github.com/james-r-parker/simulation/commit/5e221ae3cf959ffcf1a9102df2a2f4096e880390))
* **sim:** move the brain layout to pooled-v6 as a skeleton (body-genes T7) ([a132d1d](https://github.com/james-r-parker/simulation/commit/a132d1d90215bdef6a581df95bfede4727b49f9f))
* **sim:** move the feeding modifiers into the effect registry (status-effects T3) ([1febd14](https://github.com/james-r-parker/simulation/commit/1febd146d709193e0580d33d9aa48c474dd54356))
* **sim:** move the life and signal rules into the effect registry (status-effects T4) ([234be49](https://github.com/james-r-parker/simulation/commit/234be495b42e468714db50ac6091fbfad73d34a4))
* **sim:** pool the size, speed and closing of the prey and threat hits and the view shares (body-genes T31) ([fa21caf](https://github.com/james-r-parker/simulation/commit/fa21cafc4deb80e41e308c41628d41b2bda266fa))
* **sim:** read the first body lanes in place of the config keys and spec tables (body-genes T3) ([46b5877](https://github.com/james-r-parker/simulation/commit/46b587703c6ead910fbd0410b1e312881d036864))
* **sim:** read the hearing, nose and smoke-sight lanes (body-genes T13a) ([09bdd8f](https://github.com/james-r-parker/simulation/commit/09bdd8f50581f8ba1842f438ad88393a69f3d966))
* **sim:** read the size, vision and child-share traits through the registry (body-genes T8) ([38b7c1e](https://github.com/james-r-parker/simulation/commit/38b7c1e771e5b66014e18568a95b7563518ea247))
* **sim:** the effect registry and every within-life modifier of today (status-effects Phase 1) ([42a03ad](https://github.com/james-r-parker/simulation/commit/42a03ad5f083434c739e00cee25ff21e83967821))
* **sim:** write the size, speed and closing of an agent hit to the ray lanes (body-genes T30) ([8b00e59](https://github.com/james-r-parker/simulation/commit/8b00e594af6e9f7d77d693112a848c4f9f65c044))


### Bug Fixes

* **app:** a reel link whose config does not parse fails loudly ([cc1750e](https://github.com/james-r-parker/simulation/commit/cc1750e6413d6a732785dbf78af43e07818ad8fb))
* **app:** install window.__reel only with reel=1 ([76bcf80](https://github.com/james-r-parker/simulation/commit/76bcf803045e6a4c3eb92b14b1223db92f9b65c0))
* **app:** keep the follow handoff caption up through the calm move ([f3c316b](https://github.com/james-r-parker/simulation/commit/f3c316b4d6649dbb1ee484168d833b8ba275eb21))
* **evo:** charge a hunter's chase by its outcome, and end a failed one where the sim gives up ([30a6a32](https://github.com/james-r-parker/simulation/commit/30a6a3292c988c215b037765671309b4fb6d510f))
* **evo:** charge strikeMissCost and read the size gate per bite in the chase timeline (role-budget T3) ([7988e7a](https://github.com/james-r-parker/simulation/commit/7988e7a3dc14896688170968f6403b801fb0f53b))
* **evo:** check the shove's first tick, breaksBite, prevented and the kill tick against the sim ([4d233ee](https://github.com/james-r-parker/simulation/commit/4d233ee4d8d9084fc6c289035c449fed86633ca8))
* **evo:** cross-check the net energy per kill and the catch share per bearing (role-budget T4) ([1793c31](https://github.com/james-r-parker/simulation/commit/1793c31fa20b94be14869c215fd3168a8acf5f65))
* **evo:** follow the T44 key and lane reads in the merged thrive and defender fixtures (body-genes Phase 5 T44) ([97d7e1e](https://github.com/james-r-parker/simulation/commit/97d7e1eca7640b10f7ecfde41b31e7b748db003f))
* **evo:** give make-a-living the whole predator:living row as its bar ([4d2388f](https://github.com/james-r-parker/simulation/commit/4d2388fcb6989f50f35146d70e1b1e90dddc22fe))
* **evo:** herd_dodge_share counts a trample the body lives through as a hit (metric-noise T21, T22) ([297f828](https://github.com/james-r-parker/simulation/commit/297f828a8045271864f970a5c6b6e0faf3a68fa7))
* **evo:** make the perfect tier a true upper bound by sweeping the sprint effort (role-budget T3a, T7) ([2791c44](https://github.com/james-r-parker/simulation/commit/2791c44b8c40c2af464c50b4b3a548b885b0b3dd))
* **evo:** model the defender's stop in the smoke geometry, and play the walk against the sim ([be511ed](https://github.com/james-r-parker/simulation/commit/be511ed158a8d9c6c59afd5c2c228b46d3be8062))
* **evo:** read the temperature and sprint store through the lane-based sim after body-genes part two ([7e41a92](https://github.com/james-r-parker/simulation/commit/7e41a9293a687da9ce04fadda5e7f0e77775756e))
* **evo:** the defender reads the size gate per bite and the perfect tier through the shared helpers ([5a087f5](https://github.com/james-r-parker/simulation/commit/5a087f5dfba95fd160e124ae94d9b858aba82a95))
* **evo:** the hunter sprints from the forager's first move, and the warn sign check is two-sided at effort 1 ([7d19068](https://github.com/james-r-parker/simulation/commit/7d19068406631edcd526389950022973d890c79a))
* **evo:** the input reader flees a hunter off every threat ray and breaks across its line ([41cc44b](https://github.com/james-r-parker/simulation/commit/41cc44b96e78c31cf7c052b45c746f6d432b100b))
* **evo:** the input reader flees a hunter off every threat ray and breaks across its line ([18e42fa](https://github.com/james-r-parker/simulation/commit/18e42fa03bcfa2b21f3c5eb5922e90100170f70a))
* **evo:** the plain brain mutates trait genes through the registry step and clamp ([343f444](https://github.com/james-r-parker/simulation/commit/343f444121668178fea67b0659d701b52c1fb0de))
* **evo:** the predator's herd row is n/a, the herd turns from a hunter (role-budget T22) ([6fa1738](https://github.com/james-r-parker/simulation/commit/6fa17382e1dc868a2c9b775355ec1b731e9dbf7e))
* **evo:** type the shared fields of the gene spread registry entries ([64a1022](https://github.com/james-r-parker/simulation/commit/64a10226abab2ad3f357554c0008c8f168c15617))
* **herds:** a startled herd's centroid follows the herd ([67f8130](https://github.com/james-r-parker/simulation/commit/67f81305a0968b5f5c056cff058a9a189aa7e822))
* **herds:** a startled herd's centroid follows the herd ([9dcc8fe](https://github.com/james-r-parker/simulation/commit/9dcc8fe9823db2c1e839537bdacfc442ddf3d1fb))
* **scripts:** renumber refuses another lane's record and a taken decisions directory ([ff397e8](https://github.com/james-r-parker/simulation/commit/ff397e8c07db3c8521dbbb5411d197ce4425e27a))
* **ship:** wait for the checks to register before watching them ([23e8cc6](https://github.com/james-r-parker/simulation/commit/23e8cc66ad8b2701bdd19889dd8f908eaf1aae22))
* **ship:** wait for the checks to register before watching them ([d05ef83](https://github.com/james-r-parker/simulation/commit/d05ef8378f510dd925567e9a141b1713fd5f174f))
* **sim:** accept a spec body override of baseSize and childEnergyShare ([efc1e0d](https://github.com/james-r-parker/simulation/commit/efc1e0dd9803b7dd383b888817bd8a5b576da472))
* **sim:** count a heard call once, on the tick it starts ([c5b2463](https://github.com/james-r-parker/simulation/commit/c5b2463a5c9fb8c371c2972030f4cd85431c3f10))
* **sim:** make the effect path allocation-free by construction (status-effects review) ([0e0559b](https://github.com/james-r-parker/simulation/commit/0e0559b21885ce90e0c031d09c099905fd8572ce))
* **sim:** read the world's lane rules without a fallback, and type the rule tests ([511f3db](https://github.com/james-r-parker/simulation/commit/511f3db4f9ed628c9ec9144d5e72787ada81e7bf))
* **sim:** refuse a smokeRadius and smokeTicks body override until the cloud reads a lane ([d83260b](https://github.com/james-r-parker/simulation/commit/d83260b36e1f9482190b45428386084583d22524))
* **sim:** refuse canHunt true on a body whose hunter costs are 0 ([825ba9a](https://github.com/james-r-parker/simulation/commit/825ba9a23df544acb35772d3b29e9a6c3ee47757))
* **sim:** the jaws arc reads the biter's biteArc lane ([772fa0b](https://github.com/james-r-parker/simulation/commit/772fa0b515f53ee05036a52a1d0b0fef97e58956))
* **train:** stage drills carry the stage's sprint-store rules ([3c6f122](https://github.com/james-r-parker/simulation/commit/3c6f12252abc5297aff534a20d210e0c66ffa0e2))


### Performance Improvements

* **bench:** time the effect readers alone (status-effects T23) ([0181373](https://github.com/james-r-parker/simulation/commit/0181373a3dc70cba2c1c07c38affc964b204a8f8))
* **sim:** alertGrazingLevel reads a constant stored row ([58fd5d9](https://github.com/james-r-parker/simulation/commit/58fd5d92938f1c43e9e94994a8b823df12dac5a0))
* **sim:** dispatch effect levels through a generated switch (status-effects T26) ([6f6670e](https://github.com/james-r-parker/simulation/commit/6f6670ea3fe100affa2e0f7cbb2732a864cb3505))
* **sim:** fold each effect group's lanes in one pass (status-effects T30) ([e6787ac](https://github.com/james-r-parker/simulation/commit/e6787acefd7f6a9a599b77decd6432d4c1cc145d))
* **sim:** fold only the rules whose strength is on ([11e7f0c](https://github.com/james-r-parker/simulation/commit/11e7f0cc232b02c12962c68fa31162d17ee35316))
* **sim:** fold the two heat lanes of stepTemperature as a group (status-effects T30) ([00dbbe3](https://github.com/james-r-parker/simulation/commit/00dbbe3a5d65097212a9ea20b02ceabfa396e831))
* **sim:** leave a lane's all-1 tables out of the fold too (status-effects T25) ([1a09900](https://github.com/james-r-parker/simulation/commit/1a09900bd83df33d13b0e0a4657b20cb874f750c))
* **sim:** memoise a slot's effect levels by epoch, not by clearing a row ([148e3d4](https://github.com/james-r-parker/simulation/commit/148e3d4ff0b43f70166e6f50c37413dd5b360a30))
* **sim:** raise effect stacks without a record per call ([86856e1](https://github.com/james-r-parker/simulation/commit/86856e10a72c7560b9eeb27550f8297326233958))
* **sim:** read a slot's effect levels once for the motion and cost lanes (status-effects T27) ([ecbd089](https://github.com/james-r-parker/simulation/commit/ecbd089703180b0e18966dd9229a6204269afe33))
* **sim:** read a stored effect's stacks by its row, and fade only rows with a stack (status-effects T24) ([167560f](https://github.com/james-r-parker/simulation/commit/167560fa35dc2e756e34816fb4b79515fb9c6fe3))
* **sim:** read the effect lanes by index and memoise a slot's levels (status-effects review) ([06d4d05](https://github.com/james-r-parker/simulation/commit/06d4d052c6c646be8e427cd986c353e66ac29aeb))
* **sim:** settle calls only on a tick that fired one ([8f3fe69](https://github.com/james-r-parker/simulation/commit/8f3fe69c4a8b07baf2ab094ad297d0a6d96cb1d0))
* **sim:** skip the call bookkeeping while the call effects have no strength (status-effects T28) ([6a21e51](https://github.com/james-r-parker/simulation/commit/6a21e51d20f22aa4be90282afdb1336443a76ed3))
* **sim:** skip the chilled, wounded and panicked appliers at neutral numbers (status-effects T30) ([a16653d](https://github.com/james-r-parker/simulation/commit/a16653dfbdf5008b2068c2b391003190e2233e67))
* **sim:** skip the huddle pass while huddleWarmth is 0 ([5caa694](https://github.com/james-r-parker/simulation/commit/5caa69410e1a4316aadd001f556367122c2afdb1))
* **sim:** skip the strike-miss removal for a slot whose cost lane is 0 ([51da948](https://github.com/james-r-parker/simulation/commit/51da9487fb56c8fcad526a4ee6df3b4fd1880b25))
* **sim:** the sense kernel writes the body sense (body-genes T53) ([5f16320](https://github.com/james-r-parker/simulation/commit/5f163201f9c4026cedd2739af4475c54bbb7ce96))
* **sim:** zero the body lanes once a slot and read the caster once (body-genes T52) ([417c285](https://github.com/james-r-parker/simulation/commit/417c2852c8f5dc5bec5dd4af4bfd3814278eb84c))


### Code Refactoring

* **sim:** the bite table and the dead spawn key go; the spec lookup is by index (body-genes Phase 5 T44, partly) ([6e544e0](https://github.com/james-r-parker/simulation/commit/6e544e0bfa0d0e463cc386816e067209edb2d6d9))
* **sim:** the scout multipliers are body entries and the hunter-only costs fold into the body (body-genes Phase 5 T44) ([e601662](https://github.com/james-r-parker/simulation/commit/e601662a91c8eb83068a61c2ac389b5b0123a695))

## [10.1.0](https://github.com/james-r-parker/simulation/compare/v10.0.0...v10.1.0) (2026-11-18)


### Features

* **app:** pack the agents in a worker (pack-worker Phase 2, T8-T13 and the deletion of T14) ([#499](https://github.com/james-r-parker/simulation/issues/499)) ([0429117](https://github.com/james-r-parker/simulation/commit/042911741d198533d366806f99701fc7aadaeee4))
* **evo:** add scent-trails detectors ([#491](https://github.com/james-r-parker/simulation/issues/491)) ([f163c13](https://github.com/james-r-parker/simulation/commit/f163c13393b432cdffcd017882dd52db7e19f823))
* **evo:** add sprint-use detectors ([#489](https://github.com/james-r-parker/simulation/issues/489)) ([3ca2b1f](https://github.com/james-r-parker/simulation/commit/3ca2b1fd558f83b3618c90868583034d421f5314))
* **evo:** add stillness scene detectors ([#490](https://github.com/james-r-parker/simulation/issues/490)) ([3a150d7](https://github.com/james-r-parker/simulation/commit/3a150d754594970adb7523c90902bb06ba97f061))
* **metrics:** measure prey guild selectivity ([#485](https://github.com/james-r-parker/simulation/issues/485)) ([c11202b](https://github.com/james-r-parker/simulation/commit/c11202bd104a15e89b5907b7e64429a3a63e35e3))
* **renderer:** cap line parts at the rim's weight; crisp renderer checked on real WebGPU ([#500](https://github.com/james-r-parker/simulation/issues/500)) ([390acd9](https://github.com/james-r-parker/simulation/commit/390acd9aa57da71dc4cfc7e92ab59a8d0c5be0cf))
* **worker:** cross-origin isolation and the shared snapshot ring (pack-worker Phase 1) ([#498](https://github.com/james-r-parker/simulation/issues/498)) ([0b8bdbc](https://github.com/james-r-parker/simulation/commit/0b8bdbc520bc2831b425ebc5af95d85f0a1d58cb))


### Bug Fixes

* **check:** keep slow suites out of tier 1 ([#483](https://github.com/james-r-parker/simulation/issues/483)) ([5068ef0](https://github.com/james-r-parker/simulation/commit/5068ef00d6d6a3b165310d082b5c609880bf005f))
* **gates:** scope lint to the active checkout ([#486](https://github.com/james-r-parker/simulation/issues/486)) ([36074aa](https://github.com/james-r-parker/simulation/commit/36074aab8774bc2f2287363975454b02bbd5d4dd))
* **smoke:** make the 5 s frame window a stall ceiling ([#495](https://github.com/james-r-parker/simulation/issues/495)) ([370eaae](https://github.com/james-r-parker/simulation/commit/370eaae54e9aa772a5d9b47cd6a30fa31847c53e))
* **smoke:** measure rendered app frames after startup ([#487](https://github.com/james-r-parker/simulation/issues/487)) ([04e3b34](https://github.com/james-r-parker/simulation/commit/04e3b3402844b2639e55662b22e475f9cf880a55))
* **worker:** fit the event capacity to a raised agent cap; record crisp-renderer T1 ([#493](https://github.com/james-r-parker/simulation/issues/493)) ([1a819b3](https://github.com/james-r-parker/simulation/commit/1a819b3902705b6d5cc1d5be090f85cac371a19c))


### Performance Improvements

* **renderer:** cut per-frame draw CPU from 3.5 to 2.8 ms at 1000 agents (crisp-renderer T24) ([#496](https://github.com/james-r-parker/simulation/issues/496)) ([ae0ae46](https://github.com/james-r-parker/simulation/commit/ae0ae46b35ba91bb7ec2617e05522c66669f9b48))
* **renderer:** stop re-sending idle buffers, fix the perf harness, revise the T24 budgets ([#494](https://github.com/james-r-parker/simulation/issues/494)) ([7116b7b](https://github.com/james-r-parker/simulation/commit/7116b7b1b1c0456d6e97ffa8bc5641b3df3eac72))

## [10.0.0](https://github.com/james-r-parker/simulation/compare/v9.0.0...v10.0.0) (2026-11-17)


### ⚠ BREAKING CHANGES

* **sim:** killGorgeShare 0.4 becomes the default (honest-budgets T37) ([#477](https://github.com/james-r-parker/simulation/issues/477))
* **sim:** hunter's eyes become the defaults (senses-and-motor T20-T21) ([#464](https://github.com/james-r-parker/simulation/issues/464))
* **sim,evo:** rulesHash 95ef99879cc94205 to e280f7fe28ab36fa; season 10 is unreleased, so its rulesHash moves in place.
* **sim:** hunter's eyes - rearVisionShare and the hunter-vision screen (senses-and-motor T16-T17) ([#459](https://github.com/james-r-parker/simulation/issues/459))
* **sim,eval:** add scout call multipliers and E181 screen (prey-guilds T9-T10) ([#450](https://github.com/james-r-parker/simulation/issues/450))
* **sim,eval:** add active defender repel and E180 screen (prey-guilds T4-T5) ([#448](https://github.com/james-r-parker/simulation/issues/448))
* **sim,eval:** predator recruitment arms & honest-recruit screen (honest-budgets T34-T35) ([#440](https://github.com/james-r-parker/simulation/issues/440))
* **sim:** rulesHash 50694cf3326302b6 to 2bcd2fe8b3b35097; season 10 is unreleased, so its rulesHash moves in place.
* **sim:** rulesHash 98ee549b9ecb959c to 50694cf3326302b6; season 10 is unreleased, so its rulesHash moves in place.
* the rules changed (rulesHash ca640c7579b94d0d to 98ee549b9ecb959c); genes of seasons 8 and 9 do not carry over.
* the rules changed (rulesHash ca640c7579b94d0d to 98ee549b9ecb959c); genes of season 8 do not carry over.
* **sim:** the rules change (rulesHash ca640c7579b94d0d to 98ee549b9ecb959c).

### Features

* **eval:** hunter-vision screen and 64-seed keep rule, no harm and catches +9.7% (senses-and-motor T18-T19) ([#462](https://github.com/james-r-parker/simulation/issues/462)) ([ce74da3](https://github.com/james-r-parker/simulation/commit/ce74da36446d9dc2a60dc652809c9e59e8bad0ed))
* **eval:** record the honest-alarm screen, no finalist, Phase 5 parked (honest-budgets T29-T31) ([#465](https://github.com/james-r-parker/simulation/issues/465)) ([08153e7](https://github.com/james-r-parker/simulation/commit/08153e74dc38f78382662d08bc67dc4a9bdae919))
* **evals:** the stage ladder, stage worlds and gate validity (training-stages T25) ([#479](https://github.com/james-r-parker/simulation/issues/479)) ([16cff69](https://github.com/james-r-parker/simulation/commit/16cff6978dc7e78d39ce47999361f03fcc51aafd))
* **evo,sim:** recruitment cohort, chase budget and carcass-loss diagnostics (honest-budgets T33a, T33b) ([#467](https://github.com/james-r-parker/simulation/issues/467)) ([cbfd523](https://github.com/james-r-parker/simulation/commit/cbfd523818ffcaecb52aca2a9907cd59958e1607))
* **evo:** add chase-kinematics detectors and registry entries (chase-physics P1) ([#449](https://github.com/james-r-parker/simulation/issues/449)) ([8a9f537](https://github.com/james-r-parker/simulation/commit/8a9f537fc14dbabe4e7a483e976c4c4de0ab60fd))
* **evo:** add prey-guild detectors and registry entries (prey-guilds T1) ([#445](https://github.com/james-r-parker/simulation/issues/445)) ([7e1aaca](https://github.com/james-r-parker/simulation/commit/7e1aacaa10f9e40964a46d7c53efb04679777121))
* **evo:** detector-baseline T8a - E188 power and liveness, baseline tables ([#482](https://github.com/james-r-parker/simulation/issues/482)) ([56a2a76](https://github.com/james-r-parker/simulation/commit/56a2a76a7c2482029c0891641e2a1d3e45fdbdff))
* **evo:** scene drills and export by style (training-stages Phase 4) ([#474](https://github.com/james-r-parker/simulation/issues/474)) ([a24834f](https://github.com/james-r-parker/simulation/commit/a24834f5dc1703185b25c01159074348bf014d5c))
* **evo:** shared chase record, chase metrics moved onto it, honest plan status (detector-baseline T1-T2) ([#453](https://github.com/james-r-parker/simulation/issues/453)) ([513c80b](https://github.com/james-r-parker/simulation/commit/513c80b7d880799ed2a512287abe888409d78bae))
* **evo:** training-stages Phase 1 detectors (T1-T4) ([#458](https://github.com/james-r-parker/simulation/issues/458)) ([e6621dd](https://github.com/james-r-parker/simulation/commit/e6621dd269832545424abfae35657f9d6e2be292))
* open season 9, grazeThrust 0.6 ([33ae748](https://github.com/james-r-parker/simulation/commit/33ae748db42648158eb1342563f27ad807b21e2b))
* **renderer:** the hunt and the death - hunter model, bite, chase, bump and death animations ([#480](https://github.com/james-r-parker/simulation/issues/480)) ([24eaf06](https://github.com/james-r-parker/simulation/commit/24eaf0615154c1b8f841e81ad7d9208c6c3dc732))
* season 9 records 9.0.0, season 10 opens with grazeThrust 0.6 ([2548143](https://github.com/james-r-parker/simulation/commit/2548143d7ee2e85278e4155592fb99d92ff48b1e))
* **sim,eval:** add active defender repel and E180 screen (prey-guilds T4-T5) ([#448](https://github.com/james-r-parker/simulation/issues/448)) ([5e0da78](https://github.com/james-r-parker/simulation/commit/5e0da78aea73caabed5b244e417c026c90497a62))
* **sim,eval:** add scout call multipliers and E181 screen (prey-guilds T9-T10) ([#450](https://github.com/james-r-parker/simulation/issues/450)) ([48197c8](https://github.com/james-r-parker/simulation/commit/48197c8fccf764b2c9e98ab43c68edd692323125))
* **sim,eval:** predator recruitment arms & honest-recruit screen (honest-budgets T34-T35) ([#440](https://github.com/james-r-parker/simulation/issues/440)) ([7feb76d](https://github.com/james-r-parker/simulation/commit/7feb76d9ada41117e42c957c7c38842001e29095))
* **sim,evo:** senses-and-motor Phase 1 interface checks and chase envelope tool (T1-T4) ([#454](https://github.com/james-r-parker/simulation/issues/454)) ([599c15c](https://github.com/james-r-parker/simulation/commit/599c15ce8959e07fb14ddb260ad097bbc905cdcb))
* **sim,evo:** senses-and-motor Phase 2 run and Phase 3 census and lesson probes (T5-T9) ([#455](https://github.com/james-r-parker/simulation/issues/455)) ([7233344](https://github.com/james-r-parker/simulation/commit/72333443103da772ff4ac89a9fc531839f1d10c2))
* **sim,evo:** the edge breeds - no clonal cap, gene gift on splits, birthReserve 300 (honest-budgets Phase 4) ([#461](https://github.com/james-r-parker/simulation/issues/461)) ([0819058](https://github.com/james-r-parker/simulation/commit/0819058e869a3e0182447a52fb1b0dd1266610f6))
* **sim:** a seen call changes the bite, alarmBiteShare (honest-budgets T28) ([b511f9d](https://github.com/james-r-parker/simulation/commit/b511f9d5cb874185ecfb53b40ffc0131422a4d5a))
* **sim:** grazeThrust 0.6 by default (eat-choice T28) ([6301867](https://github.com/james-r-parker/simulation/commit/630186720b206a48648375652a078c99bf409951))
* **sim:** hunter's eyes - rearVisionShare and the hunter-vision screen (senses-and-motor T16-T17) ([#459](https://github.com/james-r-parker/simulation/issues/459)) ([89ca5ee](https://github.com/james-r-parker/simulation/commit/89ca5ee5460a6695600f54d780a90f970c8cbe26))
* **sim:** hunter's eyes become the defaults (senses-and-motor T20-T21) ([#464](https://github.com/james-r-parker/simulation/issues/464)) ([6ee46a4](https://github.com/james-r-parker/simulation/commit/6ee46a46868e3f2ae6c8e7792146f2ec3c6446ce))
* **sim:** killGorgeShare 0.4 becomes the default (honest-budgets T37) ([#477](https://github.com/james-r-parker/simulation/issues/477)) ([664fd1e](https://github.com/james-r-parker/simulation/commit/664fd1e6694434b8ee1b1cdeadc7b1639b55ad2f))
* **sim:** killShare and killGorgeCap, a kill takes the body (honest-budgets T8) ([ad3246e](https://github.com/james-r-parker/simulation/commit/ad3246e6cc55920b7f5eb0fc46a17ffef650f0db))
* **sim:** patch stock as energy, reserved by standing items (honest-budgets T1) ([408be6c](https://github.com/james-r-parker/simulation/commit/408be6c95b75099ba3ccc6b93d0a87827389e33d))
* **sim:** patch stock pays for plant food (honest-budgets Phase 1) ([ed78c19](https://github.com/james-r-parker/simulation/commit/ed78c197f05ee6138dc1a18654071c43017132f9))
* **sim:** spawnFloraItem refuses a spawn the patch cannot pay (honest-budgets T2) ([05311f8](https://github.com/james-r-parker/simulation/commit/05311f89e51587ea491738a2897e791dc3d81654))
* **sim:** the carcass is the body and fades (honest-budgets T9) ([eba1f24](https://github.com/james-r-parker/simulation/commit/eba1f24f7e7572a887573902359f9c05bc207a56))
* **sim:** the honest-alarm grid and the E178 prediction (honest-budgets T29) ([b6b0856](https://github.com/james-r-parker/simulation/commit/b6b0856c0a60b1d7ba576991383c2d37e9fd417b))
* **sim:** the kill is the body (honest-budgets Phase 2) ([5ad5e5d](https://github.com/james-r-parker/simulation/commit/5ad5e5db532c9b877481391f9c4767a029c66b7d))
* **sim:** the split gift from the gene and a birth reserve (honest-budgets T22) ([b486539](https://github.com/james-r-parker/simulation/commit/b4865397c0360cc544c3edbe34c81ab9471799dd))
* **sim:** wall and rock impacts cost by the speed into the surface ([b35ff23](https://github.com/james-r-parker/simulation/commit/b35ff23ff8adfbe94631cb570d09ad529bc41f32))
* **train:** cross-play and the opponent pool (training-stages Phase 3) ([#468](https://github.com/james-r-parker/simulation/issues/468)) ([bfda56c](https://github.com/james-r-parker/simulation/commit/bfda56c8615cf2a858b86a8b5acabd2550999f28))
* **train:** gated ladder - gates, holds, stalls, reviews, manifest, seed partitions (training-stages Phase 2) ([#466](https://github.com/james-r-parker/simulation/issues/466)) ([16a37db](https://github.com/james-r-parker/simulation/commit/16a37db8aac394ae7806a0371eae3af0f0a10668))
* **wasm:** bounce_rocks writes the speed into each rock it strikes ([b883226](https://github.com/james-r-parker/simulation/commit/b883226af6fc0416557f8efb112522b896ddd03a))


### Bug Fixes

* **ci:** release-check lets a rules change move an unreleased season in place ([955a960](https://github.com/james-r-parker/simulation/commit/955a9600eef04ca1138e1cd44c5b43ab70130510))
* **ci:** release-check lets a rules change move an unreleased season in place ([6e2282f](https://github.com/james-r-parker/simulation/commit/6e2282fb65286d624aa48beff97405ffd3edb59b))
* **evo:** detect total-population boom-bust cycles in eval.boom_bust_count (honest-budgets T33) ([#439](https://github.com/james-r-parker/simulation/issues/439)) ([532d548](https://github.com/james-r-parker/simulation/commit/532d5486e9ce49d03d03fef5e73494107c6ca257))
* **evo:** eval.pack_prey_size_ratio reads the victim's size from the death record ([#478](https://github.com/james-r-parker/simulation/issues/478)) ([835f98c](https://github.com/james-r-parker/simulation/commit/835f98cbedcd4692fb35c3837a026fce1be66e1d))
* **sim:** a dead victim keeps the biter that killed it ([06a4f3e](https://github.com/james-r-parker/simulation/commit/06a4f3e69d6da15911d564877615d92eb470c395))
* **sim:** break the energy-world-kill-body import cycle; name the tests honest-budgets ships ([cb7ac1b](https://github.com/james-r-parker/simulation/commit/cb7ac1b060fed6773a0bf2bf115c58dfb7c5f7f9))

## [9.0.0](https://github.com/james-r-parker/simulation/compare/v8.0.0...v9.0.0) (2026-11-14)


### ⚠ BREAKING CHANGES

* **app:** the ?quality, ?scale and ?look URL parameters and the

### Features

* **app:** add the animation clips and their sampler (crisp-renderer T8) ([c1916f3](https://github.com/james-r-parker/simulation/commit/c1916f3fc02a893f2950d416ec5d8c90d8b203c0))
* **app:** add the crisp neon palette (crisp-renderer T4) ([f9ecdc9](https://github.com/james-r-parker/simulation/commit/f9ecdc970b84bd346651d8064d0e5f8c01489643))
* **app:** add the kill clamp tween on the killer (crisp-renderer T7) ([7bf7899](https://github.com/james-r-parker/simulation/commit/7bf7899871b6ac892d1a0f9a660596962fe64681))
* **app:** add the SDF primitives in JS and TSL (crisp-renderer T5) ([8566d5a](https://github.com/james-r-parker/simulation/commit/8566d5a6518b4f58b62c5ad0bf005258d49ba2f8))
* **app:** add the vector model catalogue (crisp-renderer T6) ([bda3a08](https://github.com/james-r-parker/simulation/commit/bda3a0876295a58c6d5ebfae4fc1a07d8b057d14))
* **app:** add the WebGPU stage (crisp-renderer T10) ([5f4f661](https://github.com/james-r-parker/simulation/commit/5f4f6614244ce73f9c197bdae7c1593190eb2e78))
* **app:** blend herds between snapshots by slot (crisp-renderer T3) ([fcd6cc7](https://github.com/james-r-parker/simulation/commit/fcd6cc76e4000c4c1672b9b390087d763f14ab44))
* **app:** cells in the void (crisp-renderer) ([a47bbc1](https://github.com/james-r-parker/simulation/commit/a47bbc14be631d49d18d23f70440d447be99cbbb))
* **app:** compile catalogue models into TSL materials (crisp-renderer T9) ([4e83d77](https://github.com/james-r-parker/simulation/commit/4e83d779ff9b0d5fdff630693a202eecc8a48ecf))
* **app:** draw crisp lines and contour lenses (crisp-renderer T20, T21) ([7a6cc35](https://github.com/james-r-parker/simulation/commit/7a6cc351c407d8b590145b8f8f41e9070251e243))
* **app:** draw the crisp agents (crisp-renderer T12) ([cef4433](https://github.com/james-r-parker/simulation/commit/cef4433bc9985ea23ec28637819a2dcec059d9ff))
* **app:** draw the effect particles and event flashes (crisp-renderer T19) ([56398bd](https://github.com/james-r-parker/simulation/commit/56398bdc91dc08e22d00c756c25f941eb19d70bb))
* **app:** draw the food from its models (crisp-renderer T14) ([32fa445](https://github.com/james-r-parker/simulation/commit/32fa4452711dc6741211cd5e6043edc600b26473))
* **app:** draw the herds blended at the frame rate (crisp-renderer T13) ([ff08d19](https://github.com/james-r-parker/simulation/commit/ff08d198f431517e80076591a73de72c4f5f2029))
* **app:** draw the world from its models (crisp-renderer T15-T17) ([864ed74](https://github.com/james-r-parker/simulation/commit/864ed744718dbc954d6dfa6229f1da9ed6de3802))
* **app:** read the GPU frame time from three's timestamps (crisp-renderer T11) ([22509a8](https://github.com/james-r-parker/simulation/commit/22509a8e5fff781c677ad30f20eda2ddec28e940))
* **app:** switch the app to the crisp WebGPU renderer (crisp-renderer T22) ([13fc647](https://github.com/james-r-parker/simulation/commit/13fc647418e20f6e16c346184f0e17311c316b8e))
* **evo:** count the eat-choice contact shares in the feed phase (eat-choice T27) ([e378e48](https://github.com/james-r-parker/simulation/commit/e378e48025b1552e34ea6a739ac2f13c59cb23e8))
* **evo:** read the contact shares from the feed-phase tally (eat-choice T27) ([4b29ed2](https://github.com/james-r-parker/simulation/commit/4b29ed2128f1606088c12ec4c31c0f5c545fe127))
* **sim:** carry the herd animal slot in the snapshot (crisp-renderer T2) ([8da452c](https://github.com/james-r-parker/simulation/commit/8da452cc4d7b7ac121684a3ade7688bfcf0dace2))
* **sim:** tally non-hunter food contacts in the feed phase (eat-choice T27) ([80d8964](https://github.com/james-r-parker/simulation/commit/80d8964b71ea38b4327aaa8197a1d152b80c7af9))


### Bug Fixes

* **app:** draw the agents on WebGPU ([a4d8ba1](https://github.com/james-r-parker/simulation/commit/a4d8ba1392bc96cba9f0d861e461203e74655482))
* **app:** draw the agents on WebGPU (one interleaved instance buffer) ([c38ac4e](https://github.com/james-r-parker/simulation/commit/c38ac4e8a469ff200f18387dd3a1c6fe72f50297))
* **app:** make the pregnancy ring legible on its own ([53d0d6e](https://github.com/james-r-parker/simulation/commit/53d0d6ebf9e7943710ab68cd7c9a25e36e3f6411))
* **app:** review fixes and a restrained look (crisp-renderer T26) ([8832e58](https://github.com/james-r-parker/simulation/commit/8832e58806b72652b7e5dcc3d1636fa596494732))


### Performance Improvements

* browser --look option are removed. ([13fc647](https://github.com/james-r-parker/simulation/commit/13fc647418e20f6e16c346184f0e17311c316b8e))

## [8.0.0](https://github.com/james-r-parker/simulation/compare/v7.1.0...v8.0.0) (2026-11-13)


### ⚠ BREAKING CHANGES

* the rules changed (rulesHash bc2fd948bd4ecf66 to ca640c7579b94d0d); genes of season 7 do not carry over.
* **sim:** temperatureCoolingExcess and temperatureMatingMax are no longer config keys.
* **sim:** seasons[].reproductionBonus and mateChanceScale are no longer config keys, and findMale makes no lifecycle draw, which changes the sim stream and rulesHash.
* **sim:** noteMatesSeen counts a mate only within findMale's reach, which changes mateSeenAt and so the sim stream and rulesHash.

### Features

* **library:** no season gap while uploads are closed (deployment-and-community Phase 1c) ([22acff5](https://github.com/james-r-parker/simulation/commit/22acff5ebd237db9c568c374604afba777e9f0a2))
* **library:** no season gap while uploads are closed (deployment-and-community T43) ([cc979be](https://github.com/james-r-parker/simulation/commit/cc979be9e9cc15aa1a255cc42dd7bf857469971d))
* open season 8, the low-density-edge switch ([650bf0f](https://github.com/james-r-parker/simulation/commit/650bf0f5223b69a4984bf730cf4b6a2eb36b8532))
* **sim:** delete the unused heat keys (low-density-edge T18) ([deb7f3f](https://github.com/james-r-parker/simulation/commit/deb7f3f1fe2dda5c36c6dfdc18b3e35ed20b3329))
* **sim:** mating takes no seasonal chance (low-density-edge T17) ([c57f48e](https://github.com/james-r-parker/simulation/commit/c57f48e69d601fa7768fc9ace3fecbae4b6616f5))
* **sim:** noteMatesSeen counts a mate only within findMale's reach (low-density-edge T16) ([b2eb8fc](https://github.com/james-r-parker/simulation/commit/b2eb8fc14ae994d2d1f51fa8e646f193106d9507))

## [7.1.0](https://github.com/james-r-parker/simulation/compare/v7.0.0...v7.1.0) (2026-11-12)


### Features

* **bench:** report bench.observe_ms for the full and the lean observer (lean-observer T3) ([c731bbf](https://github.com/james-r-parker/simulation/commit/c731bbf2cc338656c69b0b29fd0be13666d20a03))
* **evo:** lean observer mode that skips the eval layer (lean-observer T1) ([8676117](https://github.com/james-r-parker/simulation/commit/867611782835d56231fc37ca62037f000e601ec0))
* **evo:** the eat scene samples every 100 ticks through a food cell index (eat-choice T20) ([75ddd8f](https://github.com/james-r-parker/simulation/commit/75ddd8ff3d89177b5a4c5fc89daf7b5edb5dc6e5))
* **evo:** the eat-choice detectors the switch lacked (eat-choice Phase 5, chunk H) ([cfc30d5](https://github.com/james-r-parker/simulation/commit/cfc30d5063ea474984e29d76a7151c0fa940c181))
* **evo:** the graze time share and speed ratio (eat-choice T21) ([daddc8e](https://github.com/james-r-parker/simulation/commit/daddc8e186eb889851f89765b7e3809726b48df5))
* **evo:** the hunter plant linger share (eat-choice T22) ([b4b8917](https://github.com/james-r-parker/simulation/commit/b4b8917ea0deb7c439cb5c3f22adcfca3db4fdfe))
* **evo:** the strike miss energy share (eat-choice T23) ([64f079f](https://github.com/james-r-parker/simulation/commit/64f079fbc28b94543afb3e8589faf2b7111e37d1))
* **sim:** a held bite on deliberately reached food stays deliberate (eat-choice T18) ([6107599](https://github.com/james-r-parker/simulation/commit/6107599968d59366244b127716322cd0e3d08604))
* **sim:** the graze hold - grazing after a deliberate approach stays deliberate (eat-choice Phase 4) ([3f8bf12](https://github.com/james-r-parker/simulation/commit/3f8bf122f49a96a78b4d1df9d88c954feeaeab59))
* **worker:** buildRun feeds the policy a lean observer (lean-observer T4) ([cdabe65](https://github.com/james-r-parker/simulation/commit/cdabe655c4862182682d58f5ee1f3ba23738990d))
* **worker:** the lean observer - the app skips the eval-only detectors (lean-observer Phase 1) ([d0b3f2f](https://github.com/james-r-parker/simulation/commit/d0b3f2f521c2830498fbc10d30cc2b561a93d33b))


### Bug Fixes

* **evo:** point the plain brain's rng type imports at js/sim ([787c2f7](https://github.com/james-r-parker/simulation/commit/787c2f73dc19a80395a10ab5f70b0cc9135e8b74))


### Performance Improvements

* **wasm:** tanh_in_place resumes four-wide after a slow group (wasm-kernels Phase 6) ([dbb7737](https://github.com/james-r-parker/simulation/commit/dbb7737a4399057080b3c6206ad401625fb338c5))
* **wasm:** tanh_in_place resumes four-wide after a slow group (wasm-kernels T30) ([3b1fbe0](https://github.com/james-r-parker/simulation/commit/3b1fbe0cacac8c55e5a6864572154e2319531ba3))

## [7.0.0](https://github.com/james-r-parker/simulation/compare/v6.1.0...v7.0.0) (2026-11-12)


### ⚠ BREAKING CHANGES

* the default rules change (rulesHash bc2fd948bd4ecf66); champions and archives from 6.x do not seed this season.
* **sim:** the eat choice is the default - graze 0.5, fat 0.5, a strike at nothing costs 1; delete grazeMissCost

### Features

* **evo:** eat-choice Phase 1 chunk A - the eat-choice detectors ([8a30dc3](https://github.com/james-r-parker/simulation/commit/8a30dc3593c39e8a8934832658fe9e231f88019a))
* **evo:** the eat-choice detectors (eat-choice T1) ([d00a2ec](https://github.com/james-r-parker/simulation/commit/d00a2ec63a86125adac8c5e86c73cfc84724399a))
* open season 7, the eat-choice ruleset ([58c60e4](https://github.com/james-r-parker/simulation/commit/58c60e4d3794f7017e5f617f4510ead11aa9e8f4))
* **sim:** a non-hunter eats only while it bites (eat-choice T6) ([04444f4](https://github.com/james-r-parker/simulation/commit/04444f4e665c17d672ae05823f54ec668d1b984d))
* **sim:** a ray sees only the food its caster can eat (eat-choice T7b) ([c51424a](https://github.com/james-r-parker/simulation/commit/c51424a98cb09eb1c5e05dec22c49e2f48dc8a45))
* **sim:** fatSlowShare slows a full store (eat-choice T7a) ([2d1cdda](https://github.com/james-r-parker/simulation/commit/2d1cdda9e05d21a61f128d6a36100f7834ba3713))
* **sim:** grazeMissCost charges a forager biting at nothing (eat-choice T7e) ([b3281c6](https://github.com/james-r-parker/simulation/commit/b3281c681a1745b2f41cfd05ef86b381e332bdf5))
* **sim:** grazeThrust slows a forager holding BITE (eat-choice T7) ([b2ccf93](https://github.com/james-r-parker/simulation/commit/b2ccf938e1be2c45545c23f8ab632205f7220511))
* **sim:** strikeMissCost charges a hunter biting air (eat-choice T7c) ([640bdea](https://github.com/james-r-parker/simulation/commit/640bdea0d287b53a9348078fd6a0eb36a32a0663))
* **sim:** the eat choice is the default - graze 0.5, fat 0.5, a strike at nothing costs 1; delete grazeMissCost ([67ddb78](https://github.com/james-r-parker/simulation/commit/67ddb78b9f93270178014f527acd9a5915d0b615))


### Bug Fixes

* **evals:** E161 keepRule verdict uses the schema's enum ([8de87ef](https://github.com/james-r-parker/simulation/commit/8de87ef205cdd8869da6968ee734d02bedc5ac64))
* **evo:** scripted foragers bite to eat (eat-choice T7d) ([e485636](https://github.com/james-r-parker/simulation/commit/e4856369575aba2214329caff423761689f2d2be))
* **scripts:** the heat scripts typecheck and share the arm row; the release-check shell test targets season/next on a rules line ([273bd60](https://github.com/james-r-parker/simulation/commit/273bd60290195114d96928a5766020690b76504d))

## [6.1.0](https://github.com/james-r-parker/simulation/compare/v6.0.1...v6.1.0) (2026-11-11)


### Features

* **evals:** require committed reports from E151 on (carrying-capacity T4) ([8857466](https://github.com/james-r-parker/simulation/commit/8857466e581a1af76e2c46908876637fa6227e9b))
* **evo:** absolute min-effect and power steps for share metrics (metric-trust T29a) ([45ec383](https://github.com/james-r-parker/simulation/commit/45ec383c4cf4345059e3fd68431d4bb36ba4afe8))
* **evo:** add the four capacity detectors (carrying-capacity T2) ([455a8c5](https://github.com/james-r-parker/simulation/commit/455a8c50ae5ef28401d4e447fb730aa3bee9d63c))
* **evo:** add the held seed guard to the keep rule (carrying-capacity T1) ([91955ca](https://github.com/james-r-parker/simulation/commit/91955ca1bd158500567623a188db7b2e06d00fb9))
* **evo:** carrying-capacity Phase 1 chunk A - held guard, capacity detectors, decision reports ([eb83b8b](https://github.com/james-r-parker/simulation/commit/eb83b8b71a9b502226264e7a64a090140547ff86))
* **evo:** compare prints unverified for a metric that is not verified (metric-trust T29) ([f133d16](https://github.com/james-r-parker/simulation/commit/f133d1640aeef2e3da10718d7ccc85770a604eca))
* **evo:** keepRule, the paired no-harm test (metric-trust T30) ([bd68cec](https://github.com/james-r-parker/simulation/commit/bd68ceca25a50697276773d9cc43496b320cbe4b))
* **evo:** let a seed guard read better (carrying-capacity T3) ([8504acc](https://github.com/james-r-parker/simulation/commit/8504acc6bf52c30b8ab24c8c76e6618b57afd2af))
* **evo:** low-density-edge Phase 2 chunk B - the edge detectors and E-LD-1 ([9ea7472](https://github.com/james-r-parker/simulation/commit/9ea74722507e4bfd8997f43642ee0a6ab8ae402a))
* **evo:** metric-trust Phase 4 - verdicts read the registry, share min-effect, sparse sign test, keepRule ([c999314](https://github.com/james-r-parker/simulation/commit/c9993143362a34e212642ca7743d859a34972202))
* **evo:** metric-trust Phase 5 T33 to T35 - RunConfig, trace counts, 15 metrics filled, past verdicts re-read ([572c317](https://github.com/james-r-parker/simulation/commit/572c3172c87766b4d0c4e1a5f53cc221c1c25d0f))
* **evo:** read a 64-seed power result into the registry (metric-trust T29b, code) ([9ae870c](https://github.com/james-r-parker/simulation/commit/9ae870ce0b690559a517c57df6181f7e0a121187))
* **evo:** report traces keep prey and hunters per checkpoint (metric-trust T34) ([dcd7f14](https://github.com/james-r-parker/simulation/commit/dcd7f144d7325ed265a0c6dc3de6ae9f54152bd1))
* **evo:** the edge span tallies and rate detectors (low-density-edge T5) ([eca9ad9](https://github.com/james-r-parker/simulation/commit/eca9ad9c61848a96805bc174cbf7288e8fef7432))
* **evo:** the unreached-mate and split-gate share detectors (low-density-edge T6) ([8bf7ee4](https://github.com/james-r-parker/simulation/commit/8bf7ee495241d567e19e75801e1655749e909079))
* **screen:** per-seed criteria report the passing share against the reference (metric-trust T31a) ([8a123cb](https://github.com/james-r-parker/simulation/commit/8a123cb220113d25b207a8ff9bb925bc193ccc99))
* **screen:** verdicts read verified metrics, thresholds need checked ones (metric-trust T31) ([11206f3](https://github.com/james-r-parker/simulation/commit/11206f356a34c33bc21af2efab4d08d5a3b0627f))
* **scripts:** metric-power-write --merge keeps unnamed readings (carrying-capacity T6) ([e96c0fa](https://github.com/james-r-parker/simulation/commit/e96c0faea11845f0ddc4081893adc918c60afbb6))
* **scripts:** replay takes live and every run tool logs RunConfig first (metric-trust T33) ([c34081c](https://github.com/james-r-parker/simulation/commit/c34081c69853ff81674c5c832ca68c13f9fc7b3e))


### Bug Fixes

* **evo:** density slopes as elasticities at the season means (carrying-capacity T2) ([512af1d](https://github.com/james-r-parker/simulation/commit/512af1d61c7f455d50ca35d901128c860dc541bc))
* **evo:** keep each life's leak at birth for the leak-skill metrics ([#387](https://github.com/james-r-parker/simulation/issues/387)) ([125ade5](https://github.com/james-r-parker/simulation/commit/125ade58daf03ffc1a03d9a1dab2bb9d809a5da2))
* **evo:** keepRule seed guards use an exact McNemar test (metric-trust T30) ([464580c](https://github.com/james-r-parker/simulation/commit/464580c2ed1c2ca68cbe4d0746e3bd3b947e5408))
* **evo:** sparse paired differences need a sign test for a verdict (metric-trust T29c) ([be50295](https://github.com/james-r-parker/simulation/commit/be50295c55f6ae5868acc48146282dff92faa847))
* **scripts:** share one median and cover the edge diagnosis scripts (low-density-edge T10) ([06c90b0](https://github.com/james-r-parker/simulation/commit/06c90b02b5ce2245d35d2edbed4e378706c0deae))
* **scripts:** type the capacity scripts, share their setup and cover their functions (carrying-capacity T8, T11) ([5e83924](https://github.com/james-r-parker/simulation/commit/5e83924b8774a2eab0b96d182e9f2eb540163701))
* **scripts:** type the screen arm resolve, make trace prey optional, share the policy flag (metric-trust T33, T34) ([070042e](https://github.com/james-r-parker/simulation/commit/070042e45475388e1e4fff548c73d4d1cd2e120c))

## [6.0.1](https://github.com/james-r-parker/simulation/compare/v6.0.0...v6.0.1) (2026-11-08)


### Bug Fixes

* **release:** drop component prefix from release tags and use client-id ([2d7bc40](https://github.com/james-r-parker/simulation/commit/2d7bc4013ddce1dd397f6f93826983c7e9024734))

## [6.0.0](https://github.com/james-r-parker/simulation/compare/blob-evolution-simulation-v5.0.0...blob-evolution-simulation-v6.0.0) (2026-11-08)


### ⚠ BREAKING CHANGES

* **wasm:** spatial hash, pheromone field and physics in the Rust kernel (wasm-kernels Phase 4) ([#336](https://github.com/james-r-parker/simulation/issues/336))
* **wasm:** ray march in the Rust kernel, JS ray march deleted (wasm-kernels Phase 2) ([#330](https://github.com/james-r-parker/simulation/issues/330))
* **wasm:** Rust brain kernel is the only brain path; Rust microbenchmarks (wasm-kernels T7, T8) ([#324](https://github.com/james-r-parker/simulation/issues/324))

### Features

* add npm run probe:memory and --save-champions on eval ([50efe5f](https://github.com/james-r-parker/simulation/commit/50efe5fb99cb0125f70dfbac0f7bdb3c6cbadc6c))
* **app:** agent states, flee cue, gaits and an adaptive fx budget (render fx Phase 2) ([#340](https://github.com/james-r-parker/simulation/issues/340)) ([7625625](https://github.com/james-r-parker/simulation/commit/7625625c89611bfbe215169fc0f0b6e78a8e1c91))
* **app:** chase tethers and refuge occupancy glow (renderer Phase 7) ([#305](https://github.com/james-r-parker/simulation/issues/305)) ([61cf2fc](https://github.com/james-r-parker/simulation/commit/61cf2fca287cfc9ccb12804f24ec6d173595f568))
* **app:** courtship, births, calls, sickness and season weather effects (render fx chunk B) ([#335](https://github.com/james-r-parker/simulation/issues/335)) ([1a0f457](https://github.com/james-r-parker/simulation/commit/1a0f4571e8c63049b8a09945c7d70c6ba7146cb2))
* **app:** effects measured, conformance fixes, eatMeat legibility (render fx chunk C) ([#337](https://github.com/james-r-parker/simulation/issues/337)) ([2cc5cb7](https://github.com/james-r-parker/simulation/commit/2cc5cb719c479b352849d8b28672d5a50de0236f))
* **app:** event effects core and combat - fx pool, budget, look items, bites, kills, deaths (render fx chunk A) ([#333](https://github.com/james-r-parker/simulation/issues/333)) ([e8b2589](https://github.com/james-r-parker/simulation/commit/e8b258956a7f23585cdf599cb4fd77e9822aad04))
* **app:** herds, flora, drought, wall shimmer, scent heat map and first kills (render fx Phase 3) ([#345](https://github.com/james-r-parker/simulation/issues/345)) ([c7bcde2](https://github.com/james-r-parker/simulation/commit/c7bcde201e926866786727645f74e855de6d2dca))
* **app:** mobile view phase 1 - pinch zoom, portrait home, phone HUD ([2dd6b77](https://github.com/james-r-parker/simulation/commit/2dd6b77e22418078f3b1ae6c87d0b05563817a3d))
* **app:** pinch zoom, two-finger pan and a fingertip-sized tap ([2b69170](https://github.com/james-r-parker/simulation/commit/2b691704ee232cb67e6b6946df464af8db7f82ae))
* **app:** portrait home zoom that survives turning the phone ([82d44f3](https://github.com/james-r-parker/simulation/commit/82d44f3388c06df4272300d5ba616fc8c8bfd469))
* **app:** the director follows events - world moments, off-view pointers, L to the last moment (render fx Phase 4) ([#348](https://github.com/james-r-parker/simulation/issues/348)) ([c346a20](https://github.com/james-r-parker/simulation/commit/c346a20e6876948263a44be978b49ed4c6880e91))
* **app:** touch gestures, overflow menu and coarse-pointer quality (mobile Phase 2 C2) ([#326](https://github.com/james-r-parker/simulation/issues/326)) ([f14aa8b](https://github.com/james-r-parker/simulation/commit/f14aa8b1aa22fe0fc1a4bc3ac91aa0cdc85436ac))
* **balance:** a bigger hunter fat store and more role switching (E103) ([aa01255](https://github.com/james-r-parker/simulation/commit/aa01255b5713aa3bbabadfcd33761abdfe7f947c))
* **balance:** keep hunters with a bigger fat store and more role switching (E98-E103) ([0858a7f](https://github.com/james-r-parker/simulation/commit/0858a7f9562accde54c4c1b7b0fc788b4f8e385a))
* **balance:** raise the food supply and cap (E88, E94, E95) ([0c4da94](https://github.com/james-r-parker/simulation/commit/0c4da94b23fa3a0905c15cad0d69b491aa049964))
* **balance:** raise the food supply and cap (E95) ([9802584](https://github.com/james-r-parker/simulation/commit/9802584f344b32ed5f1ad7c16019c169d324eb48))
* **balance:** richer carcasses for scavenging hunters (E104, E105) ([e536d00](https://github.com/james-r-parker/simulation/commit/e536d0003ce0536524ae4418909639eb7eee7498))
* **balance:** richer carcasses for scavenging hunters (E105) ([9757d07](https://github.com/james-r-parker/simulation/commit/9757d075d8fa4625391d06aba7712e14d4c1a31c))
* **balance:** short-lived toxic caps and a larger food cap (E112) ([#266](https://github.com/james-r-parker/simulation/issues/266)) ([4992b8a](https://github.com/james-r-parker/simulation/commit/4992b8afc2db2d873fc7cc739d69277c852bd9f8))
* **bench:** bench:parts times every step phase whole and in its parts ([ceb840d](https://github.com/james-r-parker/simulation/commit/ceb840da00dd478efc9b58f1efce4ef80dad5989))
* **conventions:** add the flag-ledger gate ([50031c9](https://github.com/james-r-parker/simulation/commit/50031c9f776d15a0b76a388056b9d9ef249ff30e))
* **deploy:** versioned releases, /next/ and PR previews on D1 - the release pipeline on top of Release Please (deployment Phase 1) ([#375](https://github.com/james-r-parker/simulation/issues/375)) ([1765184](https://github.com/james-r-parker/simulation/commit/176518404141f1c9afd52d2d876b1c3e46d57f73))
* **disease:** add the contagion to the sim core, off by default ([575cb02](https://github.com/james-r-parker/simulation/commit/575cb0263f10229def6cd2fadd02935ea40d2edb))
* **disease:** add the four contagion detectors ([f7ba0ce](https://github.com/james-r-parker/simulation/commit/f7ba0cec3303000ff7bf4810289117be30dc3036))
* **disease:** contact contagion that favours hosts with similar genes, on by default ([721ccd0](https://github.com/james-r-parker/simulation/commit/721ccd034954892e1aa2fc7c5f810d66eaa51610))
* **disease:** draw infected blobs, the strain ring and the inspector line ([5e96637](https://github.com/james-r-parker/simulation/commit/5e96637e9f8fa98a430c5ef033305e6eaeaaff9d))
* **disease:** turn the contagion on by default ([dddf066](https://github.com/james-r-parker/simulation/commit/dddf066975bc35b8bec2288b7067b17666c8c27d))
* **evo:** add eval.hunter_kill_conversion_hungry.1k-2k (realistic-keepers T11a) ([#299](https://github.com/james-r-parker/simulation/issues/299)) ([5c6800e](https://github.com/james-r-parker/simulation/commit/5c6800ec692792b06d6749027c7b861819ef8706))
* **evo:** add per-life leak against skill ([487e2b2](https://github.com/james-r-parker/simulation/commit/487e2b21e0a61c7d5e8cb6edbf2d19984bff5afd))
* **evo:** add the group-hunt probe ([934a651](https://github.com/james-r-parker/simulation/commit/934a6513c9382cfd3cef2474993e5393b78ab9e6))
* **evo:** add the Hebbian drift diagnostics ([4677b7e](https://github.com/james-r-parker/simulation/commit/4677b7e8ecb351da5d39345315e1375d2841d5b1))
* **evo:** add the leak and hidden-state samplers ([5537e43](https://github.com/james-r-parker/simulation/commit/5537e4382269d0d82b8b761ebfef3abc07e31695))
* **evo:** add the memory probes ([5a4e00c](https://github.com/james-r-parker/simulation/commit/5a4e00c62875e5283194305544e685eb95fbd4fb))
* **evo:** add the memory-output life statistics ([f34e5a9](https://github.com/james-r-parker/simulation/commit/f34e5a91cfbe66b7575a34819715691f7aa6789c))
* **evo:** add the mutationRate, weightDecay and leakGeneStart keys at today's values ([4037148](https://github.com/james-r-parker/simulation/commit/403714841167ca0f60ac2df5dbd2166815f6cae9))
* **evo:** add the weight and input diagnostics on the pooled row ([d3b525d](https://github.com/james-r-parker/simulation/commit/d3b525d10945a5c6035a890a1798aefe3360d65e))
* **evo:** basin divergence watch replaces the families watch (T59) ([#271](https://github.com/james-r-parker/simulation/issues/271)) ([044ce7f](https://github.com/james-r-parker/simulation/commit/044ce7fcfdfa2c2cd24f70a2bd20fa2d6e883682))
* **evo:** bite detectors - bite_on_prey, off-target bites, carrion idle share, recoil per life (hunter-practice Phase 1c) ([#360](https://github.com/james-r-parker/simulation/issues/360)) ([c4ee2ee](https://github.com/james-r-parker/simulation/commit/c4ee2ee2795e0ac9090c39a9f509263ebe97f538))
* **evo:** bite diagnosis tools - per-kind reflex shares, lost-trial trace, seed offset, kill curve, skip cells (training T18-T34) ([#357](https://github.com/james-r-parker/simulation/issues/357)) ([375184d](https://github.com/james-r-parker/simulation/commit/375184dae58898555d9f6c4dd511b5d4f5c397b3))
* **evo:** brain reflex tests - six brain-only cases, batched evaluator, 522 genomes/s (reflex Phase 1) ([#346](https://github.com/james-r-parker/simulation/issues/346)) ([47eba84](https://github.com/james-r-parker/simulation/commit/47eba8443ac0a8cda5ac0f456d6b2d5f6d8a0ce4))
* **evo:** bump ARCHIVE_VERSION to 3 ([465e679](https://github.com/james-r-parker/simulation/commit/465e679d8a3b438c46c67efd22cade837bc58de0))
* **evo:** bump ARCHIVE_VERSION to 4 ([06280d9](https://github.com/james-r-parker/simulation/commit/06280d9e6f378334f4a8958db231408735d2bd1b))
* **evo:** default mutationRate to invsqrt ([3f77478](https://github.com/james-r-parker/simulation/commit/3f77478ec9f618fd1886b98324f85c63694028c1))
* **evo:** default weightDecay to 0.005 ([f03f8c1](https://github.com/james-r-parker/simulation/commit/f03f8c1724273cf4a7d31f657d398b540d8f903a))
* **evo:** delete the act terms of fitnessV6 ([ec82032](https://github.com/james-r-parker/simulation/commit/ec820325980e0642bafb7da380846c895adb4c8d))
* **evo:** descriptorV7, the behaviour axis, and the diversity factor deleted ([a2d6103](https://github.com/james-r-parker/simulation/commit/a2d610329e4ba0504bea4578b28d2e28efe25b99))
* **evo:** end-state and per-basin family metrics for the Phase 4 gate ([644d05f](https://github.com/james-r-parker/simulation/commit/644d05fd71b6e186d9d78033ca3759b562790c9c))
* **evo:** eval.input_active_share.threat and .prey ([5d98cff](https://github.com/james-r-parker/simulation/commit/5d98cff7acf73493af8f2d23745fb0e9826ab22f))
* **evo:** eval.instinct_drift, the instinct cells' distance from their prior ([b49df49](https://github.com/james-r-parker/simulation/commit/b49df49422ca8088bcfc624d84d5d906de7aae9c))
* **evo:** families per basin as genetic clusters ([7425a8d](https://github.com/james-r-parker/simulation/commit/7425a8d77f1814827537c322aaee62f3fa5fe575))
* **evo:** fitness-by-spec, each specialisation's fitnessV6 term by term ([14ac7d4](https://github.com/james-r-parker/simulation/commit/14ac7d490dd892db3e0ce7bf2f290b1bf0a57414))
* **evo:** hunter-learning detectors and Phase 1 keys (chunk A1) ([#272](https://github.com/james-r-parker/simulation/issues/272)) ([7f02605](https://github.com/james-r-parker/simulation/commit/7f026052d3018150feb0b3e315e9177ecdd677cb))
* **evo:** innate instincts for random genomes, instinctWeight ([ab70f98](https://github.com/james-r-parker/simulation/commit/ab70f98772728ebffa1f1c843aac303c0dc60ef7))
* **evo:** local trainer with curriculum, checkpoints and export (training Phase 2) ([#318](https://github.com/james-r-parker/simulation/issues/318)) ([b8947ec](https://github.com/james-r-parker/simulation/commit/b8947ec052ac637bb4d652baa4a47e04dd215914))
* **evo:** measure flora patch pool saturation ([9247ecc](https://github.com/james-r-parker/simulation/commit/9247ecc566991d40124b4f4a013d5bc780c52d82))
* **evo:** measure flora patch pool saturation ([f597415](https://github.com/james-r-parker/simulation/commit/f59741556c5ac5c6c08c6968b23da937805cf01f))
* **evo:** measure plant species shares and seasonal diet shifts ([ac2744b](https://github.com/james-r-parker/simulation/commit/ac2744b7ddbe21b10be1cd551b63976b486881aa))
* **evo:** metric registry - one entry for each of the 268 eval metrics (metric-trust T1 to T7) ([#367](https://github.com/james-r-parker/simulation/issues/367)) ([acc76a6](https://github.com/james-r-parker/simulation/commit/acc76a6b3b0e2891aab7f803c8d691a395150fba))
* **evo:** Phase 1 instruments for habitat cover, alarm calls, seasons and hunter practice ([#343](https://github.com/james-r-parker/simulation/issues/343)) ([9a6b643](https://github.com/james-r-parker/simulation/commit/9a6b643075ec4076cd2b01e334576d8a55684e2d))
* **evo:** read the bite in the training curve and plateau (training T35) ([#366](https://github.com/james-r-parker/simulation/issues/366)) ([a0133a4](https://github.com/james-r-parker/simulation/commit/a0133a42e915b79833d1ca4f5d5b301df96fc823))
* **evo:** refuge detectors and the refuge-access fixture (refuge.md chunk A) ([#287](https://github.com/james-r-parker/simulation/issues/287)) ([62a6758](https://github.com/james-r-parker/simulation/commit/62a6758bdd38941d172aa75548ea3d1a0a6ebed5))
* **evo:** register the eighteen brain metrics and the MemorySummary log ([3fa5960](https://github.com/james-r-parker/simulation/commit/3fa5960a44c71bc6cb68072c3df0f43eaf1b77ca))
* **evo:** report flora patch turnover ([15da835](https://github.com/james-r-parker/simulation/commit/15da835ff40489d6486eae96f923d223bbf2a1fd))
* **evo:** report flora patch turnover ([0195718](https://github.com/james-r-parker/simulation/commit/01957188f82a4408353d882eba6025c2d673cd4f))
* **evo:** social credit pays the actors only ([40a86c1](https://github.com/james-r-parker/simulation/commit/40a86c1156bb8e7af5c57f441ed26d552b4ed1d6))
* **evo:** the discrimination checks for the pooled-v2 inputs ([af62f1d](https://github.com/james-r-parker/simulation/commit/af62f1db63ec9265f834e57d20f8bbf2d78618c4))
* **evo:** training drills and npm run drill (training Phase 1) ([#313](https://github.com/james-r-parker/simulation/issues/313)) ([c5518b0](https://github.com/james-r-parker/simulation/commit/c5518b048a39e75b51cd9d758286a6568cff882c))
* **flora:** add deterministic seasonal fruiting windows ([a9bee90](https://github.com/james-r-parker/simulation/commit/a9bee90b3a8c687eb266615064d10ee1a8af608a))
* **flora:** add food hue sensing and toxin sickness ([0d1c416](https://github.com/james-r-parker/simulation/commit/0d1c41601845e97cfe69664fe2d49ee2e774576a))
* **flora:** add pollination and evolving patches ([014195c](https://github.com/james-r-parker/simulation/commit/014195c8ce0235f5a13456a7753ced12f1d6db7d))
* **flora:** add species, fruiting seasons and persistent fungus ([13a5b1b](https://github.com/james-r-parker/simulation/commit/13a5b1b6608be9079db720ad6698cea722f083f2))
* **flora:** add the flora appearance quality item ([92bea83](https://github.com/james-r-parker/simulation/commit/92bea834f185375ac8e5b5b517f94c0ff5920461))
* **flora:** add toxin dose, sickness and recovery ([6e32da1](https://github.com/james-r-parker/simulation/commit/6e32da1099296c62bbeb574d1587d2b920d82fbc))
* **flora:** adopt measured toxin dose ([9d30c58](https://github.com/james-r-parker/simulation/commit/9d30c58873abf836801a2583b1c847b091b406b1))
* **flora:** age depleted patches and soil seed banks ([5bde471](https://github.com/james-r-parker/simulation/commit/5bde471c53209c33db6de8306c9d978e40d3fdd2))
* **flora:** allocate a living patch pool ([7ec2c70](https://github.com/james-r-parker/simulation/commit/7ec2c7095fd63eff43db0bc9ea2136f8cc338340))
* **flora:** blend and mutate inherited patch traits ([4f61c87](https://github.com/james-r-parker/simulation/commit/4f61c87c619af672de680763aa917e7415b409a4))
* **flora:** carry food hue through rays and pooling ([0c40b5a](https://github.com/james-r-parker/simulation/commit/0c40b5aaf0e2dd0726c8b624df94c7188f484fcd))
* **flora:** carry pollen and seed local descendants ([accfd30](https://github.com/james-r-parker/simulation/commit/accfd30cd15b665d5712da708c5fdb5a781b4ac5))
* **flora:** expose plant and pollen state to snapshots ([216f4e0](https://github.com/james-r-parker/simulation/commit/216f4e09c0b40f77743f7659061172c2a0bcb000))
* **flora:** fruit fungus locally on persistent death marks ([e474219](https://github.com/james-r-parker/simulation/commit/e47421911aaa29aacf20e360916a8a5bfcb0ff51))
* **flora:** fruit toxic caps in the starting patch mix ([502a64f](https://github.com/james-r-parker/simulation/commit/502a64f9cb416355275453aed0a060d24d162462))
* **flora:** map plant hues to a bounded colour ramp ([8ceb35e](https://github.com/james-r-parker/simulation/commit/8ceb35e70f1c5cb8a845f78a68336fff66410160))
* **flora:** measure pollination and inherited hue spread ([00992a3](https://github.com/james-r-parker/simulation/commit/00992a3429f0db2aab946c1cee718d0d879366e7))
* **flora:** measure toxin exposure, sickness and deaths ([ebb72f7](https://github.com/james-r-parker/simulation/commit/ebb72f772dd8d12f739f463b2093a5338896b886))
* **flora:** render distinct plant shapes and hues ([6f46efe](https://github.com/james-r-parker/simulation/commit/6f46efeda62f00173ce5f220c6e398672e8584a5))
* **flora:** render plant, pollen, and sickness appearance ([d7f552d](https://github.com/james-r-parker/simulation/commit/d7f552d63f6093e1df6da920f5e748e4ad5277c7))
* **flora:** report sickness and poison deaths ([e78cf5a](https://github.com/james-r-parker/simulation/commit/e78cf5a31aae538f4a762ab962263c4a91348570))
* **flora:** retain death sites as lasting mycelium marks ([913e46c](https://github.com/james-r-parker/simulation/commit/913e46cc1829a1b68aaf0074e842f319bc0878f7))
* **flora:** show patch blooms and carried pollen ([e4b8738](https://github.com/james-r-parker/simulation/commit/e4b8738df2cb92268cde73c0ba077d7cc3fb820f))
* **flora:** show sickness in agent appearance ([cc6eeb0](https://github.com/james-r-parker/simulation/commit/cc6eeb0f2b1db6250ab468337d58aa1af9b14cdc))
* **flora:** spawn and age food by species and fruiting season ([76c9845](https://github.com/james-r-parker/simulation/commit/76c98450fcdab9e3b1582a9a8874874e23b894e2))
* **flora:** store and hash species traits on patches and items ([db226f4](https://github.com/james-r-parker/simulation/commit/db226f4e7efa4111764e726b58fd63334b73a62d))
* **flora:** validate species archetypes and replace scalar food keys ([9113b2f](https://github.com/james-r-parker/simulation/commit/9113b2f6537a9d3fd42a56570a0b02b6eb81ed8c))
* **flora:** version the 83-input hue layout ([c9921af](https://github.com/james-r-parker/simulation/commit/c9921af80d12ff8bf256256ee45d680d8172f81a))
* **gates:** bench-compare --self and noise dispatch, nightly-failure issue (Phase 3 T17, T21) ([#325](https://github.com/james-r-parker/simulation/issues/325)) ([2f2d8a8](https://github.com/james-r-parker/simulation/commit/2f2d8a87cb843fe1ed79f2ef3cf03aea0dbab733))
* **gates:** busy-aware bench-check, load-scaled timeouts, CPU lock in check.sh, advisory perf job ([#310](https://github.com/james-r-parker/simulation/issues/310)) ([17b9b8e](https://github.com/james-r-parker/simulation/commit/17b9b8e1b6fd362d2bce379b3d5427d34029d2dd))
* **herds:** add herdBodyRadius so the herd body can be smaller than its graze reach ([dc89fb6](https://github.com/james-r-parker/simulation/commit/dc89fb6ba89e3cba3983521e7af6300c51a943fe))
* **library:** gene library modules, D1 migration and SQL tests ([#311](https://github.com/james-r-parker/simulation/issues/311)) ([240cf8d](https://github.com/james-r-parker/simulation/commit/240cf8d7eb96e35cbf3f119e00d82c77393ed3d3))
* **library:** store champion files and the release index in D1, no R2 ([#320](https://github.com/james-r-parker/simulation/issues/320)) ([d0243cb](https://github.com/james-r-parker/simulation/commit/d0243cbf65c0e67359f635ec75bf95026eb336f3))
* **look:** lineage hues, a wake behind movers, lit rock relief and a ground surface ([e77d140](https://github.com/james-r-parker/simulation/commit/e77d1404a4e8538cf547b73190c01dbf013dde51))
* **look:** make the blobs the stars and give the world a surface ([f447875](https://github.com/james-r-parker/simulation/commit/f4478751063e0691c565b3130f50a511f0acfcba))
* **mega:** add herd life and carcass sharing ([46d506d](https://github.com/james-r-parker/simulation/commit/46d506d2e660470e319cb5d0526e342f6f090d0e))
* **mega:** add herd scene detectors ([b3b99c6](https://github.com/james-r-parker/simulation/commit/b3b99c66e17743a8852a6d1576f6da0b49ca18fd))
* **mega:** build walking herds and rendering ([a188a3f](https://github.com/james-r-parker/simulation/commit/a188a3f92f97420f5d2804b0569155e047a5f910))
* **mega:** complete herd scene diagnostics ([146a9fe](https://github.com/james-r-parker/simulation/commit/146a9fe811a53c4752de329b18b065f791144506))
* **mega:** complete Phase 1 herd mechanics ([5158921](https://github.com/james-r-parker/simulation/commit/515892173cc64420f446338ff41638335c0de3a9))
* **mega:** create seeded herd state ([8e3c10b](https://github.com/james-r-parker/simulation/commit/8e3c10b8d53f6b54cb7f827ec6e2741c0188b59c))
* **megafauna:** add dung zones ([e69d77f](https://github.com/james-r-parker/simulation/commit/e69d77f0505623147a3cb99256d6164d1bccf2ed))
* **megafauna:** add herd and zone snapshot parts ([7a170da](https://github.com/james-r-parker/simulation/commit/7a170da10c63d0ea881f6be9c43f978cf249c050))
* **megafauna:** add herd group colours ([a6003eb](https://github.com/james-r-parker/simulation/commit/a6003eb74faab90899ad404d6012a8c2686f1b0c))
* **megafauna:** add herds look control ([ca373bf](https://github.com/james-r-parker/simulation/commit/ca373bf53213ba93908dcf21c23c2aa04a22530a))
* **megafauna:** add phase 2 sense and wary reflex ([#240](https://github.com/james-r-parker/simulation/issues/240)) ([828d638](https://github.com/james-r-parker/simulation/commit/828d63877767db8e385ca7b5042f8978da5c8c7f))
* **megafauna:** adopt phase 1 defaults ([cb834ed](https://github.com/james-r-parker/simulation/commit/cb834ed5c99a92660eab08ef06a768e31bda31f9))
* **megafauna:** adopt Phase 1 herd defaults ([7396097](https://github.com/james-r-parker/simulation/commit/739609756080844f3594ab490b4c94fb29e349b5))
* **megafauna:** carry seeds ([40b400c](https://github.com/james-r-parker/simulation/commit/40b400c3b49bc00a5c6af7bf1b05bd42fa85539e))
* **megafauna:** complete phase 3 dung and seed ecology ([9f3d3c5](https://github.com/james-r-parker/simulation/commit/9f3d3c5462eb4eb9916d49de79ceaad30fe54eb9))
* **megafauna:** measure dung ecology ([7d3c25d](https://github.com/james-r-parker/simulation/commit/7d3c25d4b1fa187aa162cae628e361dde2a130b0))
* **megafauna:** render dung zones ([47f4002](https://github.com/james-r-parker/simulation/commit/47f40029bec99efd065ff83706da6b0109ccb5dc))
* **megafauna:** render phase 4 herds ([091d862](https://github.com/james-r-parker/simulation/commit/091d862db44d1f6153319cb16fba28fada97177b))
* **megafauna:** render shaped moving herds ([921b78d](https://github.com/james-r-parker/simulation/commit/921b78d3df4cb8601fae90f054cf881ff940234b))
* **megafauna:** show stampede dust ([cf0aac8](https://github.com/james-r-parker/simulation/commit/cf0aac86ad04d6b3650b02d519d62aa1c922b0b7))
* **mega:** let herds graze plants ([079d443](https://github.com/james-r-parker/simulation/commit/079d443de3ee048bc4da9e66fd1f6da164437287))
* **mega:** render snapshot herds ([d49c53b](https://github.com/james-r-parker/simulation/commit/d49c53b4470290623dd02728f4c6f145bb558de3))
* **mega:** resolve herd trampling ([42d6e1a](https://github.com/james-r-parker/simulation/commit/42d6e1afc2df285e20d49b79eb6a0ea7499140a3))
* **mega:** route and move herds ([0612c6a](https://github.com/james-r-parker/simulation/commit/0612c6a1fad423a4a9a858b28caed9bf0178dd9f))
* **mega:** stampede from nearby hunters ([2c09ec7](https://github.com/james-r-parker/simulation/commit/2c09ec7d62ba8dac819df265c2fe654fd80e91cb))
* **mega:** validate herd configuration ([449e9eb](https://github.com/james-r-parker/simulation/commit/449e9ebf78e6d9bba13ab94eb09dbea42dc3fc12))
* **perf:** add --look flag to scripts/browser-perf.mjs (T73) ([a6e0e20](https://github.com/james-r-parker/simulation/commit/a6e0e20a60d0d68c4efa40f67e675e1ca4b214e3))
* Phase 4 balancing round, the split rules on by default, and the data ([f649cd8](https://github.com/james-r-parker/simulation/commit/f649cd8e042c817681f9fc17dbc34db0ab1f9d46))
* Phase 4 chunk A, the balance instruments ([5afd177](https://github.com/james-r-parker/simulation/commit/5afd177c4becd83bf4d3e78f666cccc72f8266cd))
* Phase 4 chunk A2, the balance checks ([b00804f](https://github.com/james-r-parker/simulation/commit/b00804fb6d2736bb6ea9599026777a792682e0b3))
* **renderer:** add agent motion cues (wobble and squash) (T65) ([b0f2ddd](https://github.com/james-r-parker/simulation/commit/b0f2ddd99c1b744eb9061d7a329c220d757a6e59))
* **renderer:** add aurora-tint helper and record season on frame ([b34ae64](https://github.com/james-r-parker/simulation/commit/b34ae64235f15570e57c01c1b4ba99bc94fafecf))
* **renderer:** add carcassLook, iAge attribute, decay shader scaling and decay look toggle (T70) ([53823dd](https://github.com/james-r-parker/simulation/commit/53823dd6a54e8897d121e12dee49127243a06f6f))
* **renderer:** add courtship threads and mate-threads layer (T68) ([372a459](https://github.com/james-r-parker/simulation/commit/372a4598d66c50d6aedca305180c582ae3bfdc68))
* **renderer:** add finish-glsl interleaved noise and aurora-layer ([5efb76d](https://github.com/james-r-parker/simulation/commit/5efb76d01baf236833a0bf25158c046bddcb7991))
* **renderer:** add finish-layer with vignette, grain and tiers (T71) ([4f39fa5](https://github.com/james-r-parker/simulation/commit/4f39fa57696dd1c0398a9cf3af344fa1a0cd6279))
* **renderer:** add frostTexture and terrain-layer ([739edad](https://github.com/james-r-parker/simulation/commit/739edad24c677c11d5889f5cfc67c4b2abdac592))
* **renderer:** add look list, lookFor quality tiers and ?look= parameter ([cb94b26](https://github.com/james-r-parker/simulation/commit/cb94b26363de5e06ff328e9a527c5d547c6a7e23))
* **renderer:** add Phase 6 colours, aurora stops and luminance ceilings ([3b3c9a3](https://github.com/james-r-parker/simulation/commit/3b3c9a307522ec972b6f5fb081d1e3afa69d6e29))
* **renderer:** add rock-shape procedural geometry and pack helper ([66ed46e](https://github.com/james-r-parker/simulation/commit/66ed46e0f2b720081f9a7ad247b99c678fd52c43))
* **renderer:** Phase 6 - Look (T57–T75) ([e2cd534](https://github.com/james-r-parker/simulation/commit/e2cd534cc4e0738923cbddae4ddbabada5bf2e18))
* **renderer:** rebuild obstacles as two-pass rock shader with rim and body ([93d2785](https://github.com/james-r-parker/simulation/commit/93d2785328d9706532391f6df647a03e97117bf2))
* **scripts:** viability-table prints the Phase 4 viability table per report ([3bcce28](https://github.com/james-r-parker/simulation/commit/3bcce2882ee04d82f157764ae3282308c65766d2))
* **sim:** a per-specialisation energy store, maxEnergyMultiplier ([b1d40c6](https://github.com/james-r-parker/simulation/commit/b1d40c6b1885d9827de9f0ab963f2459d7eb377e))
* **sim:** add the skip block, the only path from the pooled values to the outputs ([c18b9c9](https://github.com/james-r-parker/simulation/commit/c18b9c95744bac0a1565f0db2da35167ce61a368))
* **sim:** adopt the flip reflex and hunter territory; delete the losing switches (hunter-learning C) ([#277](https://github.com/james-r-parker/simulation/issues/277)) ([0dc3f53](https://github.com/james-r-parker/simulation/commit/0dc3f53ca856b4562335f32a749d57e96458edba))
* **sim:** adopt the realistic keepers by default, delete provisioning (realistic-keepers Phase 2) ([#328](https://github.com/james-r-parker/simulation/issues/328)) ([f9b39bc](https://github.com/james-r-parker/simulation/commit/f9b39bc5556392a8079e7bf69d09675c37b10efe))
* **sim:** adopt the survival-screen arm as the defaults ([5c6b483](https://github.com/james-r-parker/simulation/commit/5c6b4830f1870213675eb2e2b4f61269789b0f14))
* **sim:** chance-free breeding, and an ambush counts as deliberate ([0d12ad0](https://github.com/james-r-parker/simulation/commit/0d12ad0b42f3bbbbf6f1bf456bc8cc03b7c14df7))
* **sim:** cover concealment, a plant-free ring interior and denser refuges (refuge.md chunk C) ([#289](https://github.com/james-r-parker/simulation/issues/289)) ([e02bf03](https://github.com/james-r-parker/simulation/commit/e02bf033d00e782e3eb43a48fd5286854a8dfd87))
* **sim:** default leakGeneStart to 0 ([ba0978e](https://github.com/james-r-parker/simulation/commit/ba0978e94a58c8a70e5da3301dda601228105045))
* **sim:** default leakMin to 0.02 ([546ff39](https://github.com/james-r-parker/simulation/commit/546ff390dfcaa7d15c45df0c5c28b1a2aef6c095))
* **sim:** delete the season inputs ([383fcc2](https://github.com/james-r-parker/simulation/commit/383fcc2e7bc08fc8ea41fbdf9efd97142c0d6be1))
* **sim:** delete the SPLIT genes ([94b71fc](https://github.com/james-r-parker/simulation/commit/94b71fc15f5c23adafcb8bf424a4cc0399044b12))
* **sim:** hunter and meal-heat switches, default off (T52, T55, T56) ([#265](https://github.com/james-r-parker/simulation/issues/265)) ([59672ca](https://github.com/james-r-parker/simulation/commit/59672ca5a3fb85f40884752bda4d47397917e38a))
* **sim:** hunter death ledger and hunter row metrics (T53) ([#262](https://github.com/james-r-parker/simulation/issues/262)) ([a266d8e](https://github.com/james-r-parker/simulation/commit/a266d8ee7b74a5463db39d850ea334bf5a5181ab))
* **sim:** hunter territory, and flip with territory teaches hunters to kill (E121-E123) ([#276](https://github.com/james-r-parker/simulation/issues/276)) ([14972ae](https://github.com/james-r-parker/simulation/commit/14972aef740c2b8d79a553319578a55bdca0a1d6))
* **sim:** hunter-learning mechanisms - provisioning, juvenile burn, flip reflex (chunk A2) ([#273](https://github.com/james-r-parker/simulation/issues/273)) ([321d567](https://github.com/james-r-parker/simulation/commit/321d567619224327c18b1189b5abcbad5c859e19))
* **sim:** make the leak floor a config key, leakMin ([a879758](https://github.com/james-r-parker/simulation/commit/a879758ba26a577d8b2d3257f85e2d34271d976a))
* **sim:** make the silent-input mask world state ([01d31cb](https://github.com/james-r-parker/simulation/commit/01d31cb268d4884dc71ac371d1a6873c28d823ce))
* **sim:** mate rank replaces energy and merit as the female's choice ([73b11e1](https://github.com/james-r-parker/simulation/commit/73b11e10086b80e64f23ba6f93db1c81559896b3))
* **sim:** mating-edge screen instruments - prey_summer_min and the roaming mate range (world-balance Phase 6 T97, T99) ([#356](https://github.com/james-r-parker/simulation/issues/356)) ([0b49716](https://github.com/james-r-parker/simulation/commit/0b49716fc09efd8153fd5aaeb68f668286f5098d))
* **sim:** one kill rule and known-answer tests for the core metrics (metric-trust T12 to T14) ([#372](https://github.com/james-r-parker/simulation/issues/372)) ([7186232](https://github.com/james-r-parker/simulation/commit/71862322f7b8a38a2fa9f0d6a0fd4540a10b7b60))
* **sim:** recoil for a hunter that lunges at what it may not bite ([3162d4c](https://github.com/james-r-parker/simulation/commit/3162d4ce81bf6a5c4a49adf7134f582aa58c50f7))
* **sim:** refuge clusters, eight refuges and a 200 px wall gap ([a5f5c32](https://github.com/james-r-parker/simulation/commit/a5f5c321187f9d8875c085e99734816118d21f61))
* **sim:** refuge sense inputs behind refugeSense (refuge.md chunk F) ([#292](https://github.com/james-r-parker/simulation/issues/292)) ([12d9ba4](https://github.com/james-r-parker/simulation/commit/12d9ba4682e775fc9439f1e189d247861be38a8c))
* **sim:** restore reward-gated learning, cover concealment and plant-free rings behind switches (realistic-keepers chunk B) ([#298](https://github.com/james-r-parker/simulation/issues/298)) ([fe1b598](https://github.com/james-r-parker/simulation/commit/fe1b598e34745826840a2ac78c48666a124b652f))
* **sim:** restore satiation, post-kill rest, provisioning and juvenile dependency behind switches (realistic-keepers chunk A) ([#296](https://github.com/james-r-parker/simulation/issues/296)) ([d780477](https://github.com/james-r-parker/simulation/commit/d780477efea9c11adcbf98b96dc2ffd58b869e77))
* **sim:** reward-gated Hebbian learning and its controls (hunter-learning chunk D) ([#278](https://github.com/james-r-parker/simulation/issues/278)) ([02dedcd](https://github.com/james-r-parker/simulation/commit/02dedcd21789afbb1b76c53c1d6ca2c9e3f27f7c))
* **sim:** satedBite brake and the hunter territory plan (E119, E120) ([#275](https://github.com/james-r-parker/simulation/issues/275)) ([a0d8296](https://github.com/james-r-parker/simulation/commit/a0d82965b421ba6271b30764f997fb8b7d8c1f11))
* **sim:** seeder entrants start poor ([08f6c3a](https://github.com/james-r-parker/simulation/commit/08f6c3a5a9304fa297305f273203964afd185237))
* **sim:** splitClonalMax, the clonal cap on asexual lines ([4708165](https://github.com/james-r-parker/simulation/commit/47081656265c7db56dd4aa6ccb360676205431e9))
* **sim:** splitMateScarceTicks, the shark rule for splitting ([291857d](https://github.com/james-r-parker/simulation/commit/291857d732ec208adb83339b6cff329aea9cde72))
* **sim:** the economy and spec budgets as defaults ([07a1182](https://github.com/james-r-parker/simulation/commit/07a118272173a44ed975e94774993d343cb0fbdf))
* **sim:** the floor as a total-extinction guard, and delete the entrants it replaces ([cf521ff](https://github.com/james-r-parker/simulation/commit/cf521ff8a77fe64057838bf20967769446488f64))
* **sim:** the mate rank's kill count reads the fatal bite (metric-trust T15, T15a, E147) ([#376](https://github.com/james-r-parker/simulation/issues/376)) ([5c45111](https://github.com/james-r-parker/simulation/commit/5c45111646b82b71132ad6e401c8513a2359166d))
* **sim:** the pooled-v2 input layout, with the pooled rays as the only layout ([00de7a2](https://github.com/james-r-parker/simulation/commit/00de7a298bd9c7417c6a66d1cc4e1cc7f43b8e6c))
* **sim:** the prey-scaled bite cost ([9e8e1cc](https://github.com/james-r-parker/simulation/commit/9e8e1cc06403b6a015211690aaa3f0584ba31a24))
* **sim:** the proof rule for the archive and the split brake ([c2da410](https://github.com/james-r-parker/simulation/commit/c2da4106c8f567306232a43fa66e6874e35d9ac9))
* **sim:** the shark rule and the clonal cap on by default, their off paths gone ([34933e1](https://github.com/james-r-parker/simulation/commit/34933e134f403bfa914bf12b51b475a18672675f))
* **sim:** top-2 hits per channel in the pooled input row ([a40bbaf](https://github.com/james-r-parker/simulation/commit/a40bbaf435de3eea12d44b3f87b94ce784137bc0))
* **sim:** widen food snapshot record to 4 words for carcass age (T69) ([edc7cd7](https://github.com/james-r-parker/simulation/commit/edc7cd7adbe42423af65a2575b6ce9520d8f9a5f))
* the natural-selection and brain big bang, with survival defaults ([fffdabc](https://github.com/james-r-parker/simulation/commit/fffdabc37b2f55aaf97fb30c3bdbea346ff33c2a))
* **ui:** open inspector drawer on agent selecting click (T72) ([82c9f21](https://github.com/james-r-parker/simulation/commit/82c9f21b739231bfca8aabeefeb93b0711448584))
* **ui:** phone layout for the HUD ([de4d754](https://github.com/james-r-parker/simulation/commit/de4d754a61067367d6e180e38dfa91adb02e82ef))
* **wasm:** brain forward pass in a Rust/WASM kernel, bit-identical, 3x faster (wasm-kernels Phase 1) ([#316](https://github.com/james-r-parker/simulation/issues/316)) ([3d73aeb](https://github.com/james-r-parker/simulation/commit/3d73aeb7e020bec20811524933fcdee4126210e1))
* **wasm:** ray march in the Rust kernel, JS ray march deleted (wasm-kernels Phase 2) ([#330](https://github.com/james-r-parker/simulation/issues/330)) ([4b06605](https://github.com/james-r-parker/simulation/commit/4b066055743ec8f087142b5435f723eeacc0e863))
* **wasm:** Rust brain kernel is the only brain path; Rust microbenchmarks (wasm-kernels T7, T8) ([#324](https://github.com/james-r-parker/simulation/issues/324)) ([1997dc5](https://github.com/james-r-parker/simulation/commit/1997dc5b46d0468da4d9116e97f71b11ff5edfa9))
* **wasm:** spatial hash, pheromone field and physics in the Rust kernel (wasm-kernels Phase 4) ([#336](https://github.com/james-r-parker/simulation/issues/336)) ([aa2d22f](https://github.com/james-r-parker/simulation/commit/aa2d22f2ad247b216a53b0c2ebefd1dae373f4a3))
* **web:** designed icon set, share card, full head and installable manifest ([#332](https://github.com/james-r-parker/simulation/issues/332)) ([c0d88a8](https://github.com/james-r-parker/simulation/commit/c0d88a8d5d0f5992d8a46a485313314a1e95b670))
* **worker:** add MATED effect and re-pin effect stream hash (T66, T67) ([077cc1e](https://github.com/james-r-parker/simulation/commit/077cc1e2e3a8fe45ea6155c4b3d31a16144d42a0))
* **worker:** add terrain refuges to worldInfo ([862b895](https://github.com/james-r-parker/simulation/commit/862b895dfbde407d1a420c87ff6e7ceebb2fb3fe))


### Bug Fixes

* **agents:** scale the motion speed cue by the world's maxVelocity ([3717e02](https://github.com/james-r-parker/simulation/commit/3717e02075f9eb758f742dd39d81a2bd4c8c0ff7))
* **app:** address the mobile-view conformance review ([1aab921](https://github.com/james-r-parker/simulation/commit/1aab9218ac78dbc63f799bcf2cf1e9a81358fa91))
* **archive:** check the brain layout name when decoding an archive ([e1c442c](https://github.com/james-r-parker/simulation/commit/e1c442ca83cceca324dc2d8e0f72d28a9f088422))
* **aurora-layer:** accept optional options parameter ([d51db1b](https://github.com/james-r-parker/simulation/commit/d51db1b8955d6bbd87820c8cb2c1b7d084261761))
* **bench:** copy the Vitest config's own modules into the ref tree ([#314](https://github.com/james-r-parker/simulation/issues/314)) ([75d61b9](https://github.com/james-r-parker/simulation/commit/75d61b9a16e323d377c76c7d1a2ec8edcfdf8bc0))
* **bench:** pass a millisecond metric whose rise is below 0.005 ms ([#322](https://github.com/james-r-parker/simulation/issues/322)) ([662fa53](https://github.com/james-r-parker/simulation/commit/662fa536f9c57acd2efc5934393f5715388f26e2))
* **browser-perf:** honor viewport over CDP ([#246](https://github.com/james-r-parker/simulation/issues/246)) ([64a66de](https://github.com/james-r-parker/simulation/commit/64a66de983e2adf55bba553c1469d77a228a6030))
* **build:** hash every built asset name so a deploy never mixes versions ([12c5ecf](https://github.com/james-r-parker/simulation/commit/12c5ecfa997f7c70b61e8f6801258bfe9d1b4c87))
* **build:** never open a browser from vite preview or the browser smoke ([#338](https://github.com/james-r-parker/simulation/issues/338)) ([effe95a](https://github.com/james-r-parker/simulation/commit/effe95a1c4c998b3f6baa7aae80700819a83441e))
* **check:** run the tests without the hook's GIT_DIR and GIT_INDEX_FILE ([#374](https://github.com/james-r-parker/simulation/issues/374)) ([0ccd063](https://github.com/james-r-parker/simulation/commit/0ccd06386991448fe5c860f479ff39f423fda78b))
* **deps:** move BURN_IN_TICKS to a leaf module ([46ce90d](https://github.com/james-r-parker/simulation/commit/46ce90de4efdcb380d922bafd851f588dd9bc275))
* **disease:** break the disease, energy and world import cycle ([7e7c598](https://github.com/james-r-parker/simulation/commit/7e7c5987bfa963580e09ebd17337c10c017693ad))
* **disease:** make the infected speckle readable at normal zoom ([5668b85](https://github.com/james-r-parker/simulation/commit/5668b85fda5f0ab5d988292dfa9f4fa81eefd77f))
* **evo:** pearson is NaN for a sample constant to within rounding ([dc939ba](https://github.com/james-r-parker/simulation/commit/dc939ba8ca0e6fe66ee662e6abd67d7c4e6bacaf))
* **evo:** screen readings the hunter screens misread (T60) ([#263](https://github.com/james-r-parker/simulation/issues/263)) ([da7626f](https://github.com/james-r-parker/simulation/commit/da7626fdf57619772d406852bfc3a5d75dab8dc8))
* **evo:** the group-hunt probe's wall costs nothing, so an idle hunter cannot win ([8a2e9a8](https://github.com/james-r-parker/simulation/commit/8a2e9a8d123ed850d04367faa5bbc296b54cd668))
* **genome:** carry and check the brain layout name in a genome ([158837e](https://github.com/james-r-parker/simulation/commit/158837effe60e3432c579c7c2eb2b2f897db0f44))
* **league:** stamp and check the brain layout name in champion files ([794896a](https://github.com/james-r-parker/simulation/commit/794896af5a3a93986746a622b9df160dfa344f65))
* **mega:** correct snapshot and herd types ([1eb38fc](https://github.com/james-r-parker/simulation/commit/1eb38fc6810fcd84208a052636cc868faf49e475))
* **megafauna:** draw herds as outlined bodies that can be seen ([#248](https://github.com/james-r-parker/simulation/issues/248)) ([554f8e4](https://github.com/james-r-parker/simulation/commit/554f8e4a152fc587282dc46ef76da5c8bcdf8562))
* **mega:** pin herd effects and clear clone gate ([848f4e7](https://github.com/james-r-parker/simulation/commit/848f4e7fb3390a48f2da87c0be087210f12bc7a2))
* **mega:** prevent herd rock overlaps ([6852748](https://github.com/james-r-parker/simulation/commit/68527484cdd753ec38354789d430ba3ee0f64a09))
* **public:** drop the dead /assets/index.css link from the about and blog pages ([f417b97](https://github.com/james-r-parker/simulation/commit/f417b9733e8bf204f34b39aa7b575c7deb7b2121))
* **renderer:** cap the device pixel content box at ratio 2 ([ac1ad77](https://github.com/james-r-parker/simulation/commit/ac1ad77ab44f5816f39cd2ea42bd350458029b9d))
* **renderer:** make herd discs easier to see ([5d52b89](https://github.com/james-r-parker/simulation/commit/5d52b890c68f6defcd22cbe2cc87fe508dba37c0))
* **renderer:** make herd discs easier to see ([95d36d9](https://github.com/james-r-parker/simulation/commit/95d36d9fab089c36726b27acffdb102e9a57cec6))
* **renderer:** make terrain, finish and aurora shaders compile and draw ([513fcff](https://github.com/james-r-parker/simulation/commit/513fcffbe3f07263985394aa82942461748f6926))
* **renderer:** strengthen herd group markers ([b2094a8](https://github.com/james-r-parker/simulation/commit/b2094a8eae0b30b456767fd503579efdbecb6650))
* resolve typecheck errors and deduplicate smoothstep ([5d7b3f4](https://github.com/james-r-parker/simulation/commit/5d7b3f439dfa21f90f7e1d26f0f9806a365aadb6))
* **rocks:** shade the body from world position only so a ridge reads as one mass ([580796f](https://github.com/james-r-parker/simulation/commit/580796f9d5ca79271b2ddd2a481ce54bc57ae524))
* **scripts:** make the scripts branch ratchet independent of measured speeds ([#373](https://github.com/james-r-parker/simulation/issues/373)) ([5256308](https://github.com/james-r-parker/simulation/commit/5256308504004883b216b87dd886a9de58c301e2))
* **threads:** allocate nothing per frame, honour the level-1 segment count, hide on ?look=none ([cda51ef](https://github.com/james-r-parker/simulation/commit/cda51ef2f1bd11e31ad07c26210fe5c225637a56))
* **types:** accept a brainLayout result in layoutStamp ([db05d52](https://github.com/james-r-parker/simulation/commit/db05d528d708992d64f8f503ef414da38e58466b))
* **types:** type threadCurve's out as number[] and guard the packed bucket in its test ([bf8b699](https://github.com/james-r-parker/simulation/commit/bf8b69927bbd2b5ceb030f5150e979f0a6a12048))


### Performance Improvements

* **agents:** motionOf returns one shared scratch instead of an object per agent ([859f2a3](https://github.com/james-r-parker/simulation/commit/859f2a33d0ede3dcece85c484cf3c5022bf75273))
* **evo:** size drill worlds' food slots to the scenes, count alive foods without allocating (drills +27%) ([#344](https://github.com/james-r-parker/simulation/issues/344)) ([26cd4ec](https://github.com/james-r-parker/simulation/commit/26cd4ec8818ea4eea8dd0ced87c0a2895ed3ac87))
* **interpolate:** blend each angle along one shortest arc and keep scratch in a Float64Array ([ed5fb34](https://github.com/james-r-parker/simulation/commit/ed5fb348d8d0e4cbc95dc8d45f01a9804278ba48))
* Phase 4 chunk B, the step speed-ups and baseline ([16b049c](https://github.com/james-r-parker/simulation/commit/16b049c0034ad66be6f06b73e193f2444347ae87))
* **sim:** appendFixtures tests reach before writing a row ([fe4522f](https://github.com/james-r-parker/simulation/commit/fe4522f8042dd977d12f24bced8c95bbb6b8eb35))
* **sim:** circle-major ray casting and a cheaper herd reject (speed pass 2) ([#308](https://github.com/james-r-parker/simulation/issues/308)) ([db9bb5a](https://github.com/james-r-parker/simulation/commit/db9bb5aeaa49233b3946524fc906b56ae9f5e71f))
* **sim:** hebbianStep reads the gene outputs once per agent ([5e824c5](https://github.com/james-r-parker/simulation/commit/5e824c511327fcdcca552981286c6e87a28f4a67))
* **sim:** one-axis obstacle reject and direct row writes in the ray gather (speed pass 3) ([#319](https://github.com/james-r-parker/simulation/issues/319)) ([8cf1ccd](https://github.com/james-r-parker/simulation/commit/8cf1ccd103e425ff9a1a30846b705d1f92d17a0b))
* **sim:** one-axis reject in the herd contact and startle loops (T73) ([#321](https://github.com/james-r-parker/simulation/issues/321)) ([e8904ad](https://github.com/james-r-parker/simulation/commit/e8904ad986a9c65e168e28ada98b1ab8ce70a273))
* **sim:** outputStep walks the hidden-to-output block row by row ([c331a25](https://github.com/james-r-parker/simulation/commit/c331a259bc83c19c5d6183a92228aa863e4b7d52))
* **sim:** restore the cheap-tests-first order in the mate scan ([#358](https://github.com/james-r-parker/simulation/issues/358)) ([304fbd9](https://github.com/james-r-parker/simulation/commit/304fbd9af1a71580e938c1e0348cf0d5378e2cf0))
* **sim:** step drift pass - herd grazing, hash build and gather (natural-selection T61-T63) ([#280](https://github.com/james-r-parker/simulation/issues/280)) ([98d595d](https://github.com/james-r-parker/simulation/commit/98d595dabf13920c196c90434d7f4a55e223e5ab))
* **wasm:** profile after the kernels, re-record the baseline, squeeze drills +36% (wasm-kernels Phase 5) ([#342](https://github.com/james-r-parker/simulation/issues/342)) ([5f85ab5](https://github.com/james-r-parker/simulation/commit/5f85ab5dc9357b9fb161680e94c3d94df6d948b5))
