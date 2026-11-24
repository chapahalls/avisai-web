import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RODAR_MARK_PATH } from '../../../components/RodarLogo';
import { CABIN_FIT, sampleHomeTimeline, segment, smoothstep } from './timeline';
import {
  HOME_BRAZIL_TOPOGRAPHY_URL,
  HOME_WORLD_WIREFRAME_URL,
} from './mapAssets';
import { HOME_TRUCK_WIREFRAME_URL } from './truckAsset';

const COLORS = {
  night: 0x050806,
  nearBlack: 0x090d09,
  ink: 0x172019,
  inkLight: 0x344039,
  lime: 0xa2f200,
  limeDark: 0x426e0c,
  white: 0xf6f8f6,
  metal: 0x9ca59f,
};
const WORLD_ROTATION_OFFSET = -1.25;

type OpacityTarget = {
  material: THREE.Material;
  baseOpacity: number;
};

type DrawTarget = {
  geometry: THREE.BufferGeometry;
  count: number;
};

type Point2 = readonly [x: number, y: number];
type LonLat = readonly [longitude: number, latitude: number];

type BrazilTopographyAsset = {
  points: Float32Array;
  outline: Float32Array;
  contours: Float32Array;
};

type WorldWireframeAsset = {
  shell: THREE.BufferGeometry;
  wireframe: Float32Array;
  points: Float32Array;
  coastline: Float32Array;
};

export type HomeSceneController = {
  resize: (width: number, height: number, pixelRatio: number) => void;
  setProgress: (progress: number) => void;
  dispose: () => void;
};

function registerOpacity<T extends THREE.Material & { opacity: number; transparent: boolean }>(
  list: OpacityTarget[],
  material: T,
  baseOpacity?: number,
): T {
  material.transparent = true;
  list.push({
    material,
    baseOpacity: baseOpacity ?? (material.opacity > 0 ? material.opacity : 1),
  });
  return material;
}

function applyOpacity(list: readonly OpacityTarget[], opacity: number) {
  const amount = Math.max(0, Math.min(1, opacity));
  list.forEach(({ material, baseOpacity }) => {
    material.opacity = baseOpacity * amount;
    material.visible = material.opacity > 0.001;
    material.depthWrite = material.opacity > 0.98;
  });
}

type GeometryObject = THREE.Object3D & {
  geometry?: THREE.BufferGeometry;
  material?: THREE.Material | THREE.Material[];
};

function findGeometryByRole(root: THREE.Object3D, role: string) {
  let match: GeometryObject | null = null;
  root.traverse((object) => {
    const candidate = object as GeometryObject;
    if (
      !match
      && candidate.geometry
      && (candidate.userData.role === role || candidate.name === role)
    ) {
      match = candidate;
    }
  });
  return match;
}

function copyWorldPositions(object: GeometryObject) {
  const geometry = object.geometry;
  const position = geometry?.getAttribute('position');
  if (!geometry || !position) {
    throw new Error(`Geometria sem posições: ${object.name || object.type}`);
  }
  object.updateWorldMatrix(true, false);
  const index = geometry.getIndex();
  const count = index?.count ?? position.count;
  const values = new Float32Array(count * 3);
  const point = new THREE.Vector3();
  for (let offset = 0; offset < count; offset += 1) {
    const sourceIndex = index ? index.getX(offset) : offset;
    point.fromBufferAttribute(position, sourceIndex).applyMatrix4(object.matrixWorld);
    point.toArray(values, offset * 3);
  }
  return values;
}

function cloneWorldGeometry(object: GeometryObject) {
  if (!object.geometry) {
    throw new Error(`Objeto sem geometria: ${object.name || object.type}`);
  }
  object.updateWorldMatrix(true, false);
  const geometry = object.geometry.clone();
  geometry.applyMatrix4(object.matrixWorld);
  return geometry;
}

function disposeDetachedAsset(root: THREE.Object3D) {
  root.traverse((object) => {
    const renderable = object as GeometryObject;
    renderable.geometry?.dispose();
    if (Array.isArray(renderable.material)) {
      renderable.material.forEach((material) => material.dispose());
    } else {
      renderable.material?.dispose();
    }
  });
}

async function loadBrazilTopographyAsset(): Promise<BrazilTopographyAsset> {
  const gltf = await new GLTFLoader().loadAsync(HOME_BRAZIL_TOPOGRAPHY_URL);
  gltf.scene.updateMatrixWorld(true);
  const points = findGeometryByRole(gltf.scene, 'brazil-topography-points');
  const outline = findGeometryByRole(gltf.scene, 'brazil-topography-outline');
  const contours = findGeometryByRole(gltf.scene, 'brazil-topography-contours');
  if (!points || !outline || !contours) {
    disposeDetachedAsset(gltf.scene);
    throw new Error('GLB do Brasil não contém todas as camadas esperadas');
  }

  const asset = {
    points: copyWorldPositions(points),
    outline: copyWorldPositions(outline),
    contours: copyWorldPositions(contours),
  };
  disposeDetachedAsset(gltf.scene);
  if (
    asset.points.length < 300
    || asset.outline.length < 6
    || asset.contours.length < 6
  ) {
    throw new Error('GLB do Brasil contém geometria insuficiente');
  }
  return asset;
}

async function loadWorldWireframeAsset(): Promise<WorldWireframeAsset> {
  const gltf = await new GLTFLoader().loadAsync(HOME_WORLD_WIREFRAME_URL);
  gltf.scene.updateMatrixWorld(true);
  const shell = findGeometryByRole(gltf.scene, 'world-shell');
  const wireframe = findGeometryByRole(gltf.scene, 'world-wireframe');
  const points = findGeometryByRole(gltf.scene, 'world-points');
  const coastline = findGeometryByRole(gltf.scene, 'world-coastline');
  if (!shell || !wireframe || !points || !coastline) {
    disposeDetachedAsset(gltf.scene);
    throw new Error('GLB do mundo não contém todas as camadas esperadas');
  }

  const asset = {
    shell: cloneWorldGeometry(shell),
    wireframe: copyWorldPositions(wireframe),
    points: copyWorldPositions(points),
    coastline: copyWorldPositions(coastline),
  };
  disposeDetachedAsset(gltf.scene);
  if (
    asset.wireframe.length < 6
    || asset.points.length < 3
    || asset.coastline.length < 6
  ) {
    asset.shell.dispose();
    throw new Error('GLB do mundo contém geometria insuficiente');
  }
  return asset;
}

async function createDownloadedTruckWireframe() {
  const gltf = await new GLTFLoader().loadAsync(HOME_TRUCK_WIREFRAME_URL);
  const group = new THREE.Group();
  const targets: OpacityTarget[] = [];
  const wheels: THREE.Object3D[] = [];
  const sourceLines: THREE.LineSegments[] = [];
  gltf.scene.traverse((object) => {
    if (object.userData.role === 'wheel') wheels.push(object);
    if (object instanceof THREE.LineSegments) sourceLines.push(object);
  });

  sourceLines.forEach((lines) => {
    const isWheel = lines.parent?.userData.role === 'wheel';
    const isTire = /tire/i.test(lines.name);
    const isExhaust = lines.userData.role === 'exhaust';

    const haloMaterial = registerOpacity(
      targets,
      new THREE.LineBasicMaterial({
        color: COLORS.white,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        depthTest: !isExhaust,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
      isExhaust ? 0.045 : isTire ? 0.035 : isWheel ? 0.065 : 0.14,
    );
    const halo = new THREE.LineSegments(lines.geometry, haloMaterial);
    halo.scale.setScalar(1.004);
    halo.renderOrder = isExhaust ? 7 : 2;
    lines.add(halo);

    const lineMaterial = registerOpacity(
      targets,
      new THREE.LineBasicMaterial({
        color: isExhaust ? COLORS.lime : isTire ? 0x6f9e28 : COLORS.lime,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        depthTest: !isExhaust,
        blending: isWheel || isExhaust
          ? THREE.NormalBlending
          : THREE.AdditiveBlending,
        toneMapped: false,
      }),
      isExhaust ? 0.78 : isTire ? 0.58 : isWheel ? 0.48 : 0.8,
    );
    lines.material = lineMaterial;
    lines.renderOrder = isExhaust ? 8 : 3;
  });

  group.add(gltf.scene);
  const baseY = 0.02;
  group.position.y = baseY;
  return { group, targets, wheels, baseY };
}

function roundedRectShape(width: number, height: number, radius: number) {
  const left = -width / 2;
  const right = width / 2;
  const bottom = -height / 2;
  const top = height / 2;
  const shape = new THREE.Shape();
  shape.moveTo(left + radius, bottom);
  shape.lineTo(right - radius, bottom);
  shape.quadraticCurveTo(right, bottom, right, bottom + radius);
  shape.lineTo(right, top - radius);
  shape.quadraticCurveTo(right, top, right - radius, top);
  shape.lineTo(left + radius, top);
  shape.quadraticCurveTo(left, top, left, top - radius);
  shape.lineTo(left, bottom + radius);
  shape.quadraticCurveTo(left, bottom, left + radius, bottom);
  return shape;
}

function pointInPolygon([x, y]: Point2, polygon: readonly Point2[]) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const [xi, yi] = polygon[index];
    const [xj, yj] = polygon[previous];
    const deltaY = yj - yi || Number.EPSILON;
    if (
      (yi > y) !== (yj > y)
      && x < ((xj - xi) * (y - yi)) / deltaY + xi
    ) {
      inside = !inside;
    }
  }
  return inside;
}

function lonLatToSphere([longitude, latitude]: LonLat, radius: number) {
  const lat = THREE.MathUtils.degToRad(latitude);
  const lon = THREE.MathUtils.degToRad(longitude + 55);
  const horizontal = Math.cos(lat) * radius;
  return new THREE.Vector3(
    Math.sin(lon) * horizontal,
    Math.sin(lat) * radius,
    Math.cos(lon) * horizontal,
  );
}

function projectPositionsToRadius(
  values: Float32Array | readonly number[],
  radius: number,
) {
  const projected = new Float32Array(values.length);
  for (let offset = 0; offset < values.length; offset += 3) {
    const x = values[offset];
    const y = values[offset + 1];
    const z = values[offset + 2];
    const length = Math.hypot(x, y, z) || 1;
    const scale = radius / length;
    projected[offset] = x * scale;
    projected[offset + 1] = y * scale;
    projected[offset + 2] = z * scale;
  }
  return projected;
}

function createDotTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D indisponível para os pontos');
  const glow = context.createRadialGradient(32, 32, 3, 32, 32, 30);
  glow.addColorStop(0, 'rgba(255,255,255,1)');
  glow.addColorStop(0.52, 'rgba(255,255,255,.96)');
  glow.addColorStop(0.7, 'rgba(255,255,255,.34)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = glow;
  context.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function createMarkTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 528;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D indisponível para a marca RODAR');
  const margin = 26;
  context.translate(margin, margin);
  context.scale((canvas.width - margin * 2) / 775, (canvas.height - margin * 2) / 799);
  context.fillStyle = '#a2f200';
  context.fill(new Path2D(RODAR_MARK_PATH), 'evenodd');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function createGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (context) {
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
    gradient.addColorStop(0.35, 'rgba(255,255,255,0.35)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
  }
  return new THREE.CanvasTexture(canvas);
}

function createPhone(markTexture: THREE.Texture) {
  const group = new THREE.Group();
  const solidTargets: OpacityTarget[] = [];
  const wireTargets: OpacityTarget[] = [];
  const chipTargets: OpacityTarget[] = [];
  const chipTraceTargets: DrawTarget[] = [];

  const shellMaterial = registerOpacity(
    solidTargets,
    new THREE.MeshStandardMaterial({
      color: COLORS.ink,
      metalness: 0.78,
      roughness: 0.28,
      emissive: 0x101a10,
      opacity: 0,
    }),
  );
  const shell = new THREE.Mesh(
    new THREE.ExtrudeGeometry(roundedRectShape(3.15, 6.25, 0.42), {
      depth: 0.38,
      bevelEnabled: true,
      bevelSize: 0.1,
      bevelThickness: 0.08,
      bevelSegments: 3,
      curveSegments: 8,
    }).translate(0, 0, -0.19),
    shellMaterial,
  );
  group.add(shell);

  const wireMaterial = registerOpacity(
    wireTargets,
    new THREE.LineBasicMaterial({ color: COLORS.lime, opacity: 0, transparent: true, toneMapped: false }),
    0.9,
  );
  const edge = new THREE.LineSegments(new THREE.WireframeGeometry(shell.geometry), wireMaterial);
  edge.scale.setScalar(1.006);
  group.add(edge);

  const screenMaterial = registerOpacity(
    solidTargets,
    new THREE.MeshBasicMaterial({ color: COLORS.nearBlack, opacity: 0, transparent: true }),
  );
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(2.78, 5.72), screenMaterial);
  screen.position.z = 0.285;
  group.add(screen);

  const speakerMaterial = registerOpacity(
    solidTargets,
    new THREE.MeshBasicMaterial({ color: COLORS.metal, opacity: 0, transparent: true }),
    0.65,
  );
  const speaker = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.42, 3, 8), speakerMaterial);
  speaker.rotation.z = Math.PI / 2;
  speaker.position.set(0, 2.72, 0.31);
  group.add(speaker);

  const markMaterial = new THREE.MeshBasicMaterial({
    map: markTexture,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const mark = new THREE.Mesh(new THREE.PlaneGeometry(2.16, 2.23), markMaterial);
  mark.position.set(0, 0.55, 0.325);
  group.add(mark);

  const glowMaterial = new THREE.MeshBasicMaterial({
    map: markTexture,
    color: COLORS.lime,
    transparent: true,
    opacity: 0.16,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.48, 2.56), glowMaterial);
  glow.position.set(0, 0.55, 0.315);
  group.add(glow);

  const uiMaterial = registerOpacity(
    solidTargets,
    new THREE.MeshBasicMaterial({ color: COLORS.lime, opacity: 0, transparent: true, toneMapped: false }),
    0.84,
  );
  const uiDarkMaterial = registerOpacity(
    solidTargets,
    new THREE.MeshBasicMaterial({ color: COLORS.inkLight, opacity: 0, transparent: true }),
    0.92,
  );
  for (let index = 0; index < 5; index += 1) {
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.18 + index * 0.06, 0.055), uiMaterial);
    bar.position.set(-0.56 + index * 0.28, -0.66 + Math.sin(index) * 0.12, 0.33);
    group.add(bar);
  }
  const message = new THREE.Mesh(new THREE.PlaneGeometry(2.05, 0.48), uiDarkMaterial);
  message.position.set(0, -1.48, 0.326);
  group.add(message);
  const messageAccent = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.48), uiMaterial);
  messageAccent.position.set(-1, -1.48, 0.332);
  group.add(messageAccent);

  const screenWireMaterial = registerOpacity(
    wireTargets,
    new THREE.LineBasicMaterial({
      color: COLORS.white,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
    0.52,
  );
  const screenWire: number[] = [
    -1.39, -2.86, 0.337, 1.39, -2.86, 0.337,
    1.39, -2.86, 0.337, 1.39, 2.86, 0.337,
    1.39, 2.86, 0.337, -1.39, 2.86, 0.337,
    -1.39, 2.86, 0.337, -1.39, -2.86, 0.337,
  ];
  for (let x = -1.05; x <= 1.05; x += 0.35) {
    screenWire.push(x, -2.72, 0.34, x, 2.58, 0.34);
  }
  for (let y = -2.45; y <= 2.45; y += 0.35) {
    screenWire.push(-1.26, y, 0.34, 1.26, y, 0.34);
  }
  group.add(new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute(
      'position',
      new THREE.Float32BufferAttribute(screenWire, 3),
    ),
    screenWireMaterial,
  ));

  const chipCore = new THREE.Group();
  chipCore.position.set(0, 0.55, 0.08);
  group.add(chipCore);
  const chipBody = new THREE.Group();
  chipCore.add(chipBody);
  const chipMaterial = registerOpacity(
    chipTargets,
    new THREE.MeshStandardMaterial({
      color: COLORS.nearBlack,
      emissive: COLORS.limeDark,
      emissiveIntensity: 0.16,
      metalness: 0.58,
      roughness: 0.34,
      opacity: 0,
    }),
    0.72,
  );
  const chipPlate = new THREE.Mesh(new THREE.BoxGeometry(3.72, 3.72, 0.2, 2, 2, 1), chipMaterial);
  chipBody.add(chipPlate);
  const chipEdgeMaterial = registerOpacity(
    chipTargets,
    new THREE.LineBasicMaterial({
      color: COLORS.lime,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
    0.96,
  );
  chipBody.add(new THREE.LineSegments(new THREE.EdgesGeometry(chipPlate.geometry), chipEdgeMaterial));
  const innerChip = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-1.48, -1.48, 0.115),
      new THREE.Vector3(1.48, -1.48, 0.115),
      new THREE.Vector3(1.48, 1.48, 0.115),
      new THREE.Vector3(-1.48, 1.48, 0.115),
    ]),
    chipEdgeMaterial,
  );
  chipBody.add(innerChip);

  const pinMaterial = registerOpacity(
    chipTargets,
    new THREE.MeshBasicMaterial({
      color: COLORS.lime,
      transparent: true,
      opacity: 0,
      toneMapped: false,
    }),
    0.78,
  );
  const pinGeometry = new THREE.BoxGeometry(0.55, 0.045, 0.075);
  const pinsPerSide = 11;
  const pins = new THREE.InstancedMesh(pinGeometry, pinMaterial, pinsPerSide * 4);
  // Pins listed clockwise around the package so they light up in sequence.
  const pinLayout: { side: 'left' | 'top' | 'right' | 'bottom'; offset: number }[] = [];
  for (let index = 0; index < pinsPerSide; index += 1) pinLayout.push({ side: 'top', offset: -1.5 + index * 0.3 });
  for (let index = 0; index < pinsPerSide; index += 1) pinLayout.push({ side: 'right', offset: 1.5 - index * 0.3 });
  for (let index = 0; index < pinsPerSide; index += 1) pinLayout.push({ side: 'bottom', offset: 1.5 - index * 0.3 });
  for (let index = 0; index < pinsPerSide; index += 1) pinLayout.push({ side: 'left', offset: -1.5 + index * 0.3 });
  const pinTransform = new THREE.Object3D();
  const setPinGrowth = (index: number, growth: number) => {
    const { side, offset } = pinLayout[index];
    // The pin grows outwards from the package edge (inner end at 1.765).
    const length = Math.max(0.0001, growth);
    const reach = 1.765 + 0.275 * length;
    const horizontal = side === 'left' || side === 'right';
    const sign = side === 'left' || side === 'bottom' ? -1 : 1;
    pinTransform.position.set(
      horizontal ? sign * reach : offset,
      horizontal ? offset : sign * reach,
      0.01,
    );
    pinTransform.rotation.set(0, 0, horizontal ? 0 : Math.PI / 2);
    pinTransform.scale.set(length, 1, 1);
    pinTransform.updateMatrix();
    pins.setMatrixAt(index, pinTransform.matrix);
  };
  pinLayout.forEach((_, index) => setPinGrowth(index, 1));
  pins.instanceMatrix.needsUpdate = true;
  chipCore.add(pins);

  const chipTraceMaterial = new THREE.LineBasicMaterial({
    color: COLORS.lime,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  // Traces are resampled densely so drawing them is continuous instead of
  // jumping a whole segment at a time.
  const traceDelays: number[] = [];
  const traceSamples: THREE.Vector3[][] = [];
  const addTrace = (corners: THREE.Vector3[]) => {
    const points: THREE.Vector3[] = [corners[0].clone()];
    for (let index = 1; index < corners.length; index += 1) {
      const from = corners[index - 1];
      const to = corners[index];
      const steps = Math.max(2, Math.ceil(from.distanceTo(to) / 0.04));
      for (let step = 1; step <= steps; step += 1) points.push(from.clone().lerp(to, step / steps));
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    geometry.setDrawRange(0, 0);
    chipTraceTargets.push({ geometry, count: points.length });
    traceSamples.push(points);
    group.add(new THREE.Line(geometry, chipTraceMaterial));
  };
  for (let index = 0; index < 11; index += 1) {
    const offset = -1.5 + index * 0.3;
    const bend = (index % 3 - 1) * 0.22;
    const length = 4.35 + (index % 4) * 0.32;
    addTrace([
      new THREE.Vector3(-2.08, 0.55 + offset, 0.12),
      new THREE.Vector3(-2.55, 0.55 + offset, 0.12),
      new THREE.Vector3(-2.95, 0.55 + offset + bend, 0.12),
      new THREE.Vector3(-length, 0.55 + offset + bend, 0.12),
    ]);
    addTrace([
      new THREE.Vector3(2.08, 0.55 + offset, 0.12),
      new THREE.Vector3(2.55, 0.55 + offset, 0.12),
      new THREE.Vector3(2.95, 0.55 + offset - bend, 0.12),
      new THREE.Vector3(length, 0.55 + offset - bend, 0.12),
    ]);
    addTrace([
      new THREE.Vector3(offset, 2.63, 0.12),
      new THREE.Vector3(offset, 3.02, 0.12),
      new THREE.Vector3(offset + bend, 3.42, 0.12),
      new THREE.Vector3(offset + bend, length, 0.12),
    ]);
    addTrace([
      new THREE.Vector3(offset, -1.53, 0.12),
      new THREE.Vector3(offset, -2.02, 0.12),
      new THREE.Vector3(offset - bend, -2.42, 0.12),
      new THREE.Vector3(offset - bend, -length + 0.55, 0.12),
    ]);
  }

  // Deterministic, scattered start times: traces leave the chip one by one.
  chipTraceTargets.forEach((_, index) => {
    traceDelays.push(((index * 37) % chipTraceTargets.length) / chipTraceTargets.length);
  });
  const headPositions = new Float32Array(chipTraceTargets.length * 3);
  const headGeometry = new THREE.BufferGeometry();
  headGeometry.setAttribute('position', new THREE.BufferAttribute(headPositions, 3));
  const headMaterial = new THREE.PointsMaterial({
    color: COLORS.lime,
    size: 0.11,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const heads = new THREE.Points(headGeometry, headMaterial);
  heads.frustumCulled = false;
  group.add(heads);

  const ease = (value: number) => 1 - Math.pow(1 - THREE.MathUtils.clamp(value, 0, 1), 3);
  const chipPlateMaterials = [chipMaterial, chipEdgeMaterial];
  /**
   * Builds the processor in stages: package, pins in sequence around the
   * edge, then traces flowing out with a bright head.
   */
  const applyChipBuild = (build: number, traceProgress: number, opacity: number) => {
    const plate = ease(segment(build, 0, 0.32));
    chipBody.scale.set(
      THREE.MathUtils.lerp(0.72, 1, plate),
      THREE.MathUtils.lerp(0.72, 1, plate),
      THREE.MathUtils.lerp(0.2, 1, plate),
    );
    chipBody.rotation.z = (1 - plate) * -0.12;
    chipPlateMaterials.forEach((material) => {
      material.opacity *= plate;
      material.visible = material.opacity > 0.001;
    });
    pinLayout.forEach((_, index) => {
      const start = 0.16 + (index / pinLayout.length) * 0.46;
      setPinGrowth(index, ease(segment(build, start, start + 0.14)));
    });
    pins.instanceMatrix.needsUpdate = true;

    chipTraceTargets.forEach(({ geometry, count }, index) => {
      const delay = traceDelays[index] * 0.42;
      const amount = ease(segment(traceProgress, delay, delay + 0.58));
      const drawn = Math.round(count * amount);
      geometry.setDrawRange(0, drawn);
      const head = traceSamples[index][Math.max(0, Math.min(count - 1, drawn - 1))];
      // Hide the head once the trace is complete (or not started).
      const z = amount > 0.01 && amount < 0.99 ? head.z + 0.01 : -999;
      headPositions.set([head.x, head.y, z], index * 3);
    });
    headGeometry.getAttribute('position').needsUpdate = true;
    chipTraceMaterial.opacity = opacity * 0.82;
    chipTraceMaterial.visible = chipTraceMaterial.opacity > 0.001;
    headMaterial.opacity = opacity;
    headMaterial.visible = opacity > 0.001;
  };

  return {
    group,
    solidTargets,
    wireTargets,
    chipTargets,
    applyChipBuild,
    chipCore,
    mark,
    markMaterial,
    glowMaterial,
  };
}

function createCabGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(-1.15, -1.05);
  shape.lineTo(1.05, -1.05);
  shape.lineTo(1.05, 0.65);
  shape.lineTo(0.55, 1.52);
  shape.lineTo(-1.02, 1.52);
  shape.lineTo(-1.15, 1.25);
  shape.lineTo(-1.15, -1.05);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 2.42,
    bevelEnabled: true,
    bevelSize: 0.06,
    bevelThickness: 0.05,
    bevelSegments: 2,
    curveSegments: 2,
  });
  geometry.translate(0, 0, -1.21);
  return geometry;
}

function createHoodGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(-1, -0.62);
  shape.lineTo(1, -0.62);
  shape.lineTo(1, 0.42);
  shape.lineTo(0.72, 0.53);
  shape.lineTo(-0.75, 0.68);
  shape.lineTo(-1, 0.58);
  shape.lineTo(-1, -0.62);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 2.2,
    bevelEnabled: true,
    bevelSize: 0.045,
    bevelThickness: 0.04,
    bevelSegments: 2,
    curveSegments: 2,
  });
  geometry.translate(0, 0, -1.1);
  return geometry;
}

function createTruck(markTexture: THREE.Texture) {
  const group = new THREE.Group();
  const solidTargets: OpacityTarget[] = [];
  const wireTargets: OpacityTarget[] = [];
  const cabinTargets: OpacityTarget[] = [];

  const addMesh = (
    geometry: THREE.BufferGeometry,
    material: THREE.MeshStandardMaterial | THREE.MeshBasicMaterial,
    position: THREE.Vector3Tuple,
    rotation?: THREE.Euler,
    wireOpacity = 0.84,
    denseWire = false,
  ) => {
    registerOpacity(solidTargets, material);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    if (rotation) mesh.rotation.copy(rotation);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    const lineMaterial = registerOpacity(
      wireTargets,
      new THREE.LineBasicMaterial({
        color: COLORS.lime,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
      wireOpacity,
    );
    const wireGeometry = denseWire
      ? new THREE.WireframeGeometry(geometry)
      : new THREE.EdgesGeometry(geometry, 22);
    const edges = new THREE.LineSegments(wireGeometry, lineMaterial);
    edges.scale.setScalar(1.004);
    mesh.add(edges);
    return mesh;
  };

  addMesh(
    new THREE.BoxGeometry(8.9, 3.42, 2.48, 12, 5, 4),
    new THREE.MeshStandardMaterial({ color: 0xc9d0cb, metalness: 0.26, roughness: 0.52, opacity: 0 }),
    [-1.95, 2.42, 0],
    undefined,
    0.62,
    false,
  );
  addMesh(
    new THREE.BoxGeometry(8.82, 0.22, 2.54),
    new THREE.MeshStandardMaterial({ color: COLORS.limeDark, metalness: 0.32, roughness: 0.4, opacity: 0 }),
    [-1.95, 1.76, 0],
  );
  addMesh(
    new THREE.BoxGeometry(10.5, 0.22, 2.12),
    new THREE.MeshStandardMaterial({ color: COLORS.ink, metalness: 0.76, roughness: 0.32, opacity: 0 }),
    [-0.65, 0.72, 0],
  );
  addMesh(
    createCabGeometry(),
    new THREE.MeshStandardMaterial({ color: 0xdce1dd, metalness: 0.44, roughness: 0.35, opacity: 0 }),
    [3.65, 1.8, 0],
    undefined,
    0.9,
    false,
  );
  addMesh(
    createHoodGeometry(),
    new THREE.MeshStandardMaterial({ color: 0xc8d0ca, metalness: 0.48, roughness: 0.34, opacity: 0 }),
    [5.65, 1.48, 0],
    undefined,
    0.9,
    false,
  );
  addMesh(
    new THREE.BoxGeometry(0.28, 0.28, 2.58),
    new THREE.MeshStandardMaterial({ color: COLORS.metal, metalness: 0.82, roughness: 0.22, opacity: 0 }),
    [6.82, 0.66, 0],
    undefined,
    0.9,
  );
  addMesh(
    new THREE.BoxGeometry(0.18, 1.46, 2.08, 1, 3, 2),
    new THREE.MeshStandardMaterial({ color: 0x263029, metalness: 0.8, roughness: 0.24, opacity: 0 }),
    [6.72, 1.5, 0],
    undefined,
    0.96,
    false,
  );
  addMesh(
    new THREE.BoxGeometry(2.2, 0.22, 2.34),
    new THREE.MeshStandardMaterial({ color: 0xd2d8d3, metalness: 0.42, roughness: 0.38, opacity: 0 }),
    [3.62, 3.37, 0],
    undefined,
    0.72,
  );
  [-1.08, 1.08].forEach((z) => {
    addMesh(
      new THREE.CylinderGeometry(0.12, 0.15, 2.55, 14, 5),
      new THREE.MeshStandardMaterial({ color: COLORS.metal, metalness: 0.88, roughness: 0.18, opacity: 0 }),
      [3.18, 2.65, z],
      undefined,
      0.7,
      false,
    );
    addMesh(
      new THREE.CylinderGeometry(0.36, 0.36, 1.15, 20, 3),
      new THREE.MeshStandardMaterial({ color: COLORS.metal, metalness: 0.72, roughness: 0.3, opacity: 0 }),
      [4.48, 0.92, z],
      new THREE.Euler(0, 0, Math.PI / 2),
      0.78,
      false,
    );
    addMesh(
      new THREE.BoxGeometry(0.48, 0.32, 0.1),
      new THREE.MeshStandardMaterial({ color: COLORS.ink, metalness: 0.54, roughness: 0.32, opacity: 0 }),
      [4.62, 2.78, z * 1.38],
      undefined,
      0.82,
    );
  });
  addMesh(
    new THREE.BoxGeometry(8.95, 0.13, 2.67),
    new THREE.MeshStandardMaterial({ color: COLORS.metal, metalness: 0.7, roughness: 0.28, opacity: 0 }),
    [-1.96, 4.16, 0],
    undefined,
    0.68,
  );
  addMesh(
    new THREE.BoxGeometry(0.18, 3.36, 2.66, 1, 7, 5),
    new THREE.MeshStandardMaterial({ color: 0xaeb8b1, metalness: 0.45, roughness: 0.4, opacity: 0 }),
    [-6.44, 2.42, 0],
    undefined,
    0.88,
    true,
  );

  const exteriorDetailMaterial = registerOpacity(
    wireTargets,
    new THREE.LineBasicMaterial({
      color: COLORS.lime,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
    0.88,
  );
  const exteriorSecondaryMaterial = registerOpacity(
    wireTargets,
    new THREE.LineBasicMaterial({
      color: COLORS.white,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
    0.68,
  );
  const addExteriorPolyline = (
    points: readonly THREE.Vector3Tuple[],
    material = exteriorDetailMaterial,
    closed = false,
  ) => {
    const geometry = new THREE.BufferGeometry().setFromPoints(
      points.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
    );
    const line = closed
      ? new THREE.LineLoop(geometry, material)
      : new THREE.Line(geometry, material);
    group.add(line);
    return line;
  };

  const frontPlane = (width: number, height: number, color: number, x: number, y: number, z: number) => {
    const material = registerOpacity(
      solidTargets,
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, side: THREE.DoubleSide }),
    );
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };

  const window = frontPlane(1.05, 0.82, 0x101c18, 4.12, 2.76, 1.225);
  window.rotation.z = -0.04;
  frontPlane(0.72, 0.48, COLORS.inkLight, 5.75, 1.12, 1.26);
  frontPlane(0.32, 0.18, COLORS.lime, 6.03, 0.92, 1.28);
  frontPlane(2.2, 0.15, COLORS.lime, 4.15, 1.25, 1.275);

  [-1.225, 1.225].forEach((z) => {
    addExteriorPolyline([
      [3.57, 2.4, z],
      [3.58, 3.18, z],
      [4.15, 3.18, z],
      [4.6, 2.43, z],
    ], exteriorSecondaryMaterial, true);
    addExteriorPolyline([
      [2.67, 2.42, z],
      [2.67, 3.12, z],
      [3.4, 3.12, z],
      [3.4, 2.42, z],
    ], exteriorDetailMaterial, true);
    addExteriorPolyline([
      [3.43, 0.86, z],
      [3.43, 2.34, z],
      [4.57, 2.34, z],
      [4.57, 0.9, z],
    ], exteriorSecondaryMaterial, true);
    addExteriorPolyline([
      [3.55, 1.12, z * 1.01],
      [4.42, 1.12, z * 1.01],
      [4.42, 1.36, z * 1.01],
      [3.55, 1.36, z * 1.01],
    ], exteriorDetailMaterial, true);
    addExteriorPolyline([
      [4.7, 0.86, z * 0.91],
      [6.65, 0.86, z * 0.91],
      [6.65, 1.9, z * 0.91],
      [6.37, 2.01, z * 0.91],
      [4.9, 2.16, z * 0.91],
      [4.65, 2.06, z * 0.91],
    ], exteriorDetailMaterial, true);
    for (let index = 0; index < 6; index += 1) {
      const x = 5.82 + index * 0.105;
      addExteriorPolyline([
        [x, 1.42, z * 0.915],
        [x + 0.035, 1.82, z * 0.915],
      ], exteriorSecondaryMaterial);
    }
  });
  addExteriorPolyline([
    [4.9, 2.18, 0],
    [6.38, 2.03, 0],
    [6.65, 1.92, 0],
  ], exteriorSecondaryMaterial);

  [-1.24, 1.24].forEach((z) => {
    const outerFender = Array.from({ length: 37 }, (_, index): THREE.Vector3Tuple => {
      const angle = (index / 36) * Math.PI;
      return [
        5.5 + Math.cos(angle) * 0.82,
        0.65 + Math.sin(angle) * 0.82,
        z,
      ];
    });
    const innerFender = Array.from({ length: 37 }, (_, index): THREE.Vector3Tuple => {
      const angle = Math.PI - (index / 36) * Math.PI;
      return [
        5.5 + Math.cos(angle) * 0.68,
        0.65 + Math.sin(angle) * 0.68,
        z,
      ];
    });
    addExteriorPolyline([...outerFender, ...innerFender], exteriorSecondaryMaterial, true);
  });

  const frontFaceMaterial = registerOpacity(
    solidTargets,
    new THREE.MeshBasicMaterial({
      color: 0x27312b,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    }),
  );
  const grille = new THREE.Mesh(new THREE.PlaneGeometry(1.86, 1.28), frontFaceMaterial);
  grille.position.set(6.82, 1.5, 0);
  grille.rotation.y = Math.PI / 2;
  group.add(grille);
  const grilleWireMaterial = registerOpacity(
    wireTargets,
    new THREE.LineBasicMaterial({
      color: COLORS.white,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
    0.7,
  );
  const grilleWire = new THREE.LineSegments(new THREE.EdgesGeometry(grille.geometry), grilleWireMaterial);
  grilleWire.position.copy(grille.position);
  grilleWire.rotation.copy(grille.rotation);
  group.add(grilleWire);
  for (let index = 0; index < 13; index += 1) {
    const z = THREE.MathUtils.lerp(-0.82, 0.82, index / 12);
    addExteriorPolyline([
      [6.925, 0.91, z],
      [6.925, 2.09, z],
    ], index % 3 === 0 ? exteriorSecondaryMaterial : exteriorDetailMaterial);
  }
  for (let index = 1; index < 4; index += 1) {
    const y = 0.91 + index * 0.295;
    addExteriorPolyline([
      [6.93, y, -0.84],
      [6.93, y, 0.84],
    ], exteriorSecondaryMaterial);
  }
  addMesh(
    new THREE.BoxGeometry(0.13, 0.34, 0.44),
    new THREE.MeshBasicMaterial({ color: COLORS.white, transparent: true, opacity: 0 }),
    [6.89, 1.08, -0.76],
    undefined,
    0.92,
  );
  addMesh(
    new THREE.BoxGeometry(0.13, 0.34, 0.44),
    new THREE.MeshBasicMaterial({ color: COLORS.white, transparent: true, opacity: 0 }),
    [6.89, 1.08, 0.76],
    undefined,
    0.92,
  );
  for (let index = 0; index < 9; index += 1) {
    const z = THREE.MathUtils.lerp(-1.02, 1.02, index / 8);
    addMesh(
      new THREE.BoxGeometry(0.08, 0.08, 0.08),
      new THREE.MeshBasicMaterial({ color: COLORS.lime, transparent: true, opacity: 0 }),
      [6.985, 0.68, z],
      undefined,
      0.76,
    );
  }

  [-1.08, 1.08].forEach((z) => {
    addMesh(
      new THREE.CylinderGeometry(0.13, 0.115, 0.42, 14, 2),
      new THREE.MeshStandardMaterial({ color: COLORS.metal, metalness: 0.88, roughness: 0.18, opacity: 0 }),
      [3.14, 4.03, z],
      new THREE.Euler(0, 0, -0.18),
      0.7,
      false,
    );
    addExteriorPolyline([
      [4.36, 2.92, z * 1.12],
      [4.77, 2.96, z * 1.37],
      [4.93, 2.75, z * 1.4],
    ], exteriorSecondaryMaterial);
  });

  const structureMaterial = registerOpacity(
    wireTargets,
    new THREE.LineBasicMaterial({
      color: COLORS.white,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
    0.48,
  );
  const structuralLines: number[] = [];
  for (let x = -6.3; x <= 2.18; x += 0.68) {
    [-1.28, 1.28].forEach((z) => {
      structuralLines.push(x, 0.72, z, x, 4.14, z);
      structuralLines.push(x, 0.72, z, x + 0.52, 4.14, z);
    });
  }
  for (let z = -1.28; z <= 1.28; z += 0.42) {
    structuralLines.push(-6.34, 0.75, z, -6.34, 4.1, z);
    structuralLines.push(-6.34, 0.75, z, -6.34, 0.75, Math.min(1.28, z + 0.42));
  }
  structuralLines.push(
    -6.3, 0.7, -1.4, 6.5, 0.7, -1.4,
    -6.3, 0.7, 1.4, 6.5, 0.7, 1.4,
    3.18, 1.5, -1.26, 6.55, 1.5, -1.26,
    3.18, 1.5, 1.26, 6.55, 1.5, 1.26,
  );
  group.add(new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute(
      'position',
      new THREE.Float32BufferAttribute(structuralLines, 3),
    ),
    structureMaterial,
  ));

  const cabinInterior = new THREE.Group();
  // The dashboard is drawn in neutral tones; lime is reserved for the phone.
  const cabinPrimaryMaterial = registerOpacity(
    cabinTargets,
    new THREE.LineBasicMaterial({
      color: 0xd5ddd7,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
    0.5,
  );
  const cabinSecondaryMaterial = registerOpacity(
    cabinTargets,
    new THREE.LineBasicMaterial({
      color: COLORS.white,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
    0.34,
  );
  const cabinMutedMaterial = registerOpacity(
    cabinTargets,
    new THREE.LineBasicMaterial({
      color: 0x7d8a80,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
    0.42,
  );
  const cabinDetailMaterial = registerOpacity(
    cabinTargets,
    new THREE.LineBasicMaterial({
      color: 0x9aa69d,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
    0.2,
  );
  const phoneAccentMaterial = registerOpacity(
    cabinTargets,
    new THREE.LineBasicMaterial({
      color: COLORS.lime,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
    1,
  );
  const addCabinPolyline = (
    points: readonly THREE.Vector3Tuple[],
    material = cabinSecondaryMaterial,
    closed = false,
  ) => {
    const geometry = new THREE.BufferGeometry().setFromPoints(
      points.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
    );
    const line = closed
      ? new THREE.LineLoop(geometry, material)
      : new THREE.Line(geometry, material);
    cabinInterior.add(line);
    return line;
  };
  const addCabinSegment = (
    from: THREE.Vector3Tuple,
    to: THREE.Vector3Tuple,
    material = cabinMutedMaterial,
  ) => addCabinPolyline([from, to], material);
  const addCabinRect = (
    x: number,
    minY: number,
    maxY: number,
    minZ: number,
    maxZ: number,
    material = cabinSecondaryMaterial,
  ) => addCabinPolyline([
    [x, minY, minZ],
    [x, minY, maxZ],
    [x, maxY, maxZ],
    [x, maxY, minZ],
  ], material, true);
  const addCabinEllipse = (
    x: number,
    centerY: number,
    centerZ: number,
    radiusY: number,
    radiusZ: number,
    material = cabinSecondaryMaterial,
    segments = 44,
  ) => {
    const points = Array.from({ length: segments }, (_, index): THREE.Vector3Tuple => {
      const angle = (index / segments) * Math.PI * 2;
      return [
        x,
        centerY + Math.sin(angle) * radiusY,
        centerZ + Math.cos(angle) * radiusZ,
      ];
    });
    return addCabinPolyline(points, material, true);
  };
  const addVent = (
    centerZ: number,
    minY: number,
    maxY: number,
    width: number,
  ) => {
    const minZ = centerZ - width / 2;
    const maxZ = centerZ + width / 2;
    addCabinRect(5.01, minY, maxY, minZ, maxZ, cabinPrimaryMaterial);
    for (let index = 1; index < 5; index += 1) {
      const y = THREE.MathUtils.lerp(minY, maxY, index / 5);
      addCabinSegment([4.995, y, minZ + 0.025], [4.995, y, maxZ - 0.025], cabinMutedMaterial);
    }
  };

  // Para-brisa, pilares e linha superior da cabine.
  addCabinPolyline([
    [5.22, 2.39, -1.22],
    [5.22, 3.08, -1.17],
    [5.22, 3.25, -0.98],
    [5.22, 3.29, 0.98],
    [5.22, 3.13, 1.18],
    [5.22, 2.39, 1.23],
  ], cabinSecondaryMaterial, true);
  addCabinPolyline([
    [5.16, 2.46, -1.12],
    [5.16, 3.04, -1.07],
    [5.16, 3.17, -0.91],
    [5.16, 3.2, 0.91],
    [5.16, 3.07, 1.08],
    [5.16, 2.46, 1.13],
  ], cabinMutedMaterial, true);
  addCabinSegment([5.19, 2.42, -1.2], [4.78, 1.32, -1.2], cabinSecondaryMaterial);
  addCabinSegment([5.19, 2.42, 1.2], [4.78, 1.32, 1.2], cabinSecondaryMaterial);
  addCabinSegment([5.19, 3.1, -1.15], [4.76, 3.28, -1.15], cabinMutedMaterial);
  addCabinSegment([5.19, 3.1, 1.15], [4.76, 3.28, 1.15], cabinMutedMaterial);
  addCabinSegment([5.18, 2.52, -0.88], [5.18, 2.46, -0.1], cabinMutedMaterial);
  addCabinSegment([5.18, 2.52, 0.88], [5.18, 2.46, 0.1], cabinMutedMaterial);

  // Limpadores deixam imediatamente claro que a cena é o interior de um veículo.
  addCabinPolyline([
    [5.08, 2.48, -0.86],
    [5.08, 2.61, -0.28],
    [5.08, 2.62, -0.08],
  ], cabinMutedMaterial);
  addCabinPolyline([
    [5.08, 2.48, 0.86],
    [5.08, 2.61, 0.28],
    [5.08, 2.62, 0.08],
  ], cabinMutedMaterial);

  // Painel contínuo e fascia inferior.
  addCabinPolyline([
    [5.03, 2.43, -1.19],
    [4.98, 2.39, -0.98],
    [4.94, 2.46, -0.76],
    [4.97, 2.45, -0.2],
    [5.01, 2.38, 0.18],
    [5.04, 2.37, 1.17],
  ], cabinPrimaryMaterial);
  addCabinPolyline([
    [4.93, 1.49, -1.18],
    [4.9, 1.42, -0.88],
    [4.88, 1.36, -0.18],
    [4.9, 1.39, 0.67],
    [4.94, 1.48, 1.18],
  ], cabinPrimaryMaterial);
  addCabinSegment([5.02, 2.31, -1.18], [4.93, 1.49, -1.18], cabinSecondaryMaterial);
  addCabinSegment([5.04, 2.31, 1.18], [4.94, 1.48, 1.18], cabinSecondaryMaterial);
  addCabinSegment([4.91, 1.2, -1.12], [4.91, 1.2, 1.12], cabinMutedMaterial);

  // Porta do motorista: painel, puxador e comandos.
  addCabinPolyline([
    [4.94, 1.34, -1.18],
    [4.97, 2.29, -1.18],
    [4.94, 2.2, -0.97],
    [4.88, 1.48, -0.96],
  ], cabinSecondaryMaterial, true);
  addCabinRect(4.87, 1.76, 1.91, -1.14, -0.99, cabinMutedMaterial);
  addCabinSegment([4.86, 2.03, -1.14], [4.86, 2.03, -1.01], cabinPrimaryMaterial);
  addCabinSegment([4.86, 1.6, -1.14], [4.86, 1.6, -1.01], cabinMutedMaterial);

  // Quadro de instrumentos atrás do volante.
  addCabinPolyline([
    [5.04, 2.08, -1.02],
    [5.04, 2.48, -0.94],
    [5.04, 2.58, -0.79],
    [5.04, 2.59, -0.32],
    [5.04, 2.48, -0.17],
    [5.04, 2.08, -0.15],
  ], cabinPrimaryMaterial, true);
  [-0.78, -0.39].forEach((z, index) => {
    addCabinEllipse(5.025, 2.34, z, 0.17, 0.16, cabinSecondaryMaterial, 36);
    const needleAngle = index === 0 ? -0.72 : 0.58;
    addCabinSegment(
      [5.01, 2.34, z],
      [
        5.01,
        2.34 + Math.sin(needleAngle) * 0.115,
        z + Math.cos(needleAngle) * 0.105,
      ],
      cabinPrimaryMaterial,
    );
  });
  addCabinRect(5.01, 2.25, 2.42, -0.65, -0.53, cabinMutedMaterial);

  // Volante limpo: dois aros, cubo e três raios, sem a malha caótica anterior.
  const steeringX = 4.7;
  const steeringY = 1.98;
  const steeringZ = -0.59;
  addCabinEllipse(steeringX, steeringY, steeringZ, 0.44, 0.44, cabinSecondaryMaterial, 64);
  addCabinEllipse(steeringX, steeringY, steeringZ, 0.35, 0.35, cabinSecondaryMaterial, 64);
  addCabinPolyline([
    [steeringX - 0.01, steeringY + 0.11, steeringZ - 0.1],
    [steeringX - 0.01, steeringY + 0.11, steeringZ + 0.1],
    [steeringX - 0.01, steeringY - 0.09, steeringZ + 0.13],
    [steeringX - 0.01, steeringY - 0.13, steeringZ],
    [steeringX - 0.01, steeringY - 0.09, steeringZ - 0.13],
  ], cabinPrimaryMaterial, true);
  addCabinSegment(
    [steeringX, steeringY, steeringZ - 0.12],
    [steeringX, steeringY + 0.03, steeringZ - 0.34],
    cabinPrimaryMaterial,
  );
  addCabinSegment(
    [steeringX, steeringY, steeringZ + 0.12],
    [steeringX, steeringY + 0.03, steeringZ + 0.34],
    cabinPrimaryMaterial,
  );
  addCabinSegment(
    [steeringX, steeringY - 0.12, steeringZ],
    [steeringX, steeringY - 0.35, steeringZ],
    cabinPrimaryMaterial,
  );
  addCabinSegment([steeringX + 0.01, 1.85, steeringZ], [5.09, 1.6, steeringZ], cabinMutedMaterial);

  // Central multimídia, saídas de ar e controles do painel.
  addVent(-1.03, 2.02, 2.32, 0.22);
  addVent(1.02, 2.02, 2.32, 0.22);
  addCabinRect(4.98, 2.06, 2.43, -0.03, 0.57, cabinPrimaryMaterial);
  addCabinRect(4.965, 2.11, 2.38, 0.03, 0.51, cabinMutedMaterial);
  for (let index = 0; index < 3; index += 1) {
    const y = 2.18 + index * 0.065;
    addCabinSegment([4.95, y, 0.1], [4.95, y, 0.44], cabinMutedMaterial);
  }
  addCabinEllipse(4.95, 2.24, -0.005, 0.045, 0.045, cabinSecondaryMaterial, 24);
  addCabinEllipse(4.95, 2.24, 0.545, 0.045, 0.045, cabinSecondaryMaterial, 24);
  addCabinRect(4.94, 1.84, 2.0, -0.03, 0.57, cabinSecondaryMaterial);
  for (let index = 0; index < 6; index += 1) {
    const z = 0.015 + index * 0.1;
    addCabinRect(4.925, 1.89, 1.95, z, z + 0.065, cabinMutedMaterial);
  }
  addCabinRect(4.93, 1.49, 1.8, 0.02, 0.61, cabinPrimaryMaterial);
  [0.13, 0.31, 0.49].forEach((z) => {
    addCabinEllipse(4.91, 1.65, z, 0.07, 0.07, cabinSecondaryMaterial, 28);
  });

  // Console central, porta-copos, alavanca e pedais.
  addCabinPolyline([
    [4.78, 1.42, 0.14],
    [4.55, 1.12, 0.24],
    [4.48, 1.08, 0.97],
    [4.75, 1.42, 0.73],
  ], cabinPrimaryMaterial, true);
  addCabinEllipse(4.5, 1.2, 0.48, 0.06, 0.13, cabinSecondaryMaterial, 32);
  addCabinEllipse(4.5, 1.18, 0.78, 0.06, 0.13, cabinSecondaryMaterial, 32);
  addCabinSegment([4.54, 1.22, 0.18], [4.62, 1.62, 0.08], cabinSecondaryMaterial);
  addCabinEllipse(4.62, 1.66, 0.06, 0.07, 0.07, cabinPrimaryMaterial, 28);
  addCabinRect(4.87, 1.24, 1.36, -0.87, -0.69, cabinMutedMaterial);
  addCabinRect(4.87, 1.24, 1.36, -0.57, -0.39, cabinMutedMaterial);

  // Painel do passageiro e nicho inferior.
  addCabinRect(4.98, 1.64, 2.02, 0.67, 1.14, cabinSecondaryMaterial);
  addCabinSegment([4.96, 1.92, 0.73], [4.96, 1.92, 1.08], cabinMutedMaterial);
  addCabinRect(4.93, 1.38, 1.56, 0.7, 1.11, cabinMutedMaterial);

  const addCabinArc = (
    x: number,
    centerY: number,
    centerZ: number,
    radius: number,
    from: number,
    to: number,
    material: THREE.LineBasicMaterial,
    segments = 24,
  ) => addCabinPolyline(
    Array.from({ length: segments + 1 }, (_, index): THREE.Vector3Tuple => {
      const angle = THREE.MathUtils.lerp(from, to, index / segments);
      return [x, centerY + Math.sin(angle) * radius, centerZ + Math.cos(angle) * radius];
    }),
    material,
  );

  // Mais detalhe no volante: espessura do aro, pegada, botões nos raios e coluna.
  [-0.03, 0.03].forEach((offset) => {
    addCabinEllipse(steeringX + offset, steeringY, steeringZ, 0.44, 0.44, cabinDetailMaterial, 64);
    addCabinEllipse(steeringX + offset, steeringY, steeringZ, 0.35, 0.35, cabinDetailMaterial, 64);
  });
  for (let index = 0; index < 36; index += 1) {
    const angle = (index / 36) * Math.PI * 2;
    addCabinSegment(
      [steeringX, steeringY + Math.sin(angle) * 0.35, steeringZ + Math.cos(angle) * 0.35],
      [steeringX, steeringY + Math.sin(angle) * 0.44, steeringZ + Math.cos(angle) * 0.44],
      cabinDetailMaterial,
    );
  }
  [-1, 1].forEach((side) => {
    const z = steeringZ + side * 0.22;
    addCabinRect(steeringX - 0.015, steeringY - 0.02, steeringY + 0.07, z - 0.055, z + 0.055, cabinMutedMaterial);
    [-0.03, 0.03].forEach((dz) => {
      addCabinEllipse(steeringX - 0.02, steeringY + 0.025, z + dz, 0.016, 0.016, cabinDetailMaterial, 12);
    });
  });
  addCabinEllipse(steeringX - 0.012, steeringY, steeringZ, 0.065, 0.065, cabinMutedMaterial, 24);
  addCabinSegment([steeringX + 0.02, 1.88, steeringZ - 0.07], [5.06, 1.62, steeringZ - 0.07], cabinDetailMaterial);
  addCabinSegment([steeringX + 0.02, 1.88, steeringZ + 0.07], [5.06, 1.62, steeringZ + 0.07], cabinDetailMaterial);

  // Instrumentos com marcações e visor digital central.
  [-0.78, -0.39].forEach((z) => {
    addCabinEllipse(5.02, 2.34, z, 0.13, 0.12, cabinDetailMaterial, 32);
    for (let index = 0; index <= 10; index += 1) {
      const angle = THREE.MathUtils.lerp(-Math.PI * 0.25, Math.PI * 1.25, index / 10);
      addCabinSegment(
        [5.015, 2.34 + Math.sin(angle) * 0.14, z + Math.cos(angle) * 0.13],
        [5.015, 2.34 + Math.sin(angle) * 0.165, z + Math.cos(angle) * 0.155],
        cabinMutedMaterial,
      );
    }
  });
  for (let index = 0; index < 3; index += 1) {
    const y = 2.29 + index * 0.04;
    addCabinSegment([5.0, y, -0.63], [5.0, y, -0.55], cabinDetailMaterial);
  }

  // Contornos do tampo do painel, para dar volume à superfície.
  [0.06, 0.12].forEach((lift) => {
    addCabinPolyline([
      [5.06, 2.43 + lift, -1.17],
      [5.02, 2.4 + lift, -0.96],
      [4.99, 2.47 + lift, -0.74],
      [5.02, 2.46 + lift, -0.2],
      [5.05, 2.39 + lift, 0.18],
      [5.08, 2.38 + lift, 1.15],
    ], cabinDetailMaterial);
  });

  // Central multimídia com mapa e rota na tela; botão de alerta acima.
  for (let index = 1; index < 5; index += 1) {
    const z = THREE.MathUtils.lerp(0.03, 0.51, index / 5);
    addCabinSegment([4.96, 2.12, z], [4.96, 2.37, z], cabinDetailMaterial);
  }
  addCabinPolyline([
    [4.955, 2.14, 0.08],
    [4.955, 2.2, 0.18],
    [4.955, 2.24, 0.3],
    [4.955, 2.33, 0.38],
    [4.955, 2.35, 0.47],
  ], cabinSecondaryMaterial);
  addCabinPolyline([
    [4.97, 2.47, 0.22],
    [4.97, 2.53, 0.27],
    [4.97, 2.47, 0.32],
  ], cabinMutedMaterial, true);

  // Porta: comandos dos vidros e alça na coluna.
  for (let index = 0; index < 4; index += 1) {
    const z = -1.13 + (index % 2) * 0.07;
    const y = 1.66 - Math.floor(index / 2) * 0.06;
    addCabinRect(4.865, y, y + 0.035, z, z + 0.05, cabinDetailMaterial);
  }
  addCabinPolyline([
    [5.05, 2.2, -1.19],
    [4.98, 2.24, -1.16],
    [4.92, 2.6, -1.15],
    [4.96, 2.72, -1.18],
  ], cabinMutedMaterial);

  // Alavanca com coifa.
  [0.05, 0.08, 0.11].forEach((radius, index) => {
    addCabinEllipse(4.56 - index * 0.01, 1.24 + index * 0.025, 0.2, radius * 0.5, radius, cabinDetailMaterial, 24);
  });

  // Celular em destaque: suporte articulado, moldura, halo e sinal.
  const phoneX = 4.775;
  const phoneY = 2.18;
  const phoneZ = 0.74;
  const halfHeight = 0.18;
  const halfWidth = 0.1;
  [0, 0.035, 0.075].forEach((grow, index) => {
    addCabinRect(
      phoneX + 0.01 + index * 0.004,
      phoneY - halfHeight - grow,
      phoneY + halfHeight + grow,
      phoneZ - halfWidth - grow,
      phoneZ + halfWidth + grow,
      index === 0 ? phoneAccentMaterial : cabinMutedMaterial,
    );
  });
  // Garras do suporte nas laterais e base.
  [-1, 1].forEach((side) => {
    addCabinPolyline([
      [phoneX + 0.02, phoneY - 0.06, phoneZ + side * (halfWidth + 0.02)],
      [phoneX - 0.01, phoneY - 0.06, phoneZ + side * (halfWidth + 0.02)],
      [phoneX - 0.01, phoneY + 0.06, phoneZ + side * (halfWidth + 0.02)],
      [phoneX + 0.02, phoneY + 0.06, phoneZ + side * (halfWidth + 0.02)],
    ], phoneAccentMaterial);
  });
  addCabinPolyline([
    [phoneX - 0.01, phoneY - halfHeight - 0.02, phoneZ - 0.06],
    [phoneX - 0.01, phoneY - halfHeight - 0.02, phoneZ + 0.06],
  ], phoneAccentMaterial);
  // Braço até a saída de ar.
  addCabinPolyline([
    [phoneX + 0.03, phoneY - 0.02, phoneZ],
    [4.86, 2.12, 0.82],
    [4.95, 2.15, 0.94],
    [5.0, 2.17, 1.0],
  ], cabinSecondaryMaterial);
  addCabinEllipse(4.86, 2.12, 0.82, 0.025, 0.025, cabinSecondaryMaterial, 16);
  // Ondas de conexão saindo do celular.
  // Each wave has its own material so it can pulse outwards while active.
  const signalMaterials = [0.24, 0.32, 0.4, 0.48].map((radius) => {
    const material = new THREE.LineBasicMaterial({
      color: COLORS.lime,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    addCabinArc(phoneX - 0.02, phoneY + 0.05, phoneZ, radius, Math.PI * 0.3, Math.PI * 0.7, material);
    return material;
  });
  const phoneGlowMaterial = registerOpacity(
    cabinTargets,
    new THREE.MeshBasicMaterial({
      map: createGlowTexture(),
      color: COLORS.lime,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
    0.55,
  );
  const phoneGlow = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.1), phoneGlowMaterial);
  phoneGlow.position.set(phoneX + 0.04, phoneY, phoneZ);
  phoneGlow.rotation.y = -Math.PI / 2;
  cabinInterior.add(phoneGlow);

  // Algumas ligações em profundidade preservam a leitura 3D sem virar uma grade.
  [
    [[4.94, 1.49, -1.18], [5.25, 1.49, -1.18]],
    [[4.94, 1.48, 1.18], [5.25, 1.48, 1.18]],
    [[4.98, 2.39, -0.98], [5.24, 2.49, -0.98]],
    [[5.04, 2.37, 1.17], [5.28, 2.46, 1.17]],
    [[4.48, 1.08, 0.97], [4.84, 1.18, 1.08]],
  ].forEach(([from, to]) => {
    addCabinSegment(
      from as THREE.Vector3Tuple,
      to as THREE.Vector3Tuple,
      cabinMutedMaterial,
    );
  });
  group.add(cabinInterior);

  const logoMaterial = registerOpacity(
    solidTargets,
    new THREE.MeshBasicMaterial({
      map: markTexture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      toneMapped: false,
    }),
    0.98,
  );
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(1.38, 1.43), logoMaterial);
  logo.position.set(-1.9, 2.54, 1.26);
  group.add(logo);

  const wheelMaterial = new THREE.MeshStandardMaterial({
    color: 0x050605,
    metalness: 0.15,
    roughness: 0.86,
    opacity: 0,
  });
  const rimMaterial = new THREE.MeshStandardMaterial({
    color: COLORS.metal,
    metalness: 0.85,
    roughness: 0.22,
    opacity: 0,
  });
  [-4.2, -2.95, 2.72, 3.66, 5.5].forEach((x) => {
    [-1.34, 1.34].forEach((z) => {
      addMesh(
        new THREE.CylinderGeometry(0.66, 0.66, 0.32, 24, 1),
        wheelMaterial.clone(),
        [x, 0.63, z],
        new THREE.Euler(Math.PI / 2, 0, 0),
        0.62,
      );
      addMesh(
        new THREE.CylinderGeometry(0.29, 0.29, 0.345, 18, 1),
        rimMaterial.clone(),
        [x, 0.63, z],
        new THREE.Euler(Math.PI / 2, 0, 0),
        0.46,
      );
    });
  });

  const trailerRibsMaterial = registerOpacity(
    solidTargets,
    new THREE.LineBasicMaterial({ color: 0x8d9790, transparent: true, opacity: 0 }),
    0.42,
  );
  const ribs: number[] = [];
  for (let x = -5.7; x <= 1.7; x += 0.72) {
    ribs.push(x, 0.78, 1.257, x, 4.08, 1.257);
  }
  const ribsLine = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(ribs, 3)),
    trailerRibsMaterial,
  );
  group.add(ribsLine);

  const shadowMaterial = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(6.8, 48), shadowMaterial);
  shadow.scale.set(1.35, 0.28, 1);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.04;
  group.add(shadow);

  cabinInterior.scale.setScalar(CABIN_FIT.scale);
  cabinInterior.position.set(
    CABIN_FIT.to[0] - CABIN_FIT.from[0] * CABIN_FIT.scale,
    CABIN_FIT.to[1] - CABIN_FIT.from[1] * CABIN_FIT.scale,
    CABIN_FIT.to[2] - CABIN_FIT.from[2] * CABIN_FIT.scale,
  );

  /** Waves light up from the phone outwards, on a loop, like an active link. */
  const updateSignal = (seconds: number, visibility: number) => {
    const count = signalMaterials.length;
    signalMaterials.forEach((material, index) => {
      const phase = (seconds * 0.9 - index / count) % 1;
      const wrapped = phase < 0 ? phase + 1 : phase;
      // Quick rise, slower fade, so a pulse travels outward.
      const pulse = wrapped < 0.18 ? wrapped / 0.18 : Math.max(0, 1 - (wrapped - 0.18) / 0.55);
      material.opacity = visibility * (0.15 + 0.85 * pulse) * (1 - index * 0.12);
      material.visible = material.opacity > 0.001;
    });
    phoneGlowMaterial.opacity = visibility * (0.45 + 0.12 * Math.sin(seconds * 5.6));
    phoneGlowMaterial.visible = phoneGlowMaterial.opacity > 0.001;
  };

  return { group, solidTargets, wireTargets, cabinTargets, shadowMaterial, updateSignal };
}

function createDriveGrid(dotTexture: THREE.Texture) {
  const group = new THREE.Group();
  const targets: OpacityTarget[] = [];
  const layers: {
    geometry: THREE.BufferGeometry;
    basePositions: Float32Array;
    halfWidth: number;
    width: number;
    phase: number;
  }[] = [];

  const addLayer = ({
    columns,
    rows,
    spacing,
    phase,
    color,
    size,
    opacity,
    y,
  }: {
    columns: number;
    rows: number;
    spacing: number;
    phase: number;
    color: number;
    size: number;
    opacity: number;
    y: number;
  }) => {
    const halfWidth = ((columns - 1) * spacing) / 2;
    const halfDepth = ((rows - 1) * spacing) / 2;
    const positions: number[] = [];
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        positions.push(
          column * spacing - halfWidth,
          y + ((column + row) % 5) * 0.0015,
          row * spacing - halfDepth,
        );
      }
    }
    const basePositions = new Float32Array(positions);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const material = registerOpacity(
      targets,
      new THREE.PointsMaterial({
        map: dotTexture,
        color,
        size,
        transparent: true,
        opacity: 0,
        alphaTest: 0.02,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
      opacity,
    );
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    group.add(points);
    layers.push({
      geometry,
      basePositions,
      halfWidth,
      width: columns * spacing,
      phase,
    });
  };

  addLayer({
    columns: 49,
    rows: 25,
    spacing: 0.72,
    phase: 0,
    color: COLORS.limeDark,
    size: 0.075,
    opacity: 0.34,
    y: -0.035,
  });
  addLayer({
    columns: 13,
    rows: 7,
    spacing: 2.88,
    phase: 1.44,
    color: COLORS.white,
    size: 0.11,
    opacity: 0.18,
    y: -0.026,
  });

  const setOffset = (distance: number) => {
    layers.forEach(({ geometry, basePositions, halfWidth, width, phase }) => {
      const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let index = 0; index < positions.count; index += 1) {
        const offset = index * 3;
        const unwrapped = basePositions[offset] - distance - phase + halfWidth;
        const wrapped = ((unwrapped % width) + width) % width;
        positions.setX(index, wrapped - halfWidth);
      }
      positions.needsUpdate = true;
    });
  };

  return { group, targets, setOffset };
}

function createWindField() {
  const group = new THREE.Group();
  const targets: OpacityTarget[] = [];
  const random = seededRandom(0x524f4457);
  const layers: {
    geometry: THREE.BufferGeometry;
    baseX: Float32Array;
    baseY: Float32Array;
    baseZ: Float32Array;
    lengths: Float32Array;
    rises: Float32Array;
    phases: Float32Array;
    speed: number;
    span: number;
  }[] = [];

  const addLayer = ({
    count,
    color,
    opacity,
    speed,
    span,
    lengthMin,
    lengthMax,
    yMin,
    yMax,
    zMin,
    zMax,
  }: {
    count: number;
    color: number;
    opacity: number;
    speed: number;
    span: number;
    lengthMin: number;
    lengthMax: number;
    yMin: number;
    yMax: number;
    zMin: number;
    zMax: number;
  }) => {
    const positions = new Float32Array(count * 6);
    const baseX = new Float32Array(count);
    const baseY = new Float32Array(count);
    const baseZ = new Float32Array(count);
    const lengths = new Float32Array(count);
    const rises = new Float32Array(count);
    const phases = new Float32Array(count);

    for (let index = 0; index < count; index += 1) {
      const x = (random() - 0.5) * span;
      const y = THREE.MathUtils.lerp(yMin, yMax, random());
      const z = THREE.MathUtils.lerp(zMin, zMax, random());
      const length = THREE.MathUtils.lerp(lengthMin, lengthMax, random());
      const rise = (random() - 0.5) * 0.08;
      baseX[index] = x;
      baseY[index] = y;
      baseZ[index] = z;
      lengths[index] = length;
      rises[index] = rise;
      phases[index] = random() * Math.PI * 2;
      positions.set([x, y, z, x + length, y + rise, z], index * 6);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = registerOpacity(
      targets,
      new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
      opacity,
    );
    const lines = new THREE.LineSegments(geometry, material);
    lines.frustumCulled = false;
    group.add(lines);
    layers.push({
      geometry,
      baseX,
      baseY,
      baseZ,
      lengths,
      rises,
      phases,
      speed,
      span,
    });
  };

  addLayer({
    count: 64,
    color: COLORS.limeDark,
    opacity: 0.3,
    speed: 0.95,
    span: 38,
    lengthMin: 0.8,
    lengthMax: 2.1,
    yMin: 0.28,
    yMax: 7.4,
    zMin: -8.5,
    zMax: -2.5,
  });
  addLayer({
    count: 38,
    color: COLORS.lime,
    opacity: 0.22,
    speed: 1.3,
    span: 40,
    lengthMin: 1.2,
    lengthMax: 3,
    yMin: 0.45,
    yMax: 7.1,
    zMin: -4.5,
    zMax: 2.5,
  });
  addLayer({
    count: 14,
    color: COLORS.white,
    opacity: 0.14,
    speed: 1.65,
    span: 42,
    lengthMin: 2,
    lengthMax: 4,
    yMin: 0.65,
    yMax: 6.8,
    zMin: -1,
    zMax: 4,
  });

  const setOffset = (distance: number, elapsedSeconds: number) => {
    layers.forEach((layer) => {
      const positions = layer.geometry.getAttribute('position') as THREE.BufferAttribute;
      const halfSpan = layer.span / 2;
      for (let index = 0; index < layer.baseX.length; index += 1) {
        const unwrapped = layer.baseX[index] - distance * layer.speed + halfSpan;
        const x = ((unwrapped % layer.span) + layer.span) % layer.span - halfSpan;
        const flutter = Math.sin(elapsedSeconds * 3.4 + layer.phases[index]) * 0.018;
        positions.setXYZ(
          index * 2,
          x,
          layer.baseY[index] + flutter,
          layer.baseZ[index],
        );
        positions.setXYZ(
          index * 2 + 1,
          x + layer.lengths[index],
          layer.baseY[index] + layer.rises[index] + flutter,
          layer.baseZ[index],
        );
      }
      positions.needsUpdate = true;
    });
  };

  return { group, targets, setOffset };
}

const BRAZIL_POINTS: readonly Point2[] = [
  [-3.4, 1.73], [-3.05, 2.88], [-2.52, 3.35], [-2.26, 3.81], [-1.74, 3.58],
  [-0.95, 4.5], [-0.08, 3.92], [0.62, 4.32], [0.98, 3.58], [1.68, 3.12],
  [2.2, 2.77], [2.73, 2.31], [3.43, 2.08], [3.46, 1.5], [3.16, 0.92],
  [2.9, 0.35], [2.73, -0.58], [2.46, -1.27], [2.02, -1.96], [1.5, -2.19],
  [1.15, -2.65], [0.8, -3.35], [0.19, -4.43], [-0.25, -3.69], [-0.6, -2.88],
  [-0.51, -1.73], [-0.77, -1.04], [-0.95, -0.35], [-1.13, 0.35], [-1.82, 1.04],
  [-2.52, 1.04], [-3.4, 1.73],
] as const;

// Must match TARGET_FRAME in scripts/generate-brazil-topography.mjs and the
// geographic extent of the source STL so cities land on the outline.
const BRAZIL_EXTENT = { west: -73.99, east: -34.79, south: -33.75, north: 5.27 } as const;
const BRAZIL_FRAME = { minX: -3.4, maxX: 3.46, minY: -4.43, maxY: 4.5 } as const;

function brazilLonLatToMap([longitude, latitude]: LonLat): Point2 {
  return [
    THREE.MathUtils.mapLinear(longitude, BRAZIL_EXTENT.west, BRAZIL_EXTENT.east, BRAZIL_FRAME.minX, BRAZIL_FRAME.maxX),
    THREE.MathUtils.mapLinear(latitude, BRAZIL_EXTENT.south, BRAZIL_EXTENT.north, BRAZIL_FRAME.minY, BRAZIL_FRAME.maxY),
  ];
}

const BRAZIL_CITIES = {
  saoPaulo: [-46.63, -23.55],
  curitiba: [-49.27, -25.43],
  portoAlegre: [-51.23, -30.03],
  campoGrande: [-54.62, -20.47],
  cuiaba: [-56.1, -15.6],
  portoVelho: [-63.9, -8.76],
  manaus: [-60.02, -3.12],
  brasilia: [-47.88, -15.79],
  palmas: [-48.33, -10.18],
  belem: [-48.5, -1.46],
  beloHorizonte: [-43.94, -19.92],
  salvador: [-38.5, -12.97],
  recife: [-34.88, -8.05],
  fortaleza: [-38.54, -3.72],
} as const satisfies Record<string, LonLat>;

// Map scale while the truck is shown at real size (truck length vs. map).
const TRUCK_ZOOM = 36;
const BRAZIL_TRUCK_ROUTE_PROGRESS = 0.14;

// Hub-and-spoke from São Paulo (same hub as the globe routes), each leg
// passing through real cities along the main federal highways.
const BRAZIL_ROUTES: readonly (readonly LonLat[])[] = [
  [BRAZIL_CITIES.saoPaulo, BRAZIL_CITIES.campoGrande, BRAZIL_CITIES.cuiaba, BRAZIL_CITIES.portoVelho, BRAZIL_CITIES.manaus],
  [BRAZIL_CITIES.saoPaulo, BRAZIL_CITIES.brasilia, BRAZIL_CITIES.palmas, BRAZIL_CITIES.belem],
  [BRAZIL_CITIES.saoPaulo, BRAZIL_CITIES.beloHorizonte, BRAZIL_CITIES.salvador, BRAZIL_CITIES.recife],
  [BRAZIL_CITIES.salvador, BRAZIL_CITIES.fortaleza],
  [BRAZIL_CITIES.saoPaulo, BRAZIL_CITIES.curitiba, BRAZIL_CITIES.portoAlegre],
];
const BRAZIL_TRUCK_ROUTE = BRAZIL_ROUTES[1];

function brazilMapToLonLat(x: number, y: number): LonLat {
  return [
    THREE.MathUtils.mapLinear(x, BRAZIL_FRAME.minX, BRAZIL_FRAME.maxX, BRAZIL_EXTENT.west, BRAZIL_EXTENT.east),
    THREE.MathUtils.mapLinear(y, BRAZIL_FRAME.minY, BRAZIL_FRAME.maxY, BRAZIL_EXTENT.south, BRAZIL_EXTENT.north),
  ];
}

// The flat map sits on a plane tangent to the globe above Brazil's centre, so
// bending it onto the sphere reads as the map becoming part of the globe.
const BRAZIL_SPHERE_RADIUS = 4.92;
const BRAZIL_TANGENT_DISTANCE = 5.12;
const BRAZIL_CENTER: LonLat = [
  (BRAZIL_EXTENT.west + BRAZIL_EXTENT.east) / 2,
  (BRAZIL_EXTENT.south + BRAZIL_EXTENT.north) / 2,
];

function createBrazilTangentFrame() {
  const normal = lonLatToSphere(BRAZIL_CENTER, 1).normalize();
  const longitude = THREE.MathUtils.degToRad(BRAZIL_CENTER[0] + 55);
  const east = new THREE.Vector3(Math.cos(longitude), 0, -Math.sin(longitude)).normalize();
  const north = new THREE.Vector3().crossVectors(normal, east).normalize();
  return { normal, east, north };
}

type MorphTarget = {
  geometry: THREE.BufferGeometry;
  flat: Float32Array;
  sphere: Float32Array;
};

function createBrazil(
  dotTexture: THREE.Texture,
  topography?: BrazilTopographyAsset | null,
) {
  const anchor = new THREE.Group();
  const group = new THREE.Group();
  anchor.add(group);
  const frame = createBrazilTangentFrame();
  anchor.position.copy(frame.normal).multiplyScalar(BRAZIL_TANGENT_DISTANCE);
  anchor.quaternion.setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(frame.east, frame.north, frame.normal),
  );

  const targets: OpacityTarget[] = [];
  const contourTargets: OpacityTarget[] = [];
  const highlightTargets: OpacityTarget[] = [];
  const routeTargets: DrawTarget[] = [];
  const morphTargets: MorphTarget[] = [];
  const nodeMorphs: { mesh: THREE.Mesh; flat: THREE.Vector3; sphere: THREE.Vector3 }[] = [];
  const pointPositions: number[] = [];

  const toSphereLocal = (x: number, y: number, lift: number) => {
    const world = lonLatToSphere(brazilMapToLonLat(x, y), BRAZIL_SPHERE_RADIUS + lift);
    world.sub(anchor.position);
    return new THREE.Vector3(
      world.dot(frame.east),
      world.dot(frame.north),
      world.dot(frame.normal),
    );
  };
  const addMorph = (geometry: THREE.BufferGeometry, lift: (z: number) => number) => {
    const flat = Float32Array.from(geometry.getAttribute('position').array as ArrayLike<number>);
    const sphere = new Float32Array(flat.length);
    for (let offset = 0; offset < flat.length; offset += 3) {
      toSphereLocal(flat[offset], flat[offset + 1], lift(flat[offset + 2])).toArray(sphere, offset);
    }
    morphTargets.push({ geometry, flat, sphere });
  };

  const pointStep = topography ? 0.22 : 0.245;
  const topographyPoints = topography?.points;
  const reliefAt = (x: number, y: number) => {
    if (!topographyPoints) return 0.07;
    let nearestDistance = Number.POSITIVE_INFINITY;
    let nearestZ = 0.04;
    for (let offset = 0; offset < topographyPoints.length; offset += 3) {
      const deltaX = topographyPoints[offset] - x;
      const deltaY = topographyPoints[offset + 1] - y;
      const distance = deltaX * deltaX + deltaY * deltaY;
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestZ = topographyPoints[offset + 2];
      }
    }
    return nearestZ + 0.022;
  };
  let row = 0;
  for (let y = -4.43; y <= 4.5; y += pointStep, row += 1) {
    const rowOffset = row % 2 ? pointStep / 2 : 0;
    for (let x = -3.4 + rowOffset; x <= 3.46; x += pointStep) {
      if (!pointInPolygon([x, y], BRAZIL_POINTS)) continue;
      pointPositions.push(x, y, reliefAt(x, y));
    }
  }
  let maxZ = Number.NEGATIVE_INFINITY;
  for (let offset = 2; offset < pointPositions.length; offset += 3) {
    maxZ = Math.max(maxZ, pointPositions[offset]);
  }

  const pointsGeometry = new THREE.BufferGeometry();
  pointsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(pointPositions, 3));
  addMorph(pointsGeometry, (z) => 0.03 + z * 0.3);
  const pointsMaterial = registerOpacity(
    targets,
    new THREE.PointsMaterial({
      map: dotTexture,
      color: COLORS.lime,
      size: topography ? 0.12 : 0.145,
      transparent: true,
      opacity: 0,
      alphaTest: 0.08,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
    0.94,
  );
  const mapPoints = new THREE.Points(pointsGeometry, pointsMaterial);
  mapPoints.renderOrder = 5;
  group.add(mapPoints);

  const outlineMaterial = registerOpacity(
    highlightTargets,
    new THREE.LineBasicMaterial({
      color: COLORS.lime,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
    topography ? 0.85 : 1,
  );
  const outlineGeometry = new THREE.BufferGeometry();
  if (topography) {
    outlineGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(topography.outline, 3),
    );
  } else {
    const loop = BRAZIL_POINTS.slice(0, -1);
    const segments = loop.flatMap(([x, y], index) => {
      const [nextX, nextY] = loop[(index + 1) % loop.length];
      return [x, y, 0.05, nextX, nextY, 0.05];
    });
    outlineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(segments, 3));
  }
  addMorph(outlineGeometry, () => 0.05);
  const outline = new THREE.LineSegments(outlineGeometry, outlineMaterial);
  outline.renderOrder = 5;
  group.add(outline);

  if (topography) {
    const contourMaterial = registerOpacity(
      contourTargets,
      new THREE.LineBasicMaterial({
        color: COLORS.limeDark,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
      0.22,
    );
    const contourGeometry = new THREE.BufferGeometry();
    contourGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(topography.contours, 3),
    );
    addMorph(contourGeometry, () => 0.02);
    group.add(new THREE.LineSegments(contourGeometry, contourMaterial));
  }

  const routeMaterial = registerOpacity(
    highlightTargets,
    new THREE.LineBasicMaterial({
      color: COLORS.white,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      toneMapped: false,
    }),
    0.78,
  );
  const routeZ = Math.max(0.08, maxZ + 0.035);
  const cityPoint = (city: LonLat) => {
    const [x, y] = brazilLonLatToMap(city);
    return new THREE.Vector3(x, y, routeZ);
  };
  // The truck of the previous scene drives on this road; zooming out from it
  // reveals the map around it.
  const truckRoute = new THREE.CatmullRomCurve3(
    BRAZIL_TRUCK_ROUTE.map(cityPoint),
    false,
    'centripetal',
  );
  const truckPoint = truckRoute.getPointAt(BRAZIL_TRUCK_ROUTE_PROGRESS);
  const truckTangent = truckRoute.getTangentAt(BRAZIL_TRUCK_ROUTE_PROGRESS);
  BRAZIL_ROUTES.forEach((route) => {
    const curve = new THREE.CatmullRomCurve3(route.map(cityPoint), false, 'centripetal');
    const points = curve.getPoints(24 * (route.length - 1));
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    geometry.setDrawRange(0, 0);
    addMorph(geometry, () => 0.08);
    routeTargets.push({ geometry, count: points.length });
    const line = new THREE.Line(geometry, routeMaterial);
    line.renderOrder = 6;
    group.add(line);
  });

  const nodeMaterial = registerOpacity(
    highlightTargets,
    new THREE.MeshBasicMaterial({
      color: COLORS.lime,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  const nodes = new Map<string, { city: LonLat; radius: number }>();
  BRAZIL_ROUTES.forEach((route) => {
    route.forEach((city, index) => {
      const key = city.join(',');
      const isEndpoint = index === route.length - 1;
      const radius = city === BRAZIL_CITIES.saoPaulo ? 0.13 : isEndpoint ? 0.09 : 0.06;
      nodes.set(key, { city, radius: Math.max(radius, nodes.get(key)?.radius ?? 0) });
    });
  });
  nodes.forEach(({ city, radius }) => {
    const node = new THREE.Mesh(new THREE.CircleGeometry(radius, 20), nodeMaterial);
    const flat = cityPoint(city).setZ(routeZ + 0.02);
    node.position.copy(flat);
    node.renderOrder = 7;
    nodeMorphs.push({ mesh: node, flat, sphere: toSphereLocal(flat.x, flat.y, 0.1) });
    group.add(node);
  });

  // Zoomed in, city markers would grow with the map; keep them marker-sized.
  const setNodeScale = (scale: number) => {
    nodeMorphs.forEach(({ mesh }) => mesh.scale.setScalar(scale));
  };

  let lastMorph = -1;
  const setMorph = (morph: number) => {
    if (Math.abs(morph - lastMorph) < 0.0005) return;
    lastMorph = morph;
    morphTargets.forEach(({ geometry, flat, sphere }) => {
      const attribute = geometry.getAttribute('position') as THREE.BufferAttribute;
      const array = attribute.array as Float32Array;
      for (let offset = 0; offset < array.length; offset += 1) {
        array[offset] = flat[offset] + (sphere[offset] - flat[offset]) * morph;
      }
      attribute.needsUpdate = true;
      geometry.computeBoundingSphere();
    });
    nodeMorphs.forEach(({ mesh, flat, sphere }) => {
      mesh.position.lerpVectors(flat, sphere, morph);
    });
  };

  return {
    anchor,
    group,
    frame,
    targets,
    contourTargets,
    highlightTargets,
    routeTargets,
    setMorph,
    setNodeScale,
    truckPoint,
    // Yaw that turns the road direction (east = +X, north = -Z on the flat
    // map) into the truck's forward axis (+X).
    truckYaw: Math.atan2(-truckTangent.y, truckTangent.x),
  };
}

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function createParticles() {
  const random = seededRandom(0x524f4441);
  const positions: number[] = [];
  for (let index = 0; index < 720; index += 1) {
    positions.push(
      (random() - 0.5) * 28,
      random() * 10 - 1,
      (random() - 0.5) * 18,
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: COLORS.lime,
    size: 0.045,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  return { points: new THREE.Points(geometry, material), material };
}

const LAND_POLYGONS: readonly (readonly LonLat[])[] = [
  [
    [-168, 72], [-145, 70], [-128, 58], [-124, 48], [-123, 38], [-116, 29],
    [-104, 22], [-92, 18], [-84, 9], [-77, 8], [-78, 20], [-86, 26],
    [-82, 31], [-72, 42], [-58, 49], [-54, 60], [-72, 72], [-110, 78], [-145, 76],
  ],
  [
    [-82, 12], [-72, 12], [-60, 8], [-48, 4], [-35, -7], [-39, -19],
    [-49, -29], [-54, -40], [-68, -55], [-76, -44], [-78, -28], [-81, -10],
  ],
  [
    [-18, 36], [0, 37], [16, 34], [34, 31], [51, 12], [48, -11],
    [36, -25], [29, -35], [17, -35], [8, -28], [-2, -5], [-14, 9],
  ],
  [
    [-11, 36], [-5, 44], [-10, 54], [-2, 61], [7, 70], [26, 70],
    [40, 59], [31, 49], [43, 42], [29, 36], [15, 35],
  ],
  [
    [30, 36], [42, 58], [67, 72], [104, 77], [143, 70], [172, 61],
    [163, 48], [146, 40], [128, 24], [109, 8], [93, 7], [79, 19],
    [62, 24], [50, 39],
  ],
  [
    [112, -10], [132, -11], [153, -27], [146, -43], [118, -36], [110, -21],
  ],
  [
    [-55, 60], [-44, 60], [-20, 70], [-30, 83], [-52, 82], [-68, 73],
  ],
] as const;

function createGlobe(
  dotTexture: THREE.Texture,
  worldAsset?: WorldWireframeAsset | null,
) {
  const group = new THREE.Group();
  const targets: OpacityTarget[] = [];
  const radius = 4.8;
  type GlobeRouteTarget = DrawTarget & {
    start: number;
    end: number;
    directions: THREE.Vector3[];
  };
  const routeTargets: GlobeRouteTarget[] = [];
  const sourceShell = worldAsset?.shell;
  const occluderGeometry = sourceShell
    ? sourceShell.clone().scale(1.0125, 1.0125, 1.0125)
    : new THREE.SphereGeometry(radius - 0.01, 48, 30);
  const shellGeometry = sourceShell
    ? sourceShell.clone().scale(1.015, 1.015, 1.015)
    : new THREE.SphereGeometry(radius, 48, 30);
  sourceShell?.dispose();

  const occluder = new THREE.Mesh(
    occluderGeometry,
    new THREE.MeshBasicMaterial({
      color: COLORS.nearBlack,
      depthWrite: true,
    }),
  );
  occluder.visible = false;
  group.add(occluder);

  const shellMaterial = registerOpacity(
    targets,
    new THREE.MeshBasicMaterial({
      color: COLORS.limeDark,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
    0.045,
  );
  group.add(new THREE.Mesh(shellGeometry, shellMaterial));

  if (worldAsset) {
    const wireMaterial = registerOpacity(
      targets,
      new THREE.LineBasicMaterial({
        color: COLORS.lime,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
      0.115,
    );
    const wireGeometry = new THREE.BufferGeometry();
    wireGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        projectPositionsToRadius(worldAsset.wireframe, radius + 0.035),
        3,
      ),
    );
    group.add(new THREE.LineSegments(wireGeometry, wireMaterial));
  } else {
    const wireMaterial = registerOpacity(
      targets,
      new THREE.MeshBasicMaterial({
        color: COLORS.lime,
        transparent: true,
        opacity: 0,
        wireframe: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
      0.105,
    );
    group.add(new THREE.Mesh(new THREE.SphereGeometry(radius + 0.035, 32, 20), wireMaterial));
  }

  const random = seededRandom(0x524f4442);
  const dotPositions: number[] = worldAsset
    ? Array.from(projectPositionsToRadius(worldAsset.points, radius + 0.095))
    : [];
  if (!worldAsset) {
    for (let latitude = -56; latitude <= 82; latitude += 2.55) {
      const longitudeStep = 2.55 / Math.max(
        Math.cos(THREE.MathUtils.degToRad(latitude)),
        0.42,
      );
      for (let longitude = -178; longitude < 178; longitude += longitudeStep) {
        if (!LAND_POLYGONS.some((polygon) => pointInPolygon([longitude, latitude], polygon))) continue;
        const point = lonLatToSphere(
          [
            longitude + (random() - 0.5) * 0.52,
            latitude + (random() - 0.5) * 0.52,
          ],
          radius + 0.095,
        );
        dotPositions.push(...point.toArray());
      }
    }
  }
  const dotsGeometry = new THREE.BufferGeometry();
  dotsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(dotPositions, 3));
  const baseDotColor = new THREE.Color(0xc7d0c9);
  const activeDotColor = new THREE.Color(COLORS.lime).multiplyScalar(1.45);
  const baseCoastColor = new THREE.Color(0xd9e1db);
  const activeCoastColor = new THREE.Color(COLORS.lime);
  const dotColors = new Float32Array(dotPositions.length);
  for (let offset = 0; offset < dotColors.length; offset += 3) {
    baseDotColor.toArray(dotColors, offset);
  }
  dotsGeometry.setAttribute('color', new THREE.BufferAttribute(dotColors, 3));
  const dotsMaterial = registerOpacity(
    targets,
    new THREE.PointsMaterial({
      map: dotTexture,
      color: 0xffffff,
      size: worldAsset ? 0.11 : 0.12,
      vertexColors: true,
      transparent: true,
      opacity: 0,
      alphaTest: 0.12,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
    0.9,
  );
  const globePoints = new THREE.Points(dotsGeometry, dotsMaterial);
  globePoints.renderOrder = 3;
  group.add(globePoints);

  const coastMaterial = registerOpacity(
    targets,
    new THREE.LineBasicMaterial({
      color: baseCoastColor,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
    worldAsset ? 0.4 : 0.48,
  );
  if (worldAsset) {
    const coastGeometry = new THREE.BufferGeometry();
    coastGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        projectPositionsToRadius(worldAsset.coastline, radius + 0.08),
        3,
      ),
    );
    group.add(new THREE.LineSegments(coastGeometry, coastMaterial));
  } else {
    LAND_POLYGONS.forEach((polygon) => {
      const coast = polygon.map((point) => lonLatToSphere(point, radius + 0.08));
      group.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(coast), coastMaterial));
    });
  }

  const routeMaterial = registerOpacity(
    targets,
    new THREE.LineBasicMaterial({
      color: COLORS.lime,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
    0.92,
  );
  const start = lonLatToSphere(BRAZIL_CITIES.saoPaulo, radius + 0.1);
  const routeDestinations: readonly {
    point: LonLat;
    start: number;
    end: number;
  }[] = [
    { point: [-70.67, -33.45], start: 0, end: 0.36 },
    { point: [-99.1, 19.4], start: 0.025, end: 0.45 },
    { point: [-74, 40.71], start: 0.06, end: 0.5 },
    { point: [-0.13, 51.51], start: 0.1, end: 0.57 },
    { point: [3.38, 6.52], start: 0.16, end: 0.62 },
    { point: [18.42, -33.92], start: 0.22, end: 0.68 },
    { point: [55.27, 25.2], start: 0.28, end: 0.72 },
    { point: [72.88, 19.08], start: 0.34, end: 0.76 },
    { point: [103.82, 1.35], start: 0.4, end: 0.8 },
    { point: [139.69, 35.69], start: 0.46, end: 0.84 },
    { point: [151.21, -33.87], start: 0.52, end: 0.9 },
  ];
  routeDestinations.forEach((route) => {
    const endPoint = lonLatToSphere(route.point, radius + 0.1);
    const control = start.clone().add(endPoint).normalize().multiplyScalar(radius + 2.5);
    const points = new THREE.QuadraticBezierCurve3(start, control, endPoint).getPoints(72);
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    geometry.setDrawRange(0, 0);
    routeTargets.push({
      geometry,
      count: points.length,
      start: route.start,
      end: route.end,
      directions: points.map((point) => point.clone().normalize()),
    });
    const line = new THREE.Line(geometry, routeMaterial);
    line.renderOrder = 4;
    group.add(line);
  });

  const activationThresholds = new Float32Array(dotPositions.length / 3);
  const dotDirection = new THREE.Vector3();
  activationThresholds.forEach((_, index) => {
    const offset = index * 3;
    dotDirection
      .set(dotPositions[offset], dotPositions[offset + 1], dotPositions[offset + 2])
      .normalize();
    let earliest = 0.94;
    routeTargets.forEach((route) => {
      for (let sampleIndex = 0; sampleIndex < route.directions.length; sampleIndex += 3) {
        const routeProgress = sampleIndex / (route.directions.length - 1);
        const arrival = THREE.MathUtils.lerp(route.start, route.end, routeProgress);
        const cosine = THREE.MathUtils.clamp(
          dotDirection.dot(route.directions[sampleIndex]),
          -1,
          1,
        );
        const distance = Math.acos(cosine);
        earliest = Math.min(earliest, arrival + Math.min(0.24, distance * 0.17));
      }
    });
    activationThresholds[index] = THREE.MathUtils.clamp(earliest, 0.045, 0.94);
  });

  const colorAttribute = dotsGeometry.getAttribute('color') as THREE.BufferAttribute;
  let lastRouteProgress = -1;
  const setRouteProgress = (progress: number) => {
    const routeProgress = THREE.MathUtils.clamp(progress, 0, 1);
    routeTargets.forEach((route) => {
      const localProgress = smoothstep(segment(routeProgress, route.start, route.end));
      route.geometry.setDrawRange(
        0,
        Math.max(0, Math.round(route.count * localProgress)),
      );
    });
    coastMaterial.color
      .copy(baseCoastColor)
      .lerp(
        activeCoastColor,
        smoothstep(segment(routeProgress, 0.18, 0.98)),
      );
    if (Math.abs(routeProgress - lastRouteProgress) < 0.002) return;
    lastRouteProgress = routeProgress;
    for (let index = 0; index < activationThresholds.length; index += 1) {
      const activation = smoothstep(segment(
        routeProgress,
        activationThresholds[index] - 0.035,
        activationThresholds[index] + 0.055,
      ));
      colorAttribute.setXYZ(
        index,
        THREE.MathUtils.lerp(baseDotColor.r, activeDotColor.r, activation),
        THREE.MathUtils.lerp(baseDotColor.g, activeDotColor.g, activation),
        THREE.MathUtils.lerp(baseDotColor.b, activeDotColor.b, activation),
      );
    }
    colorAttribute.needsUpdate = true;
  };

  return { group, targets, occluder, setRouteProgress };
}

export async function createHomeScene(canvas: HTMLCanvasElement): Promise<HomeSceneController> {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor(COLORS.night, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(COLORS.night, 0.012);
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 120);
  camera.up.set(0, 1, 0);

  scene.add(new THREE.HemisphereLight(0xe9f5e6, 0x071008, 1.7));
  const keyLight = new THREE.DirectionalLight(COLORS.white, 3.1);
  keyLight.position.set(8, 12, 9);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.left = -12;
  keyLight.shadow.camera.right = 12;
  keyLight.shadow.camera.top = 10;
  keyLight.shadow.camera.bottom = -6;
  scene.add(keyLight);
  const brandLight = new THREE.PointLight(COLORS.lime, 18, 18, 2);
  brandLight.position.set(4.5, 4.5, 5);
  scene.add(brandLight);

  const markTexture = createMarkTexture();
  const dotTexture = createDotTexture();
  const phone = createPhone(markTexture);
  const truck = createTruck(markTexture);
  const [downloadedTruck, brazilTopography, worldWireframe] = await Promise.all([
    createDownloadedTruckWireframe().catch(() => null),
    loadBrazilTopographyAsset().catch(() => null),
    loadWorldWireframeAsset().catch(() => null),
  ]);
  if (downloadedTruck) truck.group.add(downloadedTruck.group);
  truck.group.add(phone.group);
  const driveGrid = createDriveGrid(dotTexture);
  const windField = createWindField();
  const brazil = createBrazil(dotTexture, brazilTopography);
  const particles = createParticles();
  const globe = createGlobe(dotTexture, worldWireframe);

  // Earth = globe + Brazil map on a plane tangent to it. The whole earth is
  // oriented so Brazil faces the camera while the map bends onto the sphere.
  const earth = new THREE.Group();
  globe.group.rotation.y = WORLD_ROTATION_OFFSET;
  globe.group.add(brazil.anchor);
  earth.add(globe.group);
  scene.add(
    windField.group,
    driveGrid.group,
    truck.group,
    particles.points,
    earth,
  );
  const worldUp = new THREE.Vector3(0, 1, 0);
  const brazilNormal = brazil.frame.normal.clone().applyAxisAngle(worldUp, WORLD_ROTATION_OFFSET);
  const brazilBasisInverse = new THREE.Matrix4()
    .makeBasis(
      brazil.frame.east.clone().applyAxisAngle(worldUp, WORLD_ROTATION_OFFSET),
      brazil.frame.north.clone().applyAxisAngle(worldUp, WORLD_ROTATION_OFFSET),
      brazilNormal,
    )
    .transpose();
  const orientationFor = (east: THREE.Vector3, north: THREE.Vector3, normal: THREE.Vector3) =>
    new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(east, north, normal).multiply(brazilBasisInverse),
    );
  // Flat stage: map lies on the ground (normal up, north away from the camera).
  const mapOrientation = orientationFor(
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 0, -1),
    new THREE.Vector3(0, 1, 0),
  );
  const faceView = new THREE.Vector3();
  const faceNorth = new THREE.Vector3();
  const faceEast = new THREE.Vector3();
  const faceScreenUp = new THREE.Vector3();
  const anchorOffset = new THREE.Vector3();
  const earthBaseQuaternion = new THREE.Quaternion();
  const earthSway = new THREE.Quaternion();
  const earthYaw = new THREE.Quaternion();
  const pinLocal = new THREE.Vector3();
  const pinWorld = new THREE.Vector3();
  let globeSwayTime = 0;
  let earthScale = 1;
  let earthCenter = 1;
  const updateEarth = (morph: number) => {
    // Gentle idle sway instead of a full spin, so Brazil stays highlighted.
    earthSway.setFromAxisAngle(worldUp, Math.sin(globeSwayTime * 0.45) * 0.06 * morph);
    earth.quaternion.copy(earthSway).multiply(earthBaseQuaternion);
    earth.scale.setScalar(earthScale);
    earth.position.set(0, 0, 0);
    earth.updateMatrixWorld(true);
    // Pin the truck's road (zoom stage) and then Brazil's centre (map stage)
    // to the origin, where the camera looks.
    pinLocal.copy(brazil.truckPoint).multiplyScalar(1 - earthCenter);
    pinWorld.copy(pinLocal);
    brazil.group.localToWorld(pinWorld);
    earth.position
      .set(mapHorizontalOffset * earthCenter, 0, 0)
      .addScaledVector(pinWorld, -(1 - morph));
  };

  let currentProgress = -1;
  let targetProgress = -1;
  let currentSample = sampleHomeTimeline(0);
  let disposed = false;
  let cameraDistanceScale = 1;
  let mapHorizontalOffset = 0;
  let frameId = 0;
  let lastFrameTime = performance.now();
  let wheelAngle = 0;
  let driveDistance = 0;
  let windDistance = 0;
  let baseBrandLightIntensity = 18;
  const cameraPosition = new THREE.Vector3();
  const cameraTarget = new THREE.Vector3();

  const applyProgress = (progress: number) => {
    if (disposed) return;
    const sample = sampleHomeTimeline(progress);
    currentSample = sample;
    currentProgress = sample.progress;

    cameraTarget.set(...sample.cameraTarget);
    cameraPosition.set(...sample.cameraPosition);
    camera.position.copy(cameraTarget).add(
      cameraPosition.sub(cameraTarget).multiplyScalar(cameraDistanceScale),
    );
    camera.lookAt(cameraTarget);

    phone.group.position.set(...sample.phonePosition);
    phone.group.scale.setScalar(sample.phoneScale);
    const phoneTurn = smoothstep(segment(sample.progress, 0.07, 0.25))
      * (1 - sample.phoneMount);
    phone.group.rotation.set(
      THREE.MathUtils.lerp(0.025 * phoneTurn, 0, sample.phoneMount),
      THREE.MathUtils.lerp(-0.08 - phoneTurn * 0.2, -Math.PI / 2, sample.phoneMount),
      THREE.MathUtils.lerp(-0.018 * phoneTurn, -0.025, sample.phoneMount),
    );
    applyOpacity(phone.chipTargets, sample.chipOpacity);
    phone.chipCore.position.y = THREE.MathUtils.lerp(0.55, 0, sample.chipStretch);
    phone.chipCore.scale.set(
      THREE.MathUtils.lerp(1, 0.84, sample.chipStretch),
      THREE.MathUtils.lerp(1, 1.55, sample.chipStretch),
      THREE.MathUtils.lerp(1, 0.72, sample.chipStretch),
    );
    phone.applyChipBuild(sample.chipBuild, sample.chipTraceProgress, sample.chipOpacity);
    applyOpacity(phone.solidTargets, sample.phoneSolidOpacity);
    applyOpacity(phone.wireTargets, sample.phoneWireOpacity);
    const phoneMarkOpacity = 1 - smoothstep(segment(sample.progress, 0.34, 0.42));
    phone.markMaterial.opacity = phoneMarkOpacity;
    phone.markMaterial.visible = phoneMarkOpacity > 0.001;
    phone.glowMaterial.opacity = phoneMarkOpacity * (0.025 + 0.012 * Math.sin(sample.progress * Math.PI * 8));
    phone.glowMaterial.visible = phoneMarkOpacity > 0.001;
    phone.mark.scale.setScalar(sample.phoneMarkScale);

    const downloadedTruckOpacity = sample.truckOpacity * sample.truckWireOpacity;
    applyOpacity(
      truck.solidTargets,
      downloadedTruck ? 0 : sample.truckOpacity * sample.truckSolidOpacity,
    );
    applyOpacity(
      truck.wireTargets,
      downloadedTruck ? 0 : downloadedTruckOpacity,
    );
    if (downloadedTruck) applyOpacity(downloadedTruck.targets, downloadedTruckOpacity);
    applyOpacity(truck.cabinTargets, sample.cabinOpacity);
    truck.shadowMaterial.opacity = downloadedTruck
      ? 0
      : sample.truckOpacity * sample.truckSolidOpacity * 0.42;
    truck.shadowMaterial.visible = truck.shadowMaterial.opacity > 0.001;
    const zoomScale = Math.pow(TRUCK_ZOOM, -sample.worldZoom);
    truck.group.rotation.y = -smoothstep(segment(sample.progress, 0.42, 0.55)) * 0.05
      * (1 - sample.worldZoom);
    truck.group.position.y = 0;
    truck.group.scale.setScalar(zoomScale);
    driveGrid.group.scale.setScalar(zoomScale);
    windField.group.scale.setScalar(zoomScale);

    applyOpacity(driveGrid.targets, sample.driveGridOpacity);
    applyOpacity(windField.targets, sample.driveIntensity * sample.truckOpacity);

    particles.material.opacity = sample.particlesOpacity
      * THREE.MathUtils.lerp(0, 0.46, 1 - sample.driveIntensity);
    particles.material.visible = particles.material.opacity > 0.001;
    particles.points.rotation.y = sample.progress * 0.5;

    const morph = sample.brazilMorph;
    // Truck and map share one zoom: the truck shrinks onto its road while the
    // map shrinks from TRUCK_ZOOM to its normal size around it.
    const truckScale = Math.pow(TRUCK_ZOOM, -sample.worldZoom);
    earthScale = TRUCK_ZOOM * truckScale;
    earthCenter = sample.brazilCenter;
    // Keep the map's relief at its normal thickness while zoomed in.
    brazil.group.scale.set(1, 1, 1 / earthScale);
    brazil.setNodeScale(Math.pow(earthScale, -0.75));
    applyOpacity(brazil.targets, sample.brazilOpacity);
    applyOpacity(brazil.highlightTargets, sample.brazilOpacity);
    applyOpacity(brazil.contourTargets, sample.brazilOpacity * (1 - morph));
    brazil.setMorph(morph);
    brazil.routeTargets.forEach(({ geometry, count }) => {
      geometry.setDrawRange(0, Math.max(0, Math.round(count * sample.brazilRoutes)));
    });

    // Globe stage: Brazil faces the camera, tilted a little below centre so
    // the routes leaving it towards the north stay in frame.
    faceView.copy(camera.position).sub(anchorOffset.set(mapHorizontalOffset, 0, 0)).normalize();
    faceScreenUp.copy(worldUp).addScaledVector(faceView, -worldUp.dot(faceView)).normalize();
    faceView.addScaledVector(faceScreenUp, -0.2 * morph).normalize();
    faceNorth.copy(worldUp).addScaledVector(faceView, -worldUp.dot(faceView)).normalize();
    faceEast.crossVectors(faceNorth, faceView).normalize();
    earthYaw.setFromAxisAngle(worldUp, brazil.truckYaw * (1 - earthCenter));
    earthBaseQuaternion
      .copy(earthYaw)
      .multiply(mapOrientation)
      .slerp(orientationFor(faceEast, faceNorth, faceView), morph);
    updateEarth(morph);

    // The truck rides its road on the map: same point, same heading.
    pinWorld.copy(brazil.truckPoint);
    brazil.group.localToWorld(pinWorld);
    truck.group.position.set(pinWorld.x, 0, pinWorld.z);
    truck.group.rotation.y += -brazil.truckYaw * earthCenter;

    globe.occluder.visible = sample.globeOpacity > 0.035;
    applyOpacity(globe.targets, sample.globeOpacity);
    globe.setRouteProgress(sample.globeRoutes);

    baseBrandLightIntensity = 11 + 12 * (1 - sample.truckSolidOpacity);
  };

  const scheduleFrame = () => {
    if (!disposed && frameId === 0) frameId = window.requestAnimationFrame(drawFrame);
  };

  function drawFrame(timestamp: number) {
    frameId = 0;
    if (disposed) return;
    const deltaSeconds = Math.min(0.05, Math.max(0, (timestamp - lastFrameTime) / 1000));
    lastFrameTime = timestamp;
    // Ease the rendered progress towards the scroll position so coarse wheel
    // steps still read as continuous motion.
    let settling = false;
    if (targetProgress >= 0 && Math.abs(targetProgress - currentProgress) > 0.00015) {
      const step = (targetProgress - currentProgress) * (1 - Math.exp(-deltaSeconds * 9));
      applyProgress(Math.abs(step) < 0.00005 ? targetProgress : currentProgress + step);
      settling = true;
    }
    const drive = currentSample.driveIntensity;
    const cabinVisible = currentSample.cabinOpacity > 0.001;
    truck.updateSignal(timestamp / 1000, currentSample.cabinOpacity);

    if (downloadedTruck) {
      wheelAngle -= deltaSeconds * 3.35 * drive;
      downloadedTruck.wheels.forEach((wheel) => {
        wheel.rotation.z = wheelAngle;
      });
      downloadedTruck.group.position.y = downloadedTruck.baseY
        + Math.sin(timestamp * 0.018) * 0.007 * drive;
      downloadedTruck.group.rotation.x = Math.sin(timestamp * 0.011) * 0.0012 * drive;
    }

    driveDistance += deltaSeconds * 2.25 * drive;
    driveGrid.setOffset(driveDistance);
    windDistance += deltaSeconds * 10.5 * drive;
    windField.setOffset(windDistance, timestamp * 0.001);
    const globeVisible = currentSample.globeOpacity > 0.035;
    if (globeVisible) {
      globeSwayTime += deltaSeconds;
      updateEarth(currentSample.brazilMorph);
    }
    brandLight.intensity = baseBrandLightIntensity
      + Math.sin(timestamp * 0.02) * 0.32 * drive;
    renderer.render(scene, camera);

    if (drive > 0.001 || globeVisible || settling || cabinVisible) scheduleFrame();
  }

  return {
    resize(width, height, pixelRatio) {
      if (disposed || width <= 0 || height <= 0) return;
      renderer.setPixelRatio(Math.min(1.6, Math.max(1, pixelRatio)));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      cameraDistanceScale = camera.aspect < 0.85
        ? 1.45 - smoothstep(segment(camera.aspect, 0.5, 0.85)) * 0.45
        : 1;
      mapHorizontalOffset = smoothstep(segment(camera.aspect, 1.05, 1.45)) * 1.5;
      camera.updateProjectionMatrix();
      applyProgress(currentProgress < 0 ? 0 : currentProgress);
      scheduleFrame();
    },
    setProgress(progress) {
      const next = Math.max(0, Math.min(1, progress));
      if (Math.abs(targetProgress - next) < 0.0001) return;
      targetProgress = next;
      if (currentProgress < 0) applyProgress(next);
      if (frameId === 0) lastFrameTime = performance.now();
      scheduleFrame();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (frameId !== 0) window.cancelAnimationFrame(frameId);
      frameId = 0;
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      scene.traverse((object) => {
        const renderable = object as THREE.Object3D & {
          geometry?: THREE.BufferGeometry;
          material?: THREE.Material | THREE.Material[];
        };
        if (renderable.geometry) geometries.add(renderable.geometry);
        if (Array.isArray(renderable.material)) renderable.material.forEach((material) => materials.add(material));
        else if (renderable.material) materials.add(renderable.material);
      });
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      markTexture.dispose();
      dotTexture.dispose();
      renderer.dispose();
    },
  };
}
