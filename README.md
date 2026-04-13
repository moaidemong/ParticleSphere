# ParticleSphere

Particle-based shape morph demo for web title experiments.

## Current Modes
- `sphere`
- `cube`
- `plane`
- `fourier` (plane-based spectral mountain)

Click cycles modes in this order:
- `sphere -> cube -> plane -> fourier -> sphere`

## Core Visual Style
- black background
- 1px particle rendering (`THREE.Points`)
- grayscale depth shading (near bright, far dark)
- low-cost runtime for older devices

## Interaction
- pointer move: ripple + sticky drag on active surface (`sphere/cube/plane`)
- extra particles (plane shortage only): orbit motion + subtle pointer response
- extra particle trails: ~1.5s fade-out

## Stack
- `three`
- `vite`

Note:
- `@dimforge/rapier3d-compat` remains in `package.json` from earlier prototypes, but current runtime path is non-Rapier.

## Quick Start
1. Install
- `npm install`

2. Run
- `npm run dev -- --host 0.0.0.0`

3. Open
- `http://127.0.0.1:5173`

## Key Files
- `src/main.js`
  - mode state machine and per-particle target solve
  - ripple/sticky deformation
  - orbit extras + trail buffers
  - camera profile blending
  - fourier uplift transition
- `src/style.css`
  - full-screen black canvas + HUD
- `assets/fourier.jpg`
  - stashed portrait source asset (currently disabled in flow)
