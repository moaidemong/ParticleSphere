# Operations

## Prerequisites
- Node.js 20+
- npm 10+

## Install
- `npm install`

## Start
- `npm run dev -- --host 0.0.0.0`

## Build
- `npm run build`

## Preview
- `npm run preview`

## Runtime Controls
- pointer move:
  - ripple + sticky response (sphere/cube/plane)
- click:
  - mode cycle `sphere -> cube -> plane -> fourier -> sphere`

## Main Tuning Constants (`src/main.js`)
- particle sizing/count
  - `CUBE_SIDE`, `BASE_PARTICLE_COUNT`, `PLANE_GRID_SIDE`, `EXTRA_PARTICLE_COUNT`
- ripple
  - `RIPPLE_SPEED`, `RIPPLE_LIFETIME`, `RIPPLE_SIGMA`, `RIPPLE_AMPLITUDE`
- sticky
  - `STICKY_SIGMA`, `STICKY_AMPLITUDE`, `STICKY_FOLLOW`, `STICKY_DECAY_PER_SEC`
- extra orbit + trail
  - `ORBIT_RADIUS_SPHERE`, `ORBIT_RADIUS_CUBE`
  - `ORBIT_MOUSE_SIGMA`, `ORBIT_MOUSE_PULL`
  - `TRAIL_SECONDS`, `TRAIL_FPS`, `TRAIL_STEPS`
- fourier
  - `FOURIER_HEIGHT_GAIN`, `FOURIER_BASE_OFFSET`, `FOURIER_RISE_DURATION`
  - `FOURIER_STAGGER_SPAN`, `FOURIER_PARTICLE_RISE`

## Performance Notes
- if FPS drops:
  1. reduce `CUBE_SIDE`
  2. reduce trail load (`TRAIL_SECONDS` or `TRAIL_FPS`)
  3. relax ripple frequency (`RIPPLE_INTERVAL_SEC`)

## Troubleshooting
- blank/very dark output:
  - verify camera profile constants and depth shade range (`SHADE_NEAR`, `SHADE_FAR`)
- transition looks like a snap:
  - check stagger/rise constants for target mode
- no pointer effect:
  - verify active mode is not `fourier` (ripple disabled there by design)
