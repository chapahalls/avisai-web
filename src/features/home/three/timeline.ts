export type HomeStoryStage = 'chip' | 'phone' | 'truck' | 'brazil' | 'world';

export type Vec3Tuple = readonly [number, number, number];

export type HomeSceneSample = {
  progress: number;
  stage: HomeStoryStage;
  cameraPosition: Vec3Tuple;
  cameraTarget: Vec3Tuple;
  chipOpacity: number;
  chipStretch: number;
  chipTraceProgress: number;
  /** Staged build of the processor package and pins (0 = bare mark). */
  chipBuild: number;
  phoneBodyOpacity: number;
  phoneSolidOpacity: number;
  phoneWireOpacity: number;
  phoneMarkScale: number;
  phoneMount: number;
  phoneScale: number;
  phonePosition: Vec3Tuple;
  cabinOpacity: number;
  truckOpacity: number;
  truckSolidOpacity: number;
  truckWireOpacity: number;
  driveGridOpacity: number;
  driveIntensity: number;
  particlesOpacity: number;
  brazilOpacity: number;
  /** 0 = truck at real size on its road, 1 = whole Brazil map in view. */
  worldZoom: number;
  /** Moves the framing from the truck's road to the centre of Brazil. */
  brazilCenter: number;
  brazilRoutes: number;
  brazilMorph: number;
  globeOpacity: number;
  globeRoutes: number;
};

export type HomeStoryLine = {
  stage: HomeStoryStage;
  start: number;
  typeEnd: number;
  fadeStart?: number;
  fadeEnd?: number;
};

export const HOME_STORY_LINES: readonly HomeStoryLine[] = [
  { stage: 'chip', start: 0.012, typeEnd: 0.09, fadeStart: 0.14, fadeEnd: 0.17 },
  { stage: 'phone', start: 0.17, typeEnd: 0.28, fadeStart: 0.34, fadeEnd: 0.38 },
  { stage: 'truck', start: 0.39, typeEnd: 0.52, fadeStart: 0.57, fadeEnd: 0.62 },
  { stage: 'brazil', start: 0.63, typeEnd: 0.78, fadeStart: 0.83, fadeEnd: 0.87 },
  { stage: 'world', start: 0.88, typeEnd: 0.98 },
] as const;

/**
 * The cabin interior is authored at a larger scale; this similarity fits it
 * inside the truck model's cab (floor y≈1.2, roof y≈2.5, front wall x≈5.3).
 * Camera keyframes and the mounted phone go through the same transform so the
 * cabin shot frames exactly as before.
 */
export const CABIN_FIT = {
  scale: 0.58,
  from: [5.25, 1.08, 0] as Vec3Tuple,
  to: [5.3, 1.22, 0] as Vec3Tuple,
} as const;

export const fitCabin = ([x, y, z]: Vec3Tuple): Vec3Tuple => [
  CABIN_FIT.to[0] + (x - CABIN_FIT.from[0]) * CABIN_FIT.scale,
  CABIN_FIT.to[1] + (y - CABIN_FIT.from[1]) * CABIN_FIT.scale,
  CABIN_FIT.to[2] + (z - CABIN_FIT.from[2]) * CABIN_FIT.scale,
];

export const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export const segment = (value: number, start: number, end: number) =>
  clamp01((value - start) / Math.max(0.0001, end - start));

export const smoothstep = (value: number) => {
  const x = clamp01(value);
  return x * x * (3 - 2 * x);
};

const easeInOutCubic = (value: number) => {
  const x = clamp01(value);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};

const lerp = (from: number, to: number, amount: number) => from + (to - from) * amount;

const lerpVec3 = (from: Vec3Tuple, to: Vec3Tuple, amount: number): Vec3Tuple => [
  lerp(from[0], to[0], amount),
  lerp(from[1], to[1], amount),
  lerp(from[2], to[2], amount),
];

type CameraKeyframe = {
  at: number;
  position: Vec3Tuple;
  target: Vec3Tuple;
};

const CAMERA: readonly CameraKeyframe[] = [
  { at: 0, position: [5.15, 2.55, 13.1], target: [5.15, 2.55, 1.58] },
  { at: 0.17, position: [5.2, 2.64, 12.4], target: [5.15, 2.45, 1.48] },
  { at: 0.22, position: [5.2, 2.62, 11.4], target: [5.15, 2.42, 1.34] },
  { at: 0.285, position: fitCabin([1.15, 2.34, 0]), target: fitCabin([5.05, 2.25, 0]) },
  { at: 0.335, position: fitCabin([1.08, 2.38, 0.04]), target: fitCabin([5.02, 2.22, 0]) },
  { at: 0.39, position: [8.4, 3.4, 9.8], target: [2.3, 1.95, 0] },
  { at: 0.44, position: [15.4, 4.3, 16.5], target: [0.1, 1.68, 0] },
  { at: 0.56, position: [12.5, 5, 19.2], target: [-0.2, 1.48, 0] },
  { at: 0.7, position: [0.5, 12.5, 14.8], target: [0, 0.35, 0] },
  { at: 0.79, position: [0.2, 23.6, 2.4], target: [0, 0, 0] },
  { at: 0.86, position: [0.2, 22.8, 5.8], target: [0, 0, 0] },
  { at: 0.95, position: [0.2, 1.5, 22.8], target: [0, 0, 0] },
  { at: 1, position: [-0.4, 1.1, 23.5], target: [0, 0.05, 0] },
] as const;

function cameraAt(progress: number): Pick<HomeSceneSample, 'cameraPosition' | 'cameraTarget'> {
  const p = clamp01(progress);
  const nextIndex = CAMERA.findIndex((frame) => frame.at >= p);
  if (nextIndex <= 0) {
    return { cameraPosition: CAMERA[0].position, cameraTarget: CAMERA[0].target };
  }
  if (nextIndex === -1) {
    const last = CAMERA[CAMERA.length - 1];
    return { cameraPosition: last.position, cameraTarget: last.target };
  }
  const previous = CAMERA[nextIndex - 1];
  const next = CAMERA[nextIndex];
  const amount = easeInOutCubic(segment(p, previous.at, next.at));
  return {
    cameraPosition: lerpVec3(previous.position, next.position, amount),
    cameraTarget: lerpVec3(previous.target, next.target, amount),
  };
}

export function storyLineAt(progress: number): { line: HomeStoryLine; index: number; reveal: number; opacity: number } {
  const p = clamp01(progress);
  const index = p < 0.17 ? 0 : p < 0.38 ? 1 : p < 0.62 ? 2 : p < 0.87 ? 3 : 4;
  const line = HOME_STORY_LINES[index];
  const fade = line.fadeStart === undefined || line.fadeEnd === undefined
    ? 0
    : smoothstep(segment(p, line.fadeStart, line.fadeEnd));
  return {
    line,
    index,
    reveal: smoothstep(segment(p, line.start, line.typeEnd)),
    opacity: smoothstep(segment(p, line.start - 0.008, line.start + 0.012)) * (1 - fade),
  };
}

export function sampleHomeTimeline(progress: number): HomeSceneSample {
  const p = clamp01(progress);
  const camera = cameraAt(p);
  const chipStretch = smoothstep(segment(p, 0.1, 0.2));
  const phoneMount = smoothstep(segment(p, 0.2, 0.29));
  const phoneWire = smoothstep(segment(p, 0.29, 0.35));
  const wire = smoothstep(segment(p, 0.34, 0.405));
  const truckOut = smoothstep(segment(p, 0.75, 0.83));
  const driveIntensity = smoothstep(segment(p, 0.37, 0.44)) * (1 - truckOut);
  const brazilIn = smoothstep(segment(p, 0.57, 0.7));
  const brazilToWorld = smoothstep(segment(p, 0.84, 0.95));
  const globeIn = smoothstep(segment(p, 0.85, 0.95));
  const phoneSolidOpacity = smoothstep(segment(p, 0.105, 0.19))
    * (1 - smoothstep(segment(p, 0.3, 0.36)));
  const phoneWireOpacity = phoneWire * (1 - smoothstep(segment(p, 0.36, 0.43)));

  return {
    progress: p,
    stage: p < 0.17 ? 'chip' : p < 0.38 ? 'phone' : p < 0.62 ? 'truck' : p < 0.87 ? 'brazil' : 'world',
    ...camera,
    chipOpacity: smoothstep(segment(p, 0.002, 0.055))
      * (1 - smoothstep(segment(p, 0.145, 0.215))),
    chipStretch,
    chipBuild: segment(p, 0.002, 0.075),
    chipTraceProgress: smoothstep(segment(p, 0.03, 0.1))
      * (1 - smoothstep(segment(p, 0.115, 0.185))),
    phoneBodyOpacity: Math.max(phoneSolidOpacity, phoneWireOpacity),
    phoneSolidOpacity,
    phoneWireOpacity,
    phoneMarkScale: lerp(0.88, 0.56, smoothstep(segment(p, 0.1, 0.2))),
    phoneMount,
    phoneScale: lerp(1, 0.052 * CABIN_FIT.scale, phoneMount),
    phonePosition: lerpVec3([5.15, 2.55, 1.4], fitCabin([4.78, 2.18, 0.74]), phoneMount),
    cabinOpacity: smoothstep(segment(p, 0.205, 0.275))
      * (1 - smoothstep(segment(p, 0.36, 0.44))),
    truckOpacity: smoothstep(segment(p, 0.345, 0.41)) * (1 - truckOut),
    truckSolidOpacity: 1 - wire,
    truckWireOpacity: wire,
    driveGridOpacity: driveIntensity * (1 - smoothstep(segment(p, 0.64, 0.76))),
    driveIntensity,
    particlesOpacity: wire * (1 - smoothstep(segment(p, 0.86, 0.95))),
    brazilOpacity: brazilIn,
    worldZoom: smoothstep(segment(p, 0.57, 0.8)),
    brazilCenter: smoothstep(segment(p, 0.7, 0.82)),
    brazilRoutes: smoothstep(segment(p, 0.6, 0.8)),
    brazilMorph: brazilToWorld,
    globeOpacity: globeIn,
    globeRoutes: smoothstep(segment(p, 0.885, 0.998)),
  };
}
