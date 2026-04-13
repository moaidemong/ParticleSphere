import * as THREE from "three";

const CUBE_SIDE = 14;
const BASE_PARTICLE_COUNT = CUBE_SIDE * CUBE_SIDE * CUBE_SIDE;
const PLANE_GRID_SIDE = Math.ceil(Math.sqrt(BASE_PARTICLE_COUNT));
const PLANE_PARTICLE_COUNT = PLANE_GRID_SIDE * PLANE_GRID_SIDE;
const EXTRA_PARTICLE_COUNT = Math.max(0, PLANE_PARTICLE_COUNT - BASE_PARTICLE_COUNT);
const PARTICLE_COUNT = Math.max(BASE_PARTICLE_COUNT, PLANE_PARTICLE_COUNT);

const SPHERE_RADIUS = 1.9;
const SPHERE_VOLUME = (4 / 3) * Math.PI * SPHERE_RADIUS * SPHERE_RADIUS * SPHERE_RADIUS;
const CUBE_SIDE_LENGTH = Math.cbrt(SPHERE_VOLUME);
const CUBE_HALF = CUBE_SIDE_LENGTH * 0.5;
const PLANE_TURN_SPEED = 0.55;

const POINT_SIZE = 1.0;

const RIPPLE_SPEED = 1.55;
const RIPPLE_LIFETIME = 0.9;
const RIPPLE_SIGMA = 0.16;
const RIPPLE_AMPLITUDE = 0.055;
const RIPPLE_INTERVAL_SEC = 1 / 30;
const MAX_RIPPLES = 5;

const STICKY_SIGMA = 0.45;
const STICKY_AMPLITUDE = 0.11;
const STICKY_FOLLOW = 0.16;
const STICKY_DECAY_PER_SEC = 0.9;

const TRANSITION_DURATION = 1.35;
const TRANSITION_STAGGER = 1.05;
const SHADE_NEAR = 4.2;
const SHADE_FAR = 9.5;
const SHADE_GAMMA = 0.72;
const ORBIT_RADIUS_SPHERE = SPHERE_RADIUS * 1.55;
const ORBIT_RADIUS_CUBE = CUBE_HALF * 1.85;
const ORBIT_MOUSE_SIGMA = 2.6;
const ORBIT_MOUSE_PULL = 0.08;
const TRAIL_SECONDS = 1.5;
const TRAIL_FPS = 30;
const TRAIL_STEPS = Math.max(2, Math.floor(TRAIL_SECONDS * TRAIL_FPS));
const TRAIL_POINT_SIZE = 1.0;
const FOURIER_HEIGHT_GAIN = 4.1;
const FOURIER_BASE_OFFSET = -0.52;
const FOURIER_RISE_DURATION = 2.9;
const FOURIER_STAGGER_SPAN = 2.6;
const FOURIER_PARTICLE_RISE = 1.6;
// Stashed portrait mode (kept for later reuse; disabled in current flow).
const ENABLE_PORTRAIT_STASH = false;

const canvas = document.getElementById("scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 1);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0.4, 6.4);

const geometry = new THREE.BufferGeometry();
const positions = new Float32Array(PARTICLE_COUNT * 3);
const colors = new Float32Array(PARTICLE_COUNT * 3);
geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

const material = new THREE.PointsMaterial({
  size: POINT_SIZE,
  sizeAttenuation: false,
  vertexColors: true,
  transparent: false,
});

const points = new THREE.Points(geometry, material);
scene.add(points);

const trailParticleCount = EXTRA_PARTICLE_COUNT * TRAIL_STEPS;
const trailGeometry = new THREE.BufferGeometry();
const trailPositions = new Float32Array(trailParticleCount * 3);
const trailColors = new Float32Array(trailParticleCount * 3);
trailGeometry.setAttribute("position", new THREE.BufferAttribute(trailPositions, 3));
trailGeometry.setAttribute("color", new THREE.BufferAttribute(trailColors, 3));
const trailMaterial = new THREE.PointsMaterial({
  size: TRAIL_POINT_SIZE,
  sizeAttenuation: false,
  vertexColors: true,
  transparent: false,
});
const trailPoints = new THREE.Points(trailGeometry, trailMaterial);
scene.add(trailPoints);

const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();
const center = new THREE.Vector3(0, 0, 0);
const sphereForHit = new THREE.Sphere(center, SPHERE_RADIUS);
const cubeForHit = new THREE.Box3(
  new THREE.Vector3(-CUBE_HALF, -CUBE_HALF, -CUBE_HALF),
  new THREE.Vector3(CUBE_HALF, CUBE_HALF, CUBE_HALF)
);
const xzPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const yAxis = new THREE.Vector3(0, 1, 0);

const scratch = new THREE.Vector3();
const sphereScratch = new THREE.Vector3();
const cubeScratch = new THREE.Vector3();
const planeScratch = new THREE.Vector3();
const fromScratch = new THREE.Vector3();
const toScratch = new THREE.Vector3();
const blendScratch = new THREE.Vector3();
const hitScratch = new THREE.Vector3();
const normalScratch = new THREE.Vector3();
const localHitScratch = new THREE.Vector3();
const stickyTarget = new THREE.Vector3(0, 0, SPHERE_RADIUS);
const stickyPos = new THREE.Vector3(0, 0, SPHERE_RADIUS);
const orbitPullScratch = new THREE.Vector3();

const particles = [];
const cubeTargets = [];
const planeTargets = [];
const orbitParams = [];
const planeSlotByParticle = [];
const fourierSlotByParticle = [];
const portraitTargets = [];
const portraitShades = [];
const extraTrailBuffers = [];
const ripples = [];
const clock = new THREE.Clock();
let planeHalf = 1;

let lastRippleAt = -Infinity;
let stickyStrength = 0;
let shapeMode = "sphere";
let transitionStart = -10;
let transitionFrom = "sphere";
let transitionTo = "sphere";
let portraitReady = false;

function smoothstep01(t) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

function cameraProfileForMode(mode) {
  if (mode === "fourier") {
    return { radius: 7.2, y: 1.55, lookY: 0.62 };
  }
  return { radius: 6.4, y: 0.4, lookY: 0.0 };
}

function fibonacciSphere(i, count) {
  const phi = Math.acos(1 - (2 * (i + 0.5)) / count);
  const theta = Math.PI * (1 + Math.sqrt(5)) * (i + 0.5);
  return new THREE.Vector3(
    Math.cos(theta) * Math.sin(phi),
    Math.sin(theta) * Math.sin(phi),
    Math.cos(phi)
  );
}

function buildPlaneTargets(count, halfWidth) {
  const n = PLANE_GRID_SIDE;
  const step = n > 1 ? (2 * halfWidth) / (n - 1) : 0;
  const out = [];

  for (let i = 0; i < count; i += 1) {
    const ix = i % n;
    const iz = Math.floor(i / n);

    out.push(
      new THREE.Vector3(
        (ix - (n - 1) * 0.5) * step,
        0,
        (iz - (n - 1) * 0.5) * step
      )
    );
  }

  return out;
}

function buildOffscreenTargets(count) {
  const out = new Array(count);
  for (let i = 0; i < count; i += 1) {
    out[i] = {
      phase: Math.random() * Math.PI * 2,
      speed: 0.25 + Math.random() * 0.45,
      radiusJitter: (Math.random() - 0.5) * 0.9,
      yBase: (Math.random() - 0.5) * 2.2,
      wobbleFreq: 0.8 + Math.random() * 1.6,
      wobbleAmp: 0.15 + Math.random() * 0.55,
      wobblePhase: Math.random() * Math.PI * 2,
    };
  }
  return out;
}

function buildShuffledIndices(count) {
  const arr = new Array(count);
  for (let i = 0; i < count; i += 1) arr[i] = i;
  for (let i = count - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

function bayer4(x, y) {
  const xi = x & 3;
  const yi = y & 3;
  const table = [
    0, 8, 2, 10,
    12, 4, 14, 6,
    3, 11, 1, 9,
    15, 7, 13, 5,
  ];
  return table[yi * 4 + xi] / 16;
}

function buildCubeTargets(count) {
  const n = CUBE_SIDE;
  const step = n > 1 ? (2 * CUBE_HALF) / (n - 1) : 0;
  const out = [];

  for (let i = 0; i < count; i += 1) {
    const ix = i % n;
    const iy = Math.floor(i / n) % n;
    const iz = Math.floor(i / (n * n));

    out.push(
      new THREE.Vector3(
        (ix - (n - 1) * 0.5) * step,
        (iy - (n - 1) * 0.5) * step,
        (iz - (n - 1) * 0.5) * step
      )
    );
  }

  return out;
}

function computePlaneHalfForViewport() {
  const dist = camera.position.distanceTo(center);
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const viewHeight = 2 * Math.tan(vFov * 0.5) * dist;
  const viewWidth = viewHeight * camera.aspect;
  return (viewWidth * (2 / 3)) * 0.5;
}

function rebuildPlaneTargets() {
  planeHalf = computePlaneHalfForViewport();
  const nextTargets = buildPlaneTargets(PARTICLE_COUNT, planeHalf);
  planeTargets.length = 0;
  planeTargets.push(...nextTargets);
}

function buildPortraitTargetsFromImage(image) {
  const canvas2d = document.createElement("canvas");
  const ctx = canvas2d.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return;
  }

  const targetW = 200;
  const aspect = image.height / image.width;
  const targetH = Math.max(80, Math.round(targetW * aspect));
  canvas2d.width = targetW;
  canvas2d.height = targetH;
  ctx.drawImage(image, 0, 0, targetW, targetH);

  const data = ctx.getImageData(0, 0, targetW, targetH).data;
  const samples = [];
  for (let y = 0; y < targetH; y += 1) {
    for (let x = 0; x < targetW; x += 1) {
      const idx = (y * targetW + x) * 4;
      const r = data[idx + 0];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      const ink = luma < 0.94 - bayer4(x, y) * 0.34;
      if (ink) {
        samples.push({ x, y, luma });
      }
    }
  }

  if (samples.length === 0) {
    return;
  }

  samples.sort((a, b) => a.luma - b.luma);
  const step = samples.length / PARTICLE_COUNT;
  const chosen = new Array(PARTICLE_COUNT);
  for (let i = 0; i < PARTICLE_COUNT; i += 1) {
    const s = samples[Math.min(samples.length - 1, Math.floor(i * step))];
    chosen[i] = s;
  }

  const portraitHalfW = planeHalf * 0.92;
  const portraitW = portraitHalfW * 2;
  const portraitH = portraitW * (targetH / targetW);

  portraitTargets.length = 0;
  portraitShades.length = 0;
  for (let i = 0; i < PARTICLE_COUNT; i += 1) {
    const p = chosen[planeSlotByParticle[i] ?? i];
    const u = p.x / Math.max(1, targetW - 1);
    const v = p.y / Math.max(1, targetH - 1);
    const worldX = (u - 0.5) * portraitW;
    const worldY = (0.5 - v) * portraitH;
    portraitTargets.push(new THREE.Vector3(worldX, worldY, 0));
    portraitShades.push(THREE.MathUtils.clamp(1 - p.luma * 0.9, 0.1, 1));
  }

  portraitReady = true;
}

cubeTargets.push(...buildCubeTargets(BASE_PARTICLE_COUNT));
rebuildPlaneTargets();
orbitParams.push(...buildOffscreenTargets(PARTICLE_COUNT));
planeSlotByParticle.push(...buildShuffledIndices(PARTICLE_COUNT));
fourierSlotByParticle.push(...buildShuffledIndices(PARTICLE_COUNT));
for (let i = 0; i < EXTRA_PARTICLE_COUNT; i += 1) {
  extraTrailBuffers.push({
    buf: new Float32Array(TRAIL_STEPS * 3),
    head: 0,
    initialized: false,
  });
}

// Stashed portrait loader (disabled by default; kept for future toggle-back).
const portraitImage = new Image();
if (ENABLE_PORTRAIT_STASH) {
  portraitImage.onload = () => {
    buildPortraitTargetsFromImage(portraitImage);
  };
  portraitImage.src = "/assets/fourier.jpg";
}

function getOrbitPos(index, now, mode) {
  const p = orbitParams[index];
  const baseR = mode === "cube" ? ORBIT_RADIUS_CUBE : ORBIT_RADIUS_SPHERE;
  const a = p.phase + now * p.speed;
  const r = Math.max(0.2, baseR + p.radiusJitter);

  planeScratch.set(
    Math.cos(a) * r,
    p.yBase + Math.sin(a * p.wobbleFreq + p.wobblePhase) * p.wobbleAmp,
    Math.sin(a) * r
  );

  if (stickyStrength > 0) {
    const dist = planeScratch.distanceTo(stickyTarget);
    const w = Math.exp(-(dist * dist) / (2 * ORBIT_MOUSE_SIGMA * ORBIT_MOUSE_SIGMA)) * stickyStrength;
    orbitPullScratch.copy(stickyTarget).sub(planeScratch).multiplyScalar(ORBIT_MOUSE_PULL * w);
    planeScratch.add(orbitPullScratch);
  }

  return planeScratch;
}

function pushExtraTrail(extraIndex, x, y, z) {
  const t = extraTrailBuffers[extraIndex];
  if (!t.initialized) {
    for (let s = 0; s < TRAIL_STEPS; s += 1) {
      t.buf[s * 3 + 0] = x;
      t.buf[s * 3 + 1] = y;
      t.buf[s * 3 + 2] = z;
    }
    t.initialized = true;
    t.head = 1 % TRAIL_STEPS;
    return;
  }
  const p = t.head * 3;
  t.buf[p + 0] = x;
  t.buf[p + 1] = y;
  t.buf[p + 2] = z;
  t.head = (t.head + 1) % TRAIL_STEPS;
}

function syncExtraTrails() {
  for (let e = 0; e < EXTRA_PARTICLE_COUNT; e += 1) {
    const t = extraTrailBuffers[e];
    for (let s = 0; s < TRAIL_STEPS; s += 1) {
      const src = ((t.head + s) % TRAIL_STEPS) * 3;
      const dst = (e * TRAIL_STEPS + s) * 3;
      const x = t.buf[src + 0];
      const y = t.buf[src + 1];
      const z = t.buf[src + 2];
      trailPositions[dst + 0] = x;
      trailPositions[dst + 1] = y;
      trailPositions[dst + 2] = z;

      const fade = s / Math.max(1, TRAIL_STEPS - 1);
      scratch.set(x, y, z);
      const distToCam = scratch.distanceTo(camera.position);
      const tDepth = THREE.MathUtils.clamp((distToCam - SHADE_NEAR) / (SHADE_FAR - SHADE_NEAR), 0, 1);
      const depthShade = THREE.MathUtils.lerp(1.0, 0.12, Math.pow(tDepth, SHADE_GAMMA));
      const g = (0.03 + 0.35 * fade) * depthShade;
      trailColors[dst + 0] = g;
      trailColors[dst + 1] = g;
      trailColors[dst + 2] = g;
    }
  }
  trailGeometry.attributes.position.needsUpdate = true;
  trailGeometry.attributes.color.needsUpdate = true;
}

for (let i = 0; i < PARTICLE_COUNT; i += 1) {
  const restDir = i < BASE_PARTICLE_COUNT ? fibonacciSphere(i, BASE_PARTICLE_COUNT) : null;
  particles.push({
    restDir,
    orderT: i / Math.max(1, PARTICLE_COUNT - 1),
  });

  if (restDir) {
    sphereScratch.copy(restDir).multiplyScalar(SPHERE_RADIUS);
    positions[i * 3 + 0] = sphereScratch.x;
    positions[i * 3 + 1] = sphereScratch.y;
    positions[i * 3 + 2] = sphereScratch.z;
  } else {
    const o = getOrbitPos(i, 0, "sphere");
    positions[i * 3 + 0] = o.x;
    positions[i * 3 + 1] = o.y;
    positions[i * 3 + 2] = o.z;
  }
  colors[i * 3 + 0] = 1;
  colors[i * 3 + 1] = 1;
  colors[i * 3 + 2] = 1;
}

function getSpherePos(restDir, now) {
  sphereScratch.copy(restDir).multiplyScalar(SPHERE_RADIUS);

  let offset = 0;
  for (let i = 0; i < ripples.length; i += 1) {
    const r = ripples[i];
    const age = now - r.bornAt;
    const waveFront = age * RIPPLE_SPEED;
    const dist = sphereScratch.distanceTo(r.origin);
    const x = dist - waveFront;
    const ring = Math.exp(-(x * x) / (2 * RIPPLE_SIGMA * RIPPLE_SIGMA));
    const fade = 1 - age / RIPPLE_LIFETIME;
    offset += ring * RIPPLE_AMPLITUDE * fade;
  }

  if (stickyStrength > 0) {
    const dist = sphereScratch.distanceTo(stickyPos);
    const w = Math.exp(-(dist * dist) / (2 * STICKY_SIGMA * STICKY_SIGMA));
    offset += w * STICKY_AMPLITUDE * stickyStrength;
  }

  return sphereScratch.copy(restDir).multiplyScalar(SPHERE_RADIUS + offset);
}

function surfaceNormalForCube(point, out) {
  const ax = Math.abs(point.x);
  const ay = Math.abs(point.y);
  const az = Math.abs(point.z);

  if (ax >= ay && ax >= az) {
    out.set(Math.sign(point.x) || 1, 0, 0);
    return out;
  }
  if (ay >= ax && ay >= az) {
    out.set(0, Math.sign(point.y) || 1, 0);
    return out;
  }
  out.set(0, 0, Math.sign(point.z) || 1);
  return out;
}

function getCubePos(index, now) {
  if (index >= BASE_PARTICLE_COUNT) {
    return getOrbitPos(index, now, "cube");
  }
  cubeScratch.copy(cubeTargets[index]);
  surfaceNormalForCube(cubeScratch, normalScratch);

  let offset = 0;
  for (let i = 0; i < ripples.length; i += 1) {
    const r = ripples[i];
    const age = now - r.bornAt;
    const waveFront = age * RIPPLE_SPEED;
    const dist = cubeScratch.distanceTo(r.origin);
    const x = dist - waveFront;
    const ring = Math.exp(-(x * x) / (2 * RIPPLE_SIGMA * RIPPLE_SIGMA));
    const fade = 1 - age / RIPPLE_LIFETIME;
    offset += ring * RIPPLE_AMPLITUDE * fade;
  }

  if (stickyStrength > 0) {
    const dist = cubeScratch.distanceTo(stickyPos);
    const w = Math.exp(-(dist * dist) / (2 * STICKY_SIGMA * STICKY_SIGMA));
    offset += w * STICKY_AMPLITUDE * stickyStrength;
  }

  cubeScratch.addScaledVector(normalScratch, offset);
  return cubeScratch;
}

function getPlaneYaw(now) {
  return now * PLANE_TURN_SPEED;
}

function getPlanePos(index, now) {
  const slot = planeSlotByParticle[index] ?? index;
  const base = planeTargets[slot] ?? planeTargets[index];
  planeScratch.copy(base).applyAxisAngle(yAxis, getPlaneYaw(now));
  normalScratch.set(0, 1, 0);

  let offset = 0;
  for (let i = 0; i < ripples.length; i += 1) {
    const r = ripples[i];
    const age = now - r.bornAt;
    const waveFront = age * RIPPLE_SPEED;
    const dist = planeScratch.distanceTo(r.origin);
    const x = dist - waveFront;
    const ring = Math.exp(-(x * x) / (2 * RIPPLE_SIGMA * RIPPLE_SIGMA));
    const fade = 1 - age / RIPPLE_LIFETIME;
    offset += ring * RIPPLE_AMPLITUDE * fade;
  }

  if (stickyStrength > 0) {
    const dist = planeScratch.distanceTo(stickyPos);
    const w = Math.exp(-(dist * dist) / (2 * STICKY_SIGMA * STICKY_SIGMA));
    offset += w * STICKY_AMPLITUDE * stickyStrength;
  }

  planeScratch.addScaledVector(normalScratch, offset);
  return planeScratch;
}

function getFourierPos(index, now) {
  const slot = fourierSlotByParticle[index] ?? index;
  const local = planeTargets[slot] ?? planeTargets[index];
  const yaw = getPlaneYaw(now);

  planeScratch.copy(local).applyAxisAngle(yAxis, yaw);
  const u = local.x / Math.max(0.001, planeHalf);
  const v = local.z / Math.max(0.001, planeHalf);
  const r2 = u * u + v * v;

  // Fourier-magnitude-like surface tuned for steep center peak and lower horizon.
  const dc = Math.exp(-r2 * 14.0);
  const side = Math.exp(-r2 * 2.2) * (0.5 + 0.5 * Math.cos(10 * u) * Math.cos(10 * v));
  const h = FOURIER_HEIGHT_GAIN * (0.88 * dc + 0.12 * side);

  planeScratch.y += FOURIER_BASE_OFFSET + h;
  return planeScratch;
}

function getPortraitPos(index) {
  if (!portraitReady || !portraitTargets[index]) {
    return getPlanePos(index, clock.getElapsedTime());
  }
  return planeScratch.copy(portraitTargets[index]);
}

function getModePos(mode, p, index, now) {
  if ((mode === "sphere" || mode === "cube") && index >= BASE_PARTICLE_COUNT) {
    return getOrbitPos(index, now, mode === "cube" ? "cube" : "sphere");
  }
  if (mode === "cube") {
    return getCubePos(index, now);
  }
  if (mode === "plane") {
    return getPlanePos(index, now);
  }
  if (mode === "fourier") {
    return getFourierPos(index, now);
  }
  if (mode === "portrait") {
    return getPortraitPos(index);
  }
  return getSpherePos(p.restDir, now);
}

function getHitPointForMode(clientX, clientY, mode, now, out) {
  pointerNdc.x = (clientX / window.innerWidth) * 2 - 1;
  pointerNdc.y = -(clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointerNdc, camera);

  if (mode === "cube") {
    return raycaster.ray.intersectBox(cubeForHit, out);
  }
  if (mode === "fourier") {
    return null;
  }
  if (mode === "portrait") {
    return null;
  }
  if (mode === "plane") {
    if (!raycaster.ray.intersectPlane(xzPlane, out)) {
      return null;
    }
    localHitScratch.copy(out).applyAxisAngle(yAxis, -getPlaneYaw(now));
    if (Math.abs(localHitScratch.x) > planeHalf || Math.abs(localHitScratch.z) > planeHalf) {
      return null;
    }
    return out;
  }
  return raycaster.ray.intersectSphere(sphereForHit, out);
}

function registerRippleFromPointer(clientX, clientY) {
  const now = clock.getElapsedTime();
  const activeMode = transitionTo;
  if (activeMode === "portrait" || activeMode === "fourier") {
    return;
  }

  if (!getHitPointForMode(clientX, clientY, activeMode, now, hitScratch)) {
    return;
  }

  stickyTarget.copy(hitScratch);
  stickyStrength = 1;

  if (now - lastRippleAt < RIPPLE_INTERVAL_SEC) {
    return;
  }

  lastRippleAt = now;
  ripples.push({ origin: hitScratch.clone(), bornAt: now });
  while (ripples.length > MAX_RIPPLES) {
    ripples.shift();
  }
}

window.addEventListener(
  "pointermove",
  (ev) => {
    registerRippleFromPointer(ev.clientX, ev.clientY);
  },
  { passive: true }
);

window.addEventListener("click", () => {
  transitionFrom = shapeMode;
  if (shapeMode === "sphere") {
    transitionTo = "cube";
  } else if (shapeMode === "cube") {
    transitionTo = "plane";
  } else if (shapeMode === "plane") {
    transitionTo = "fourier";
  } else {
    transitionTo = "sphere";
  }
  shapeMode = transitionTo;
  transitionStart = clock.getElapsedTime();

  ripples.length = 0;
  stickyStrength = 0;
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  rebuildPlaneTargets();
  if (portraitReady) {
    buildPortraitTargetsFromImage(portraitImage);
  }
});

function updateRipples(now) {
  for (let i = ripples.length - 1; i >= 0; i -= 1) {
    if (now - ripples[i].bornAt > RIPPLE_LIFETIME) {
      ripples.splice(i, 1);
    }
  }
}

function animate() {
  const dt = Math.min(clock.getDelta(), 1 / 60);
  const now = clock.getElapsedTime();

  updateRipples(now);

  stickyPos.lerp(stickyTarget, STICKY_FOLLOW);
  stickyStrength = Math.max(0, stickyStrength - STICKY_DECAY_PER_SEC * dt);

  const elapsed = now - transitionStart;

  for (let i = 0; i < particles.length; i += 1) {
    const p = particles[i];
    const delay = p.orderT * TRANSITION_STAGGER;
    let localT = smoothstep01((elapsed - delay) / TRANSITION_DURATION);

    // Make plane -> fourier feel like particles individually finding elevated positions.
    if (transitionFrom === "plane" && transitionTo === "fourier") {
      const dramaOrder = (planeSlotByParticle[i] ?? i) / Math.max(1, PARTICLE_COUNT - 1);
      const riseDelay = dramaOrder * FOURIER_STAGGER_SPAN;
      localT = smoothstep01((elapsed - riseDelay) / FOURIER_PARTICLE_RISE);
    }

    fromScratch.copy(getModePos(transitionFrom, p, i, now));
    toScratch.copy(getModePos(transitionTo, p, i, now));
    blendScratch.copy(fromScratch).lerp(toScratch, localT);

    positions[i * 3 + 0] = blendScratch.x;
    positions[i * 3 + 1] = blendScratch.y;
    positions[i * 3 + 2] = blendScratch.z;

    // 1px point grayscale based on camera distance (perspective depth cue).
    const distToCam = blendScratch.distanceTo(camera.position);
    const tDepth = THREE.MathUtils.clamp((distToCam - SHADE_NEAR) / (SHADE_FAR - SHADE_NEAR), 0, 1);
    const contrastT = Math.pow(tDepth, SHADE_GAMMA);
    const shade = THREE.MathUtils.lerp(1.0, 0.12, contrastT);
    let finalShade = shade;
    if (i >= BASE_PARTICLE_COUNT) {
      finalShade *= 0.9;
    }
    if (transitionTo === "portrait" && portraitReady) {
      finalShade *= portraitShades[i] ?? 1;
    }
    colors[i * 3 + 0] = finalShade;
    colors[i * 3 + 1] = finalShade;
    colors[i * 3 + 2] = finalShade;

    if (i >= BASE_PARTICLE_COUNT) {
      pushExtraTrail(i - BASE_PARTICLE_COUNT, blendScratch.x, blendScratch.y, blendScratch.z);
    }
  }

  geometry.attributes.position.needsUpdate = true;
  geometry.attributes.color.needsUpdate = true;
  syncExtraTrails();

  const camYaw = now * 0.08;
  let camSpan = TRANSITION_DURATION;
  if (transitionFrom === "plane" && transitionTo === "fourier") {
    camSpan = FOURIER_RISE_DURATION;
  } else if (transitionFrom === "fourier" && transitionTo === "sphere") {
    camSpan = FOURIER_RISE_DURATION * 0.9;
  }
  const camT = smoothstep01(elapsed / camSpan);
  const camFrom = cameraProfileForMode(transitionFrom);
  const camTo = cameraProfileForMode(transitionTo);
  const camRadius = THREE.MathUtils.lerp(camFrom.radius, camTo.radius, camT);
  const camY = THREE.MathUtils.lerp(camFrom.y, camTo.y, camT);
  const lookY = THREE.MathUtils.lerp(camFrom.lookY, camTo.lookY, camT);
  camera.position.x = Math.sin(camYaw) * camRadius;
  camera.position.z = Math.cos(camYaw) * camRadius;
  camera.position.y = camY;
  camera.lookAt(0, lookY, 0);

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

clock.start();
animate();
