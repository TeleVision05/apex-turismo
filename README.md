# Apex Turismo

A Gran Turismo-style 3D racing game that runs in the browser (Three.js + TypeScript + Vite).

- Real circuits traced from OpenStreetMap with real elevation (Suzuka, Monza, Spa, Laguna Seca and more).
- A rigid-body vehicle model: four spring/damper wheels, a combined-slip tyre model, weight transfer, aero, an engine torque curve with a gearbox, ABS/TCS assists.
- AI opponents that follow an optimised racing line, overtake and recover.
- Career progression: credits, a garage, a dealership, a tuning shop with upgrades, race events, time trials and lap records.
- Keyboard, gamepad and steering-wheel support with an in-game mapping wizard.
- Procedural everything: cars generated in Blender, trackside scenery and textures built in code, audio synthesised with Web Audio.

## Run

```sh
npm install
npm run dev        # http://127.0.0.1:5173
npm run build      # production build in dist/
npm test           # unit tests (physics, track scene, audio)
npm run lint
```

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

Gamepads use the standard layout (right trigger accelerate, left trigger brake, bumpers shift). Steering wheels are detected automatically when known, and any device can be mapped in Settings → Controls.

## Regenerating assets

- Tracks: `tools/tracks/README.md`
- Cars: `tools/cars/README.md`
