import * as THREE from 'three';
import { RODAR_MARK_PATH } from '../../../components/RodarLogo';
import { sampleHomeTimeline, segment, smoothstep } from './timeline';

const COLORS = {
  night: 0x050806,
  nearBlack: 0x090d09,
  ink: 0x172019,
  inkLight: 0x344039,
  lime: 0xa2f200,
  limeDark: 0x426e0c,
  white: 0xf6f8f6,
  metal: 0x9ca59f,
  amber: 0xc27c3e,
};

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

export type HomeSceneController = {
  resize: (width: number, height: number, pixelRatio: number) => void;
  setProgress: (progress: number) => void;
  dispose: () => void;
};

function registerOpacity(
  list: OpacityTarget[],
  material: THREE.Material & { opacity: number; transparent: boolean },
  baseOpacity?: number,
) {
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

function createSunsetTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D indisponível para o cenário');
  const sky = context.createLinearGradient(0, 0, 0, canvas.height);
  sky.addColorStop(0, '#101811');
  sky.addColorStop(0.42, '#37502b');
  sky.addColorStop(0.7, '#735330');
  sky.addColorStop(1, '#080b08');
  context.fillStyle = sky;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const sun = context.createRadialGradient(820, 335, 0, 820, 335, 230);
  sun.addColorStop(0, 'rgba(252, 236, 184, .86)');
  sun.addColorStop(0.15, 'rgba(194, 124, 62, .42)');
  sun.addColorStop(1, 'rgba(5, 8, 6, 0)');
  context.fillStyle = sun;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  return texture;
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
  chipCore.add(chipPlate);
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
  chipCore.add(new THREE.LineSegments(new THREE.EdgesGeometry(chipPlate.geometry), chipEdgeMaterial));
  const innerChip = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-1.48, -1.48, 0.115),
      new THREE.Vector3(1.48, -1.48, 0.115),
      new THREE.Vector3(1.48, 1.48, 0.115),
      new THREE.Vector3(-1.48, 1.48, 0.115),
    ]),
    chipEdgeMaterial,
  );
  chipCore.add(innerChip);

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
  const pinTransform = new THREE.Object3D();
  let pinIndex = 0;
  for (let index = 0; index < pinsPerSide; index += 1) {
    const offset = -1.5 + index * 0.3;
    [-1, 1].forEach((side) => {
      pinTransform.position.set(side * 2.04, offset, 0.01);
      pinTransform.rotation.set(0, 0, 0);
      pinTransform.updateMatrix();
      pins.setMatrixAt(pinIndex, pinTransform.matrix);
      pinIndex += 1;
      pinTransform.position.set(offset, side * 2.04, 0.01);
      pinTransform.rotation.set(0, 0, Math.PI / 2);
      pinTransform.updateMatrix();
      pins.setMatrixAt(pinIndex, pinTransform.matrix);
      pinIndex += 1;
    });
  }
  pins.instanceMatrix.needsUpdate = true;
  chipCore.add(pins);

  const chipTraceMaterial = new THREE.LineBasicMaterial({
    color: COLORS.lime,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const addTrace = (points: readonly THREE.Vector3[]) => {
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    geometry.setDrawRange(0, 0);
    chipTraceTargets.push({ geometry, count: points.length });
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

  return {
    group,
    solidTargets,
    wireTargets,
    chipTargets,
    chipTraceTargets,
    chipCore,
    mark,
    markMaterial,
    glowMaterial,
    chipTraceMaterial,
  };
}

function createCabGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(-1.55, -1.05);
  shape.lineTo(1.25, -1.05);
  shape.lineTo(1.5, -0.62);
  shape.lineTo(1.5, 0.34);
  shape.lineTo(0.84, 0.72);
  shape.lineTo(0.48, 1.52);
  shape.lineTo(-1.38, 1.52);
  shape.lineTo(-1.55, -1.05);
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

function createTruck(markTexture: THREE.Texture) {
  const group = new THREE.Group();
  const solidTargets: OpacityTarget[] = [];
  const wireTargets: OpacityTarget[] = [];

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
    true,
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
    [4.55, 1.8, 0],
    undefined,
    0.9,
    true,
  );
  addMesh(
    new THREE.BoxGeometry(1.68, 0.92, 2.34, 4, 2, 4),
    new THREE.MeshStandardMaterial({ color: 0xc8d0ca, metalness: 0.48, roughness: 0.34, opacity: 0 }),
    [5.82, 1.35, 0],
    undefined,
    0.84,
    true,
  );
  addMesh(
    new THREE.BoxGeometry(0.34, 0.34, 2.68),
    new THREE.MeshStandardMaterial({ color: COLORS.metal, metalness: 0.82, roughness: 0.22, opacity: 0 }),
    [6.48, 0.7, 0],
    undefined,
    0.78,
  );
  addMesh(
    new THREE.BoxGeometry(0.2, 0.9, 1.76, 1, 5, 8),
    new THREE.MeshStandardMaterial({ color: 0x263029, metalness: 0.8, roughness: 0.24, opacity: 0 }),
    [6.69, 1.36, 0],
    undefined,
    0.92,
    true,
  );
  addMesh(
    new THREE.BoxGeometry(2.05, 0.28, 2.26),
    new THREE.MeshStandardMaterial({ color: 0xd2d8d3, metalness: 0.42, roughness: 0.38, opacity: 0 }),
    [3.95, 3.35, 0],
    undefined,
    0.72,
  );
  [-1.08, 1.08].forEach((z) => {
    addMesh(
      new THREE.CylinderGeometry(0.12, 0.15, 2.55, 14, 5),
      new THREE.MeshStandardMaterial({ color: COLORS.metal, metalness: 0.88, roughness: 0.18, opacity: 0 }),
      [3.18, 2.65, z],
      undefined,
      0.92,
      true,
    );
    addMesh(
      new THREE.CylinderGeometry(0.38, 0.38, 1.72, 20, 4),
      new THREE.MeshStandardMaterial({ color: COLORS.metal, metalness: 0.72, roughness: 0.3, opacity: 0 }),
      [3.3, 0.92, z],
      new THREE.Euler(0, 0, Math.PI / 2),
      0.78,
      true,
    );
    addMesh(
      new THREE.BoxGeometry(0.48, 0.32, 0.1),
      new THREE.MeshStandardMaterial({ color: COLORS.ink, metalness: 0.54, roughness: 0.32, opacity: 0 }),
      [5.02, 2.77, z * 1.38],
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

  const window = frontPlane(1.55, 0.86, 0x101c18, 4.65, 2.65, 1.245);
  window.rotation.z = -0.04;
  frontPlane(0.72, 0.48, COLORS.inkLight, 5.75, 1.12, 1.26);
  frontPlane(0.32, 0.18, COLORS.lime, 6.03, 0.92, 1.28);
  frontPlane(2.2, 0.15, COLORS.lime, 4.15, 1.25, 1.275);

  const frontFaceMaterial = registerOpacity(
    solidTargets,
    new THREE.MeshBasicMaterial({
      color: 0x27312b,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    }),
  );
  const grille = new THREE.Mesh(new THREE.PlaneGeometry(1.72, 0.92, 8, 6), frontFaceMaterial);
  grille.position.set(6.8, 1.38, 0);
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
  const grilleWire = new THREE.LineSegments(new THREE.WireframeGeometry(grille.geometry), grilleWireMaterial);
  grilleWire.position.copy(grille.position);
  grilleWire.rotation.copy(grille.rotation);
  group.add(grilleWire);

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
  [-4.2, -2.95, 3.95, 5.35].forEach((x) => {
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

  return { group, solidTargets, wireTargets, shadowMaterial };
}

function createYard(sunsetTexture: THREE.Texture) {
  const group = new THREE.Group();
  const targets: OpacityTarget[] = [];

  const skyMaterial = registerOpacity(
    targets,
    new THREE.MeshBasicMaterial({
      map: sunsetTexture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(48, 24), skyMaterial);
  sky.position.set(0, 7.4, -8);
  group.add(sky);

  const groundMaterial = registerOpacity(
    targets,
    new THREE.MeshStandardMaterial({ color: COLORS.nearBlack, roughness: 0.94, metalness: 0.03, opacity: 0 }),
  );
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 36), groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.06;
  ground.receiveShadow = true;
  group.add(ground);

  const depotMaterial = new THREE.MeshStandardMaterial({
    color: 0x151a15,
    roughness: 0.75,
    metalness: 0.18,
    opacity: 0,
  });
  const depot = new THREE.Mesh(new THREE.BoxGeometry(18, 3.8, 3.2), registerOpacity(targets, depotMaterial));
  depot.position.set(-7.5, 1.86, -5.6);
  group.add(depot);

  const lineMaterial = registerOpacity(
    targets,
    new THREE.LineBasicMaterial({ color: COLORS.white, transparent: true, opacity: 0 }),
    0.28,
  );
  const lines: number[] = [];
  [-5, 0, 5].forEach((x) => lines.push(x, 0.01, -12, x, 0.01, 12));
  const roadLines = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(lines, 3)),
    lineMaterial,
  );
  group.add(roadLines);

  return { group, targets };
}

const BRAZIL_POINTS: readonly Point2[] = [
  [-2.78, 2.78], [-2.52, 3.48], [-1.68, 4.42], [-0.68, 4.22], [0.12, 4.5],
  [0.78, 4.06], [1.72, 3.86], [2.7, 3.28], [3.36, 2.5], [3.42, 1.72],
  [3.12, 1.12], [3.64, 0.46], [3.18, -0.28], [2.78, -1.08], [2.36, -2.08],
  [1.66, -3.08], [0.76, -4.48], [0.02, -4.08], [-0.42, -3.1], [-1.08, -2.58],
  [-1.7, -2.24], [-2.02, -1.48], [-2.82, -0.78], [-3.34, 0.18], [-3.08, 1.04],
  [-2.56, 1.7], [-2.78, 2.78],
] as const;

function createBrazil(dotTexture: THREE.Texture) {
  const group = new THREE.Group();
  const targets: OpacityTarget[] = [];
  const planarTargets: OpacityTarget[] = [];
  const routeTargets: DrawTarget[] = [];
  const pointPositions: number[] = [];
  const spherePositions: number[] = [];
  const minX = -3.34;
  const maxX = 3.64;
  const minY = -4.48;
  const maxY = 4.5;
  const step = 0.245;
  let row = 0;
  for (let y = minY; y <= maxY; y += step, row += 1) {
    const rowOffset = row % 2 ? step / 2 : 0;
    for (let x = minX + rowOffset; x <= maxX; x += step) {
      if (!pointInPolygon([x, y], BRAZIL_POINTS)) continue;
      pointPositions.push(x, y, 0.07);
      const longitude = THREE.MathUtils.lerp(-74, -34, (x - minX) / (maxX - minX));
      const latitude = THREE.MathUtils.lerp(-34, 5, (y - minY) / (maxY - minY));
      spherePositions.push(...lonLatToSphere([longitude, latitude], 4.91).toArray());
    }
  }
  const pointsGeometry = new THREE.BufferGeometry();
  pointsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(pointPositions, 3));
  const pointsMaterial = registerOpacity(
    targets,
    new THREE.PointsMaterial({
      map: dotTexture,
      color: COLORS.lime,
      size: 0.155,
      transparent: true,
      opacity: 0,
      alphaTest: 0.02,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
    0.96,
  );
  group.add(new THREE.Points(pointsGeometry, pointsMaterial));

  const outlineMaterial = registerOpacity(
    planarTargets,
    new THREE.LineBasicMaterial({
      color: COLORS.lime,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
  );
  const outlineGeometry = new THREE.BufferGeometry().setFromPoints(
    BRAZIL_POINTS.slice(0, -1).map(([x, y]) => new THREE.Vector3(x, y, 0.05)),
  );
  group.add(new THREE.LineLoop(outlineGeometry, outlineMaterial));

  const routeMaterial = registerOpacity(
    planarTargets,
    new THREE.LineBasicMaterial({
      color: COLORS.white,
      transparent: true,
      opacity: 0,
      toneMapped: false,
    }),
    0.78,
  );
  const routes: readonly THREE.Vector3[][] = [
    [[-2.45, 0.38], [-0.9, 1.35], [0.55, 1.18], [2.78, 2.5]].map(([x, y]) => new THREE.Vector3(x, y, 0.08)),
    [[-1.7, -1.38], [-0.2, -0.35], [1.35, -0.55], [2.62, -1.42]].map(([x, y]) => new THREE.Vector3(x, y, 0.08)),
    [[-0.9, 3.52], [-0.45, 1.8], [0.18, 0.12], [0.86, -2.85]].map(([x, y]) => new THREE.Vector3(x, y, 0.08)),
  ];
  routes.forEach((route) => {
    const points = new THREE.CatmullRomCurve3(route).getPoints(64);
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    geometry.setDrawRange(0, 0);
    routeTargets.push({ geometry, count: points.length });
    group.add(new THREE.Line(geometry, routeMaterial));
  });

  const nodeMaterial = registerOpacity(
    planarTargets,
    new THREE.MeshBasicMaterial({
      color: COLORS.lime,
      transparent: true,
      opacity: 0,
      toneMapped: false,
    }),
  );
  [[-2.45, 0.38], [2.78, 2.5], [-1.7, -1.38], [2.62, -1.42], [-0.9, 3.52], [0.86, -2.85]]
    .forEach(([x, y]) => {
      const node = new THREE.Mesh(new THREE.CircleGeometry(0.1, 16), nodeMaterial);
      node.position.set(x, y, 0.1);
      group.add(node);
    });

  return {
    group,
    targets,
    planarTargets,
    routeTargets,
    pointsGeometry,
    pointPositions: new Float32Array(pointPositions),
    spherePositions: new Float32Array(spherePositions),
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

function createGlobe(dotTexture: THREE.Texture) {
  const group = new THREE.Group();
  const targets: OpacityTarget[] = [];
  const routeTargets: DrawTarget[] = [];
  const radius = 4.8;

  const shellMaterial = registerOpacity(
    targets,
    new THREE.MeshBasicMaterial({
      color: COLORS.limeDark,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
    0.1,
  );
  group.add(new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 30), shellMaterial));

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
    0.22,
  );
  group.add(new THREE.Mesh(new THREE.SphereGeometry(radius + 0.035, 32, 20), wireMaterial));

  const random = seededRandom(0x524f4442);
  const dotPositions: number[] = [];
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
  const dotsGeometry = new THREE.BufferGeometry();
  dotsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(dotPositions, 3));
  const dotsMaterial = registerOpacity(
    targets,
    new THREE.PointsMaterial({
      map: dotTexture,
      color: COLORS.white,
      size: 0.115,
      transparent: true,
      opacity: 0,
      alphaTest: 0.02,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
    0.78,
  );
  group.add(new THREE.Points(dotsGeometry, dotsMaterial));

  const coastMaterial = registerOpacity(
    targets,
    new THREE.LineBasicMaterial({
      color: COLORS.white,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
    0.28,
  );
  LAND_POLYGONS.forEach((polygon) => {
    const coast = polygon.map((point) => lonLatToSphere(point, radius + 0.08));
    group.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(coast), coastMaterial));
  });

  const routeMaterial = registerOpacity(
    targets,
    new THREE.LineBasicMaterial({
      color: COLORS.lime,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
    0.92,
  );
  const start = lonLatToSphere([-47.8, -15.8], radius + 0.1);
  [
    [-99.1, 19.4],
    [2.35, 48.86],
    [103.82, 1.35],
  ].forEach((destination) => {
    const end = lonLatToSphere(destination as LonLat, radius + 0.1);
    const control = start.clone().add(end).normalize().multiplyScalar(radius + 2.5);
    const points = new THREE.QuadraticBezierCurve3(start, control, end).getPoints(72);
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    geometry.setDrawRange(0, 0);
    routeTargets.push({ geometry, count: points.length });
    group.add(new THREE.Line(geometry, routeMaterial));
  });

  return { group, targets, routeTargets };
}

export function createHomeScene(canvas: HTMLCanvasElement): HomeSceneController {
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
  const keyLight = new THREE.DirectionalLight(0xffe1b8, 3.4);
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
  const sunsetTexture = createSunsetTexture();
  const phone = createPhone(markTexture);
  const truck = createTruck(markTexture);
  const yard = createYard(sunsetTexture);
  const brazil = createBrazil();
  const particles = createParticles();
  const globe = createGlobe();

  scene.add(yard.group, truck.group, phone.group, brazil.group, particles.points, globe.group);

  let currentProgress = -1;
  let disposed = false;
  let cameraDistanceScale = 1;
  const clearColor = new THREE.Color(COLORS.night);
  const warmColor = new THREE.Color(0x15130d);
  const cameraPosition = new THREE.Vector3();
  const cameraTarget = new THREE.Vector3();

  const render = (progress: number) => {
    if (disposed) return;
    const sample = sampleHomeTimeline(progress);
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
      * (1 - smoothstep(segment(sample.progress, 0.31, 0.43)));
    phone.group.rotation.set(0.025 * phoneTurn, -0.08 - phoneTurn * 0.2, -0.018 * phoneTurn);
    applyOpacity(phone.bodyTargets, sample.phoneBodyOpacity);
    const phoneMarkOpacity = 1 - smoothstep(segment(sample.progress, 0.36, 0.45));
    phone.markMaterial.opacity = phoneMarkOpacity;
    phone.markMaterial.visible = phoneMarkOpacity > 0.001;
    phone.glowMaterial.opacity = phoneMarkOpacity * (0.025 + 0.012 * Math.sin(sample.progress * Math.PI * 8));
    phone.glowMaterial.visible = phoneMarkOpacity > 0.001;
    phone.mark.scale.setScalar(sample.phoneMarkScale);
    phone.traceMaterial.opacity = 0.62 * (1 - smoothstep(segment(sample.progress, 0.08, 0.17)));
    phone.traceMaterial.visible = phone.traceMaterial.opacity > 0.001;

    applyOpacity(truck.solidTargets, sample.truckOpacity * sample.truckSolidOpacity);
    applyOpacity(truck.wireTargets, sample.truckOpacity * sample.truckWireOpacity);
    truck.shadowMaterial.opacity = sample.truckOpacity * sample.truckSolidOpacity * 0.42;
    truck.shadowMaterial.visible = truck.shadowMaterial.opacity > 0.001;
    truck.group.rotation.y = -0.035 + smoothstep(segment(sample.progress, 0.3, 0.55)) * 0.065;
    truck.group.position.y = smoothstep(segment(sample.progress, 0.57, 0.75)) * 0.08;

    applyOpacity(yard.targets, sample.yardOpacity);
    clearColor.copy(new THREE.Color(COLORS.night)).lerp(warmColor, sample.sunsetOpacity * 0.36);
    renderer.setClearColor(clearColor, 1);

    particles.material.opacity = sample.particlesOpacity * 0.62;
    particles.material.visible = particles.material.opacity > 0.001;
    particles.points.rotation.y = sample.progress * 0.5;

    brazil.group.position.set(...sample.brazilPosition);
    brazil.group.rotation.set(sample.brazilRotationX, 0, 0);
    brazil.group.scale.setScalar(sample.brazilScale);
    applyOpacity(brazil.targets, sample.brazilOpacity);
    brazil.routeTargets.forEach(({ geometry, count }) => {
      geometry.setDrawRange(0, Math.max(0, Math.round(count * sample.brazilRoutes)));
    });

    globe.group.scale.setScalar(sample.globeScale);
    globe.group.rotation.y = sample.globeRotationY;
    applyOpacity(globe.targets, sample.globeOpacity);
    globe.routeTargets.forEach(({ geometry, count }) => {
      geometry.setDrawRange(0, Math.max(0, Math.round(count * sample.globeRoutes)));
    });

    brandLight.intensity = 11 + 12 * (1 - sample.truckSolidOpacity);
    renderer.render(scene, camera);
  };

  return {
    resize(width, height, pixelRatio) {
      if (disposed || width <= 0 || height <= 0) return;
      renderer.setPixelRatio(Math.min(1.6, Math.max(1, pixelRatio)));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      cameraDistanceScale = camera.aspect < 0.85
        ? 1.45 - smoothstep(segment(camera.aspect, 0.5, 0.85)) * 0.45
        : 1;
      camera.updateProjectionMatrix();
      render(currentProgress < 0 ? 0 : currentProgress);
    },
    setProgress(progress) {
      const next = Math.max(0, Math.min(1, progress));
      if (Math.abs(currentProgress - next) < 0.0004) return;
      render(next);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
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
      sunsetTexture.dispose();
      renderer.dispose();
    },
  };
}
