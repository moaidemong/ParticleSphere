# Architecture

ParticleSphere is now a pure client-side particle simulation (no runtime physics engine dependency in active path).

## Runtime Pipeline

1. Renderer
- `THREE.WebGLRenderer`
- one `THREE.Points` for main particles
- one `THREE.Points` for extra-particle trail history

2. Geometry Buffers
- main particle positions/colors updated each frame
- trail positions/colors updated from ring buffers (`extra` particles only)

3. Shape State Machine
- click cycle:
  - `sphere -> cube -> plane -> fourier -> sphere`
- transitions are particle-level lerp with stagger

4. Surface Deformation
- ripple wave propagation (`speed`, `lifetime`, gaussian ring)
- sticky pointer drag field with decay
- active on `sphere`, `cube`, `plane`

5. Extra Particle System
- extra count = `plane_count - base_count`
- in `sphere/cube`: orbiting outside object
- in `plane/fourier`: joins target slots
- supports:
  - weak pointer pull
  - 1.5s fade trail
  - depth fade with camera distance

6. Fourier Mode
- built from plane slots with spectral-height function
- center peak + damped side lobes
- dedicated camera profile blend for smooth mode entry/exit

## Camera Profiles
- base profile: sphere/cube/plane
- elevated profile: fourier
- profile interpolation uses transition span to avoid angle popping

## Stashed Logic
- portrait dithering path is kept in code but disabled by flag (`ENABLE_PORTRAIT_STASH=false`)
