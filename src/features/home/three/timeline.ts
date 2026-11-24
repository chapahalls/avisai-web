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
  phoneBodyOpacity: number;
  phoneSolidOpacity: number;
  phoneWireOpacity: number;
  phoneMarkScale: number;
  phoneScale: number;
  phonePosition: Vec3Tuple;
  truckOpacity: number;
  truckSolidOpacity: number;
  truckWireOpacity: number;
  yardOpacity: number;
  sunsetOpacity: number;
  particlesOpacity: number;
  brazilOpacity: number;
  brazilScale: number;
  brazilPosition: Vec3Tuple;
  brazilRotationX: number;
  brazilRoutes: number;
  brazilMorph: number;
  globeOpacity: number;
  globeScale: number;
  globeRotationY: number;
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
  { at: 0.31, position: [5.65, 2.92, 12.8], target: [4.8, 2.2, 0.9] },
  { at: 0.4, position: [2.5, 4.1, 18.8], target: [1.45, 1.92, 0] },
  { at: 0.56, position: [-1.4, 4.25, 22.8], target: [0, 1.48, 0] },
  { at: 0.7, position: [0.5, 12.5, 14.8], target: [0, 0.35, 0] },
  { at: 0.79, position: [0.2, 23.6, 2.4], target: [0, 0, 0] },
  { at: 0.86, position: [0.2, 22.8, 5.8], target: [0, 0, 0] },
  { at: 0.95, position: [0.2, 1.5, 21.5], target: [0, 0, 0] },
  { at: 1, position: [-0.4, 1.1, 20.5], target: [0, 0.05, 0] },
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
  const phoneIntoTruck = smoothstep(segment(p, 0.27, 0.43));
  const phoneWire = smoothstep(segment(p, 0.29, 0.37));
  const wire = smoothstep(segment(p, 0.43, 0.56));
  const truckOut = smoothstep(segment(p, 0.71, 0.84));
  const brazilIn = smoothstep(segment(p, 0.59, 0.75));
  const brazilToWorld = smoothstep(segment(p, 0.84, 0.95));
  const globeIn = smoothstep(segment(p, 0.82, 0.94));
  const phoneSolidOpacity = smoothstep(segment(p, 0.105, 0.19))
    * (1 - smoothstep(segment(p, 0.31, 0.4)));
  const phoneWireOpacity = phoneWire * (1 - smoothstep(segment(p, 0.49, 0.57)));

  return {
    progress: p,
    stage: p < 0.17 ? 'chip' : p < 0.38 ? 'phone' : p < 0.62 ? 'truck' : p < 0.87 ? 'brazil' : 'world',
    ...camera,
    chipOpacity: smoothstep(segment(p, 0.002, 0.055))
      * (1 - smoothstep(segment(p, 0.145, 0.215))),
    chipStretch,
    chipTraceProgress: smoothstep(segment(p, 0.008, 0.095))
      * (1 - smoothstep(segment(p, 0.115, 0.185))),
    phoneBodyOpacity: Math.max(phoneSolidOpacity, phoneWireOpacity),
    phoneSolidOpacity,
    phoneWireOpacity,
    phoneMarkScale: lerp(0.88, 0.56, smoothstep(segment(p, 0.1, 0.2))),
    phoneScale: lerp(1, 0.22, phoneIntoTruck),
    phonePosition: lerpVec3([5.15, 2.55, 1.4], [4.72, 2.28, 1.34], phoneIntoTruck),
    truckOpacity: smoothstep(segment(p, 0.29, 0.41)) * (1 - truckOut),
    truckSolidOpacity: 1 - wire,
    truckWireOpacity: wire,
    yardOpacity: smoothstep(segment(p, 0.27, 0.39)) * (1 - smoothstep(segment(p, 0.54, 0.68))),
    sunsetOpacity: smoothstep(segment(p, 0.25, 0.36)) * (1 - smoothstep(segment(p, 0.48, 0.59))),
    particlesOpacity: wire * (1 - smoothstep(segment(p, 0.86, 0.95))),
    brazilOpacity: brazilIn * (1 - smoothstep(segment(p, 0.94, 0.99))),
    brazilScale: lerp(0.68, 1, brazilIn),
    brazilPosition: [0, lerp(-1.4, 0, brazilIn), 0],
    brazilRotationX: lerp(-Math.PI / 2, 0, brazilToWorld),
    brazilRoutes: smoothstep(segment(p, 0.68, 0.8)),
    brazilMorph: brazilToWorld,
    globeOpacity: globeIn,
    globeScale: lerp(0.35, 1, globeIn),
    globeRotationY: lerp(-0.42, 0.22, smoothstep(segment(p, 0.86, 1))),
    globeRoutes: smoothstep(segment(p, 0.92, 0.995)),
  };
}
