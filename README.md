# Apex Turismo

A Gran Turismo-style 3D racing game that runs in the browser. Three.js, TypeScript, Vite, no framework, no backend.

**Status: working (single-player, actively developed).** 236 unit tests, lint and a production build passed on 2026-09-25; see [`docs/ROADMAP.md`](docs/ROADMAP.md) for what is verified, what is not, and what comes next.

## What is in it

- Ten real circuits traced from OpenStreetMap with real elevation and corner names: Suzuka, Monza, Spa-Francorchamps, Laguna Seca, Brands Hatch, Tsukuba, Fuji, Interlagos, Red Bull Ring and Silverstone.
- Forty-six cars across seven classes (N100 to Gr.1). Nine ride on freely licensed community models (credits in `public/models/cars/CREDITS.md`); the rest share those or five procedural body moulds, all normalised through a Blender pipeline.
- A rigid-body vehicle model: four spring/damper wheels, combined-slip tyres with load sensitivity and relaxation length, Ackermann steering, weight transfer, aero, a torque-curve engine with a hunting-free automatic gearbox, ABS/TCS assists.
- AI opponents on an optimised racing line that overtake and recover.
- Four times of day, clear/overcast/rain weather, replays with trackside TV cameras.
- Career: credits, garage, dealership, tuning shop, race events, time trials and lap records. Progress is saved in the browser's `localStorage`.
- Keyboard, gamepad and steering-wheel input with an in-game mapping wizard.
- Procedural scenery, textures and Web Audio engine sounds.

Screenshots are in `docs/screenshots/`.

## Install

Requires Node 22 (developed on v22.23.1) and npm.

```sh
git clone https://github.com/TeleVision05/apex-turismo.git
cd apex-turismo
npm install        # also installs the husky pre-commit hook
```

## Configure

Nothing to configure. The game reads no environment variables and there is no `.env`; the only build-time value is Vite's `BASE_URL`, and `vite.config.ts` sets `base: './'` so the build runs from any path.

Python and Blender are needed only to regenerate assets, not to run the game (see below).

## Run

```sh
npm run dev        # http://127.0.0.1:5173
npm run build      # typecheck + production build into dist/
npm run preview    # serve dist/ on http://127.0.0.1:4173
```

## Test and lint

```sh
npm test           # vitest: physics, gearbox, tyres, track continuity, roster, AI laps, audio
npm run lint       # eslint over src/
npm run typecheck  # tsc --noEmit
npm run format     # prettier over src/
```

The pre-commit hook runs prettier and eslint on staged `src/**/*.ts` files, then a full typecheck. Tests are not in the hook; run `npm test` before pushing.

## Controls (keyboard)

| Action | Keys |
|---|---|
| Steer | Arrow keys or A / D |
| Accelerate / brake | Up / Down or W / S |
| Handbrake | Space |
| Shift up / down (manual) | Shift / Ctrl, or E / Q |
| Change camera | C |
| Look back | V |
| Reset to track | R |
| Standings | Tab (hold) |
| Pause | Esc |

Gamepads use the standard layout (right trigger accelerate, left trigger brake, bumpers shift). Known steering wheels are detected automatically, and any device can be mapped in Settings, Controls.

## Roadmap

[`docs/ROADMAP.md`](docs/ROADMAP.md): current verified state, known gaps, six ordered milestones, and open questions.

## Regenerating assets

- Tracks (Python, OpenStreetMap + Open-Meteo): `tools/tracks/README.md`
- Cars (headless Blender): `tools/cars/README.md`
