# Apex Turismo roadmap

Rewritten 2026-09-25 on branch `physics-roster-ui` (supersedes the 2026-09-04 phased plan; its items are folded into the milestones below). Effort: **S** an evening, **M** a weekend, **L** a week or more.

## Current state (2026-09-25)

Working, playable, single-player. Everything below was re-run on 2026-09-25 against commit `ddc84c9` and its result pasted, not remembered.

| Area | What works | Verified by |
|---|---|---|
| Circuits | Ten OSM-traced circuits with elevation and corner names (`public/tracks/*.json`); tight-corner kinks relaxed to a 13 m minimum radius at load | `src/track/track.test.ts` sweeps every circuit at seven lateral offsets, no height step over 0.16 m |
| Physics | Four-wheel spring/damper rigid body, combined-slip tyre model with load sensitivity and relaxation, Ackermann steering, aero, torque-curve engine, hunting-free automatic gearbox, ABS/TCS (`src/physics/`) | `vehicle.test.ts`, `tyre.test.ts`, `gearbox.test.ts` (108 gearbox scenarios across the roster) |
| Roster | 46 cars across N100 to Gr.1 in `src/data/cars/`, 14 GLB bodies in `public/models/cars/` (9 community models plus 5 procedural moulds) | `src/data/cars.test.ts` |
| Racing | AI opponents on an optimised racing line with overtaking and recovery; rolling/standing starts; replays with trackside cameras | `race.test.ts`, `launch.test.ts`, `pace.test.ts` (AI completes at least two clean laps of Suzuka in 400 s) |
| Track scene | Procedural road, curbs, barriers, run-off, per-circuit dressing specs, terrain | `terrain.test.ts`, `trackScene.test.ts` |
| Audio | Synthesised engines (worklet), tyres, ambience, UI sounds | `src/audio/audio.test.ts` |
| Career | Credits, garage, dealership, tuning, events, time trials, lap records; profile in `localStorage` (`src/core/Save.ts`, `SAVE_VERSION = 1`) | typecheck only, no unit tests |
| Input | Keyboard, gamepad, wheel with in-game mapping wizard (`src/core/Input.ts`, `InputBindings.ts`) | typecheck only |

Checks run 2026-09-25 (Node v22.23.1):

```
npx vitest run   ->  Test Files 11 passed (11)  Tests 236 passed (236)  Duration 11.71s
npm run lint     ->  clean (eslint src --ext .ts, no output)
npm run build    ->  tsc --noEmit ok; dist/assets/index-*.js 989.34 kB (gzip 288.05 kB), css 23.00 kB
```

Not verified this session: nobody opened the game in a browser on 2026-09-25. The last visual pass was 2026-09-04 (`docs/screenshots/`). The suite is headless vitest and does not exercise rendering, audio output or input devices.

## Known gaps and bugs

- **989 kB main bundle, one chunk.** `vite.config.ts` sets `chunkSizeWarningLimit: 2000`, which silences the warning rather than fixing it. Three.js and all 46 car specs, 10 dressing specs and every UI screen ship in one file; nothing is lazy-loaded except track JSON and GLBs at runtime.
- **AI pace is a plausibility test, not a regression test.** `src/race/pace.test.ts` only asserts `bot.lap >= 2` after 400 simulated seconds. The 2026-09-02 note that AI laps were about 30 percent slower than real-world times has not been re-measured since the 2026-09-04 tyre and gearbox rework. Status: unverified.
- **No CI.** There is no `.github/workflows/`. The husky pre-commit hook runs `lint-staged` (prettier + eslint on staged `src/**/*.ts`) and `npm run typecheck`; it does not run the tests or the build, so a commit can land with a red suite.
- **Tests silently skip if track data moves.** `race.test.ts`, `launch.test.ts` and `pace.test.ts` use `it.skipIf(!existsSync('public/tracks/<id>.json'))`; a renamed asset directory would turn three test files green without running them.
- **Two files over the 500-line limit:** `src/physics/Vehicle.ts` (538) and `src/core/GameApp.ts` (523). The next physics feature (tyre temperature) or app feature (qualifying flow) should split them first.
- **Tools are outside lint and typecheck.** `eslint src` and `tsconfig.json` (`include: ["src", "vite.config.ts"]`) skip `tools/uipreview`, `tools/trackviewer` and `tools/audiopreview`. `tsconfig.harness.tmp.json` is tracked, referenced by nothing, and was a one-off include of `tools/uipreview`.
- **`.gitignore` disagrees with the index.** It ignores `tools/cars/real_sources` and `tools/cars/previews`, but 11 source GLBs (31 MB) and 27 preview PNGs were committed before the rule was added, so the ignore is a no-op and every clone carries them. Shipped models in `public/models/cars/` are a further 51 MB.
- **Stale doc:** `tools/cars/README.md` still describes a "9-car roster"; `public/models/cars/index.json` lists 14 models and the game roster is 46 cars.
- **Save format has no migration path.** `SAVE_VERSION = 1` is written but never checked on load (`src/core/Save.ts`); any schema change will need a migration function before it ships.
- **Branch state:** `physics-roster-ui` is two commits ahead of `origin/main` (`66a9bbc`) plus this session's docs commit; nothing has been merged to `main` since 2026-09-04.

## Milestones

### M1. Prove it and keep it proven (S)

- [ ] GitHub Actions workflow on push and PR: `npm ci`, `npm run lint`, `npm run typecheck`, `npx vitest run`, `npm run build`.
- [ ] Browser smoke check on the current branch: title, one race on Red Bull Ring, one replay; save a dated screenshot in `docs/screenshots/`.
- [ ] Turn `pace.test.ts` into a baseline: commit a car x track lap-time table and fail on a 3 percent regression, so the "30 percent slow" question gets an answer that stays answered.
- [ ] Make the track-data `skipIf` guards fail instead of skip when `public/tracks/index.json` exists but a listed track file does not.
- [ ] Delete `tsconfig.harness.tmp.json`, or fold `tools/**/*.ts` into `tsconfig.json` and `eslint` so the previews are typechecked.
- [ ] Fix the "9-car roster" claim in `tools/cars/README.md`; decide what to do about the 31 MB of tracked `tools/cars/real_sources` (see open questions).
- [ ] Open a PR from `physics-roster-ui` to `main` and merge once the workflow is green.

**Done when:** a GitHub Actions run on `main` shows lint, typecheck, test and build all green, and `docs/screenshots/` contains a screenshot dated after 2026-09-25.

### M2. Honest lap times (M)

Time trial becomes the core loop.

- [ ] Track limits: four wheels beyond the curb for a set distance invalidates the lap (time trial) or adds a time penalty (race); sector checkpoints prevent shortcuts; warning strip in the HUD; penalty summary on results.
- [ ] Sector times from the corner list, live delta bar against best lap by arc length, ghost car from saved best-lap replay frames.
- [ ] Camera and game-feel pass: FOV 55 to 72 degrees with speed, spring-lagged chase camera with lateral-G roll, curb and impact shake.
- [ ] Gamepad rumble from skid, curb, ABS/TCS and wall contact.
- [ ] Split `Vehicle.ts` and `GameApp.ts` under 500 lines on the way in.

**Done when:** a test in `src/race/` drives a deliberate corner cut and asserts the lap is invalidated, and a screenshot shows the delta bar and ghost on Suzuka.

### M3. Bundle and startup (M)

- [ ] Split the bundle: vendor chunk for three.js, dynamic import per UI screen, car specs and dressing specs loaded per circuit.
- [ ] Lazy-load GLBs only for the cars entered in the race; keep the showroom on demand.
- [ ] Remove `chunkSizeWarningLimit` from `vite.config.ts` so the default 500 kB warning is the guard again.
- [ ] Draco or meshopt compression on `public/models/cars/*.glb` (currently 5 to 6 MB each).

**Done when:** `npm run build` reports no chunk over 500 kB with the warning limit removed, and the total first-load transfer for the title screen is under 1 MB gzip (measured in the browser network panel, number written here).

### M4. The race weekend (L)

Races get strategy and a story.

- [ ] Tyre temperature, wear and fuel load per wheel; four-tyre glyph and fuel bar in the HUD.
- [ ] Drivable pit lane from each track file with a limiter and a stop box; mandatory-stop endurance events.
- [ ] Short qualifying that sets the grid.
- [ ] AI personalities: aggression, consistency and defensiveness traits; braking-point noise; defensive lines under pressure.
- [ ] Barrier collisions as oriented box vs barrier line with wall friction and angular impulse; light aero and alignment damage with a repair fee.

**Done when:** the pace harness completes an endurance event with a mandatory pit stop for every car class without an off-track excursion, and a screenshot shows the tyre glyph mid-race.

### M5. The career (L)

- [ ] Licence tests: four licences of eight tests each, gold/silver/bronze targets generated by the AI at three skill levels.
- [ ] Tuning depth: gear ratio editor, LSD settings, camber and toe, ride height.
- [ ] Used car market with a seeded weekly rotation.
- [ ] Four more circuits from the OSM pipeline (candidates: Nürburgring GP, Bathurst, Road America, Zandvoort).
- [ ] Versioned save with migration functions and JSON export/import.

**Done when:** `src/data/cars.test.ts` and `src/track/track.test.ts` cover the new content, a test proves the expert AI can reach gold on every licence test, and a save written at `SAVE_VERSION = 1` loads after migration.

### M6. Presentation and platform (L)

- [ ] Photo mode and a replay director that cuts on overtakes.
- [ ] Audio depth: transmission whine, turbo per engine kind, surface-dependent tyre scrub, wind.
- [ ] Rendering: environment reflections on paint, SSAO, cascaded shadows, instanced trees, an automatic quality scaler.
- [ ] Physics and AI in a worker behind SharedArrayBuffer, with a main-thread fallback.
- [ ] Installable PWA with precached assets, deployed to GitHub Pages (`base: './'` is already set).

**Done when:** a public deploy URL loads the title screen, installs as a PWA, and holds 60 fps in a ten-car race on a mid-range laptop (frame-time trace attached to the PR).

## Won't do / out of scope

- Multiplayer or any networking. Single-player only; no backend, accounts or cloud saves. Saves stay in `localStorage`.
- Licensed car or brand names. The roster uses fictional names on freely licensed or procedural models (credits in `public/models/cars/CREDITS.md`); this will not change.
- Mobile-first or touch-first design. A mobile-aware preset is in M6; a phone-first UI is not planned.
- VR, ray tracing, or a second renderer. Three.js WebGL is the renderer.
- Hand-modelled hero cars. Cars come from the Blender pipeline in `tools/cars/`; one-off manual modelling is out.
- Any change to the physics that is not covered by a test in `src/physics/` or `src/race/`.

## Open questions for the owner

1. **Merge target.** `physics-roster-ui` has been the working branch since 2026-09-04 and `main` is frozen at `66a9bbc`. Merge to `main` now via PR (M1), or keep working on the branch?
2. **Tracked generator inputs.** `tools/cars/real_sources/` (31 MB of third-party GLBs) and `tools/cars/previews/` are both in `.gitignore` and in the index. Keep them tracked, move to Git LFS, or remove from history and document a download step in `tools/cars/README.md`?
3. **AI pace target.** Is matching real-world lap times the goal (which argues for the baseline table in M1 and a realism pass), or is "fun and competitive" enough, in which case the 30 percent gap is fine and the catch-up/personality work in M4 matters more?
4. **Deploy target.** GitHub Pages from `main` (free, fits `base: './'`) or somewhere else? This decides whether M6's PWA work needs cross-origin isolation headers for the worker.
5. **Node version.** Development is on Node 22. Pin it in `package.json` `engines` and `.nvmrc`, or leave floating?
6. **Repository visibility.** The GitHub repo is private. Is it meant to stay private, or should the licence and credits be reviewed for a public release?
