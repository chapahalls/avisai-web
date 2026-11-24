import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HOME_TRUCK_WIREFRAME_URL } from './truckAsset';
import { clamp01, segment, smoothstep } from './timeline';
import { DOCK_PROVE_TIMING, dockStepAt } from './dockTimeline';

export { DOCK_PROVE_TIMING, DOCK_STEPS, dockStepAt, type DockStep } from './dockTimeline';

/**
 * Cena 3D da seção "Como funciona": o mesmo caminhão wireframe da hero, visto
 * de cima, chega à doca 3 em quatro etapas (avisar, chegar, conversar, provar).
 * Os textos ficam no HTML (i18n); aqui só há geometria.
 */

const COLORS = {
  night: 0x050806,
  lime: 0xa2f200,
  limeDark: 0x426e0c,
  line: 0xd6ddd6,
  wait: 0xf5a524,
  ink: 0x354037,
};

const BAY_SPACING = 3.3;
const BAY_WIDTH = 2.95;
const DOCK_FACE_Z = -5;
const BAY_DEPTH = 6;
const TRUCK_HALF_LENGTH = 7;
const PARKED_Z = DOCK_FACE_Z + TRUCK_HALF_LENGTH + 0.15;
const START_Z = PARKED_Z + 24;

export type DockSceneController = {
  resize: (width: number, height: number, pixelRatio: number) => void;
  setProgress: (progress: number) => void;
  setActive: (active: boolean) => void;
  dispose: () => void;
};

function lineMaterial(color: number, opacity: number) {
  return new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
}

function rectLine(width: number, depth: number, material: THREE.LineBasicMaterial) {
  const x = width / 2;
  const z = depth / 2;
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-x, 0, -z),
    new THREE.Vector3(x, 0, -z),
    new THREE.Vector3(x, 0, z),
    new THREE.Vector3(-x, 0, z),
  ]);
  return new THREE.LineLoop(geometry, material);
}

function numberTexture(label: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (context) {
    context.fillStyle = '#aeb8b0';
    context.font = '500 72px "Space Grotesk", Inter, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(label, 64, 68);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Sala do Centro de Controle Operacional em wireframe (parede de vídeo, mesas, operadores). */
function createControlRoom() {
  const group = new THREE.Group();
  const lineSegments: number[] = [];
  const dimSegments: number[] = [];
  const add = (target: number[], ...points: [number, number, number][]) => {
    for (let index = 0; index < points.length - 1; index += 1) target.push(...points[index], ...points[index + 1]);
  };
  const rect = (target: number[], x0: number, y0: number, x1: number, y1: number, z: number) =>
    add(target, [x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], [x0, y0, z]);
  const box = (target: number[], cx: number, cy: number, cz: number, w: number, h: number, d: number) => {
    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d));
    const position = edges.getAttribute('position');
    for (let index = 0; index < position.count; index += 1) {
      target.push(position.getX(index) + cx, position.getY(index) + cy, position.getZ(index) + cz);
    }
    edges.dispose();
  };

  // Piso, parede e teto.
  for (let x = -12; x <= 12; x += 1.5) add(dimSegments, [x, 0, -10], [x, 0, 9]);
  for (let z = -10; z <= 9; z += 1.5) add(dimSegments, [-12, 0, z], [12, 0, z]);
  rect(dimSegments, -12, 0, 12, 10, -10);
  for (let x = -9; x <= 9; x += 4.5) rect(dimSegments, x - 1, 9.6, x + 1, 9.6, -4);
  box(lineSegments, 0, 8.4, -3.5, 19, 1.8, 0.3);

  // Parede de vídeo 6 × 3 com "câmeras de estrada" desenhadas em cada painel.
  const wall = { x0: -7.5, x1: 7.5, y0: 2.2, y1: 6.8, z: -9.9, cols: 6, rows: 3 };
  rect(lineSegments, wall.x0, wall.y0, wall.x1, wall.y1, wall.z);
  const panelW = (wall.x1 - wall.x0) / wall.cols;
  const panelH = (wall.y1 - wall.y0) / wall.rows;
  for (let col = 1; col < wall.cols; col += 1) add(lineSegments, [wall.x0 + col * panelW, wall.y0, wall.z], [wall.x0 + col * panelW, wall.y1, wall.z]);
  for (let row = 1; row < wall.rows; row += 1) add(lineSegments, [wall.x0, wall.y0 + row * panelH, wall.z], [wall.x1, wall.y0 + row * panelH, wall.z]);
  for (let col = 0; col < wall.cols; col += 1) {
    for (let row = 0; row < wall.rows; row += 1) {
      const x = wall.x0 + col * panelW;
      const y = wall.y0 + row * panelH;
      const vanishX = x + panelW * 0.5;
      const vanishY = y + panelH * 0.62;
      add(dimSegments, [x + panelW * 0.08, y + 0.05, wall.z], [vanishX - 0.05, vanishY, wall.z]);
      add(dimSegments, [x + panelW * 0.92, y + 0.05, wall.z], [vanishX + 0.05, vanishY, wall.z]);
      add(dimSegments, [x + panelW * 0.5, y + 0.05, wall.z], [vanishX, vanishY, wall.z]);
    }
  }

  // Três fileiras de mesas com monitores; operadores de costas, olhando a parede.
  const monitorSegments: number[] = [];
  [-4.5, -0.5, 3.5].forEach((rowZ, rowIndex) => {
    box(lineSegments, 0, 1.1, rowZ, 17, 0.08, 1.4);
    box(dimSegments, 0, 0.55, rowZ + 0.6, 17, 1.1, 0.02);
    for (let x = -7.2; x <= 7.2; x += 2.4) {
      rect(monitorSegments, x - 0.8, 1.35, x + 0.8, 2.3, rowZ - 0.35);
      add(dimSegments, [x, 1.14, rowZ - 0.3], [x, 1.35, rowZ - 0.33]);
    }
    if (rowIndex === 0) return;
    [-4.8, 0, 4.8].forEach((x) => {
      const z = rowZ + 1.25;
      const head = new THREE.WireframeGeometry(new THREE.SphereGeometry(0.27, 8, 6));
      const headPosition = head.getAttribute('position');
      for (let index = 0; index < headPosition.count; index += 1) {
        dimSegments.push(headPosition.getX(index) + x, headPosition.getY(index) + 2.15, headPosition.getZ(index) + z);
      }
      head.dispose();
      box(lineSegments, x, 1.5, z, 0.8, 0.75, 0.42);
      rect(lineSegments, x - 0.45, 0.9, x + 0.45, 1.9, z + 0.32);
      add(dimSegments, [x, 0.9, z + 0.25], [x, 0.25, z + 0.25]);
      for (let leg = 0; leg < 5; leg += 1) {
        const angle = (leg / 5) * Math.PI * 2;
        add(dimSegments, [x, 0.25, z + 0.25], [x + Math.cos(angle) * 0.45, 0.05, z + 0.25 + Math.sin(angle) * 0.45]);
      }
    });
  });

  const lineMat = lineMaterial(COLORS.line, 0);
  const dimMat = lineMaterial(COLORS.line, 0);
  const monitorMat = lineMaterial(COLORS.line, 0);
  const build = (segments: number[], material: THREE.LineBasicMaterial) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(segments, 3));
    group.add(new THREE.LineSegments(geometry, material));
  };
  build(dimSegments, dimMat);
  build(lineSegments, lineMat);
  build(monitorSegments, monitorMat);

  // Painel que recebe o comprovante (coluna 3, linha do meio).
  const target = new THREE.Vector3(wall.x0 + panelW * 2.5, wall.y0 + panelH * 1.5, wall.z + 0.02);
  const litMaterial = new THREE.MeshBasicMaterial({ color: COLORS.lime, transparent: true, opacity: 0, depthWrite: false });
  const lit = new THREE.Mesh(new THREE.PlaneGeometry(panelW - 0.12, panelH - 0.12), litMaterial);
  lit.position.copy(target);
  group.add(lit);
  const litFrameMaterial = lineMaterial(COLORS.lime, 0);
  const litFrame = rectLine(panelW, panelH, litFrameMaterial);
  litFrame.rotation.x = Math.PI / 2;
  litFrame.position.copy(target).setZ(target.z + 0.01);
  group.add(litFrame);

  return { group, target, materials: { lineMat, dimMat, monitorMat, litMaterial, litFrameMaterial } };
}

async function loadTruck() {
  const gltf = await new GLTFLoader().loadAsync(HOME_TRUCK_WIREFRAME_URL);
  const materials: THREE.LineBasicMaterial[] = [];
  gltf.scene.traverse((object) => {
    if (!(object instanceof THREE.LineSegments)) return;
    const isWheel = object.parent?.userData.role === 'wheel';
    const material = new THREE.LineBasicMaterial({
      color: isWheel ? COLORS.limeDark : COLORS.lime,
      transparent: true,
      opacity: isWheel ? 0.55 : 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    object.material = material;
    materials.push(material);
  });
  const group = new THREE.Group();
  group.add(gltf.scene);
  // Cabine (+X no modelo) para baixo na tela, traseira encostando na doca.
  group.rotation.y = -Math.PI / 2;
  return { group, materials };
}

export async function createDockScene(
  canvas: HTMLCanvasElement,
  { reducedMotion = false } = {},
): Promise<DockSceneController> {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(COLORS.night, 1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(item: T) => {
    disposables.push(item);
    return item;
  };

  // Estrelas/poeira do pátio.
  const random = (() => {
    let state = 0x444f434b;
    return () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0xffffffff;
    };
  })();
  const dust: number[] = [];
  for (let index = 0; index < 260; index += 1) {
    dust.push((random() - 0.5) * 30, -0.05, (random() - 0.5) * 34);
  }
  const dustGeometry = track(new THREE.BufferGeometry());
  dustGeometry.setAttribute('position', new THREE.Float32BufferAttribute(dust, 3));
  scene.add(new THREE.Points(dustGeometry, track(new THREE.PointsMaterial({
    color: COLORS.line,
    size: 0.07,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  }))));

  // Docas 1–5, numeração e linha tracejada do pátio.
  const bayMaterial = track(lineMaterial(COLORS.line, 0.42));
  const bays: THREE.LineLoop[] = [];
  for (let index = 0; index < 5; index += 1) {
    const x = (index - 2) * BAY_SPACING;
    const bay = rectLine(BAY_WIDTH, BAY_DEPTH, bayMaterial);
    bay.position.set(x, 0, DOCK_FACE_Z - BAY_DEPTH / 2);
    scene.add(bay);
    bays.push(bay);
    const label = new THREE.Mesh(
      track(new THREE.PlaneGeometry(1.1, 1.1)),
      track(new THREE.MeshBasicMaterial({
        map: track(numberTexture(String(index + 1))),
        transparent: true,
        depthWrite: false,
      })),
    );
    label.rotation.x = -Math.PI / 2;
    label.position.set(x, 0.01, DOCK_FACE_Z + 0.9);
    scene.add(label);
  }
  const yardLine = new THREE.Line(
    track(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-9.5, 0, DOCK_FACE_Z + 3.2),
      new THREE.Vector3(9.5, 0, DOCK_FACE_Z + 3.2),
    ])),
    track(new THREE.LineDashedMaterial({
      color: COLORS.line,
      dashSize: 0.35,
      gapSize: 0.28,
      transparent: true,
      opacity: 0.38,
    })),
  );
  yardLine.computeLineDistances();
  scene.add(yardLine);

  // Rota de chegada (etapa 1) desenhada até a doca 3.
  const routePoints = [
    new THREE.Vector3(5.5, 0.02, 17),
    new THREE.Vector3(3.2, 0.02, 12),
    new THREE.Vector3(0.4, 0.02, 9),
    new THREE.Vector3(0, 0.02, DOCK_FACE_Z + 0.2),
  ];
  const routeGeometry = track(new THREE.BufferGeometry().setFromPoints(
    new THREE.CatmullRomCurve3(routePoints).getPoints(120),
  ));
  const routeMaterial = track(lineMaterial(COLORS.lime, 0));
  scene.add(new THREE.Line(routeGeometry, routeMaterial));

  // Cerca virtual da doca 3 (etapa 2).
  const fenceDepth = BAY_DEPTH + TRUCK_HALF_LENGTH * 2 + 0.6;
  const fenceMaterial = track(lineMaterial(COLORS.lime, 0));
  const fence = rectLine(BAY_WIDTH + 0.5, fenceDepth, fenceMaterial);
  fence.position.set(0, 0.03, DOCK_FACE_Z - BAY_DEPTH + fenceDepth / 2);
  scene.add(fence);
  const fenceFillMaterial = track(new THREE.MeshBasicMaterial({
    color: COLORS.lime,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  const fenceFill = new THREE.Mesh(track(new THREE.PlaneGeometry(BAY_WIDTH + 0.5, fenceDepth)), fenceFillMaterial);
  fenceFill.rotation.x = -Math.PI / 2;
  fenceFill.position.copy(fence.position).setY(0.005);
  scene.add(fenceFill);

  // Caminhão da hero.
  const truck = await loadTruck().catch(() => null);
  const truckGroup = truck?.group ?? new THREE.Group();
  truck?.materials.forEach((material) => disposables.push(material));
  scene.add(truckGroup);

  // Ondas de voz na cabine (etapa 3).
  const cabOffset = TRUCK_HALF_LENGTH - 1.6;
  const pulseGeometry = track(new THREE.RingGeometry(0.92, 1, 64));
  const pulses = Array.from({ length: 3 }, () => {
    const material = track(new THREE.MeshBasicMaterial({
      color: COLORS.lime,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    }));
    const mesh = new THREE.Mesh(pulseGeometry, material);
    mesh.rotation.x = -Math.PI / 2;
    scene.add(mesh);
    return { mesh, material };
  });
  const voiceDotMaterial = track(new THREE.MeshBasicMaterial({ color: COLORS.lime, transparent: true, opacity: 0 }));
  const voiceDot = new THREE.Mesh(track(new THREE.CircleGeometry(0.55, 40)), voiceDotMaterial);
  voiceDot.rotation.x = -Math.PI / 2;
  scene.add(voiceDot);

  // Anel da estadia (etapa 4).
  const stayCenter = new THREE.Vector3(0, 3.8, PARKED_Z - 2.2);
  const stayTrackMaterial = track(new THREE.MeshBasicMaterial({ color: COLORS.ink, transparent: true, opacity: 0, side: THREE.DoubleSide }));
  const stayTrack = new THREE.Mesh(track(new THREE.RingGeometry(1.55, 1.75, 96)), stayTrackMaterial);
  stayTrack.rotation.x = -Math.PI / 2;
  stayTrack.position.copy(stayCenter);
  scene.add(stayTrack);
  const stayArcMaterial = track(new THREE.MeshBasicMaterial({ color: COLORS.wait, transparent: true, opacity: 0, side: THREE.DoubleSide }));
  const stayArc = new THREE.Mesh(track(new THREE.RingGeometry(1.55, 1.75, 96, 1, 0, 0.0001)), stayArcMaterial);
  stayArc.rotation.x = -Math.PI / 2;
  stayArc.position.copy(stayCenter).setY(stayCenter.y + 0.01);
  scene.add(stayArc);
  let lastStayAngle = -1;

  // Pacote do comprovante: sai pela borda da tela, estoura e reaparece no CCO.
  const packetMaterial = track(new THREE.MeshBasicMaterial({ color: COLORS.lime, transparent: true, opacity: 0, wireframe: true }));
  const packet = new THREE.Mesh(track(new THREE.BoxGeometry(0.7, 0.7, 0.7)), packetMaterial);
  scene.add(packet);
  const packetCoreMaterial = track(new THREE.MeshBasicMaterial({ color: COLORS.lime, transparent: true, opacity: 0 }));
  const packetCore = new THREE.Mesh(track(new THREE.BoxGeometry(0.34, 0.34, 0.34)), packetCoreMaterial);
  packet.add(packetCore);
  const TRAIL_POINTS = 90;
  const trailGeometry = track(new THREE.BufferGeometry());
  trailGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_POINTS * 3), 3));
  const trailMaterial = track(lineMaterial(COLORS.lime, 0));
  const trail = new THREE.Line(trailGeometry, trailMaterial);
  trail.frustumCulled = false;
  scene.add(trail);

  // Estouro: partículas que se espalham a partir de um ponto.
  const BURST_COUNT = 70;
  const burstDirections = Array.from({ length: BURST_COUNT }, () =>
    new THREE.Vector3(random() - 0.5, random() - 0.5, random() - 0.5).normalize().multiplyScalar(0.4 + random() * 0.8));
  const createBurst = () => {
    const geometry = track(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(BURST_COUNT * 3), 3));
    const material = track(new THREE.PointsMaterial({
      color: COLORS.lime,
      size: 0.16,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    scene.add(points);
    return {
      material,
      update(origin: THREE.Vector3, amount: number, reach: number) {
        const attribute = geometry.getAttribute('position') as THREE.BufferAttribute;
        burstDirections.forEach((direction, index) => {
          attribute.setXYZ(
            index,
            origin.x + direction.x * reach * amount,
            origin.y + direction.y * reach * amount,
            origin.z + direction.z * reach * amount,
          );
        });
        attribute.needsUpdate = true;
        material.opacity = amount > 0 && amount < 1 ? 1 - amount : 0;
      },
    };
  };
  const edgeBurst = createBurst();
  const wallBurst = createBurst();

  // Sala do CCO, longe do pátio; vista por uma segunda câmera após o corte.
  const ROOM_OFFSET = new THREE.Vector3(300, 0, 0);
  const room = createControlRoom();
  room.group.position.copy(ROOM_OFFSET);
  scene.add(room.group);
  Object.values(room.materials).forEach((material) => disposables.push(material));
  const roomCamera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
  const roomTarget = room.target.clone().add(ROOM_OFFSET);
  const wallRingMaterial = track(new THREE.MeshBasicMaterial({
    color: COLORS.lime,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  }));
  const wallRing = new THREE.Mesh(pulseGeometry, wallRingMaterial);
  wallRing.position.copy(roomTarget).setZ(roomTarget.z + 0.03);
  scene.add(wallRing);

  const ndcPoint = (activeCamera: THREE.PerspectiveCamera, x: number, y: number, distance: number) => {
    const direction = new THREE.Vector3(x, y, 0.5).unproject(activeCamera).sub(activeCamera.position).normalize();
    return activeCamera.position.clone().addScaledVector(direction, distance);
  };
  const curve = new THREE.QuadraticBezierCurve3();
  const setTrail = (amount: number) => {
    const attribute = trailGeometry.getAttribute('position') as THREE.BufferAttribute;
    for (let index = 0; index < TRAIL_POINTS; index += 1) {
      const point = curve.getPoint((index / (TRAIL_POINTS - 1)) * amount);
      attribute.setXYZ(index, point.x, point.y, point.z);
    }
    attribute.needsUpdate = true;
    trailGeometry.setDrawRange(0, amount > 0 ? TRAIL_POINTS : 0);
  };

  let progress = 0;
  let active = false;
  let disposed = false;
  let frameId = 0;
  let width = 1;
  let height = 1;

  const render = (seconds: number) => {
    const { index, local } = dockStepAt(progress);
    const step = (target: number) => (index > target ? 1 : index === target ? local : 0);
    const s1 = step(0);
    const s2 = step(1);
    const s3 = step(2);
    const s4 = step(3);

    // Chegada: entra pelo fim do pátio na etapa 1 e estaciona na etapa 2.
    const approach = smoothstep(segment(s1, 0.15, 1)) * 0.55 + smoothstep(s2) * 0.45;
    truckGroup.position.set(0, 0, THREE.MathUtils.lerp(START_Z, PARKED_Z, approach));

    routeMaterial.opacity = 0.9 * smoothstep(segment(s1, 0, 0.5)) * (1 - smoothstep(segment(s2, 0.5, 1)));
    routeGeometry.setDrawRange(0, Math.round(121 * smoothstep(segment(s1, 0, 0.7))));

    const fenceIn = smoothstep(segment(s2, 0.55, 0.95)) * (1 - 0.6 * smoothstep(s4));
    fenceMaterial.opacity = 0.95 * fenceIn;
    fenceFillMaterial.opacity = 0.06 * fenceIn;
    bayMaterial.opacity = 0.42 + 0.2 * fenceIn;

    const cab = new THREE.Vector3(0, 3.6, truckGroup.position.z + cabOffset);
    const talking = smoothstep(segment(s3, 0, 0.25)) * (1 - smoothstep(segment(s4, 0, 0.3)));
    voiceDot.position.copy(cab);
    voiceDotMaterial.opacity = talking;
    pulses.forEach(({ mesh, material }, pulseIndex) => {
      const phase = reducedMotion ? (pulseIndex + 1) / 4 : (seconds * 0.7 + pulseIndex / pulses.length) % 1;
      mesh.position.copy(cab).setY(cab.y - 0.01);
      mesh.scale.setScalar(0.7 + phase * 1.9);
      material.opacity = talking * (1 - phase) * 0.8;
    });

    const stayIn = smoothstep(segment(s4, 0, 0.3));
    stayTrackMaterial.opacity = 0.9 * stayIn;
    stayArcMaterial.opacity = stayIn;
    const angle = Math.max(0.0001, Math.PI * 2 * smoothstep(segment(s4, 0.04, DOCK_PROVE_TIMING.ringEnd)));
    if (Math.abs(angle - lastStayAngle) > 0.002) {
      lastStayAngle = angle;
      stayArc.geometry.dispose();
      stayArc.geometry = new THREE.RingGeometry(1.55, 1.75, 96, 1, Math.PI / 2, -angle);
    }
    // Anel completo fica lima: o comprovante está pronto para sair.
    stayArcMaterial.color.setHex(s4 >= DOCK_PROVE_TIMING.ringEnd ? COLORS.lime : COLORS.wait);

    const timing = DOCK_PROVE_TIMING;
    const inRoom = s4 >= timing.cut;
    const activeCamera = inRoom ? roomCamera : camera;
    packet.rotation.set(seconds * 1.6, seconds * 2.1, 0);

    // 1) Do anel até a borda superior direita do painel.
    const flight = segment(s4, timing.flightStart, timing.burst);
    const flightEase = flight * flight;
    const edge = ndcPoint(camera, 0.93, 0.9, camera.position.y * 0.72);
    if (!inRoom) {
      curve.v0.copy(stayCenter);
      curve.v1.set((stayCenter.x + edge.x) / 2 + 2, edge.y + 4, (stayCenter.z + edge.z) / 2);
      curve.v2.copy(edge);
      setTrail(flightEase);
      trailMaterial.opacity = flight > 0 ? 0.85 * (1 - smoothstep(segment(s4, timing.burst, timing.cut))) : 0;
      packet.position.copy(curve.getPoint(flightEase));
      packet.scale.setScalar(1 + flightEase * 0.8);
    }
    const yardFlight = flight > 0 && flight < 1 && !inRoom;
    // 2) Estoura ao bater na borda.
    edgeBurst.update(edge, segment(s4, timing.burst - 0.005, timing.cut + 0.02), 3.2);

    // 3) Sala do CCO: o dado entra pela borda e acerta a parede de vídeo.
    const roomIn = smoothstep(segment(s4, timing.cut, timing.cut + 0.05));
    const roomFlight = segment(s4, timing.cut + 0.015, timing.arrive);
    const arrived = s4 >= timing.arrive ? 1 : 0;
    const dolly = smoothstep(segment(s4, timing.cut, 1));
    roomCamera.position.set(ROOM_OFFSET.x, 6.4 - dolly * 0.6, ROOM_OFFSET.z + 17 - dolly * 2.5);
    roomCamera.lookAt(ROOM_OFFSET.x, 3.4, ROOM_OFFSET.z - 10);
    roomCamera.updateMatrixWorld();
    if (inRoom) {
      const entry = ndcPoint(roomCamera, 1.04, 0.95, 7);
      curve.v0.copy(entry);
      curve.v1.set((entry.x + roomTarget.x) / 2, entry.y + 1.5, (entry.z + roomTarget.z) / 2);
      curve.v2.copy(roomTarget);
      const roomEase = 1 - (1 - roomFlight) * (1 - roomFlight);
      setTrail(roomEase);
      trailMaterial.opacity = roomFlight > 0 ? 0.8 * (1 - smoothstep(segment(s4, timing.arrive, timing.arrive + 0.08))) : 0;
      packet.position.copy(curve.getPoint(roomEase));
      packet.scale.setScalar(1.4 - roomEase * 0.9);
    }
    const roomFlying = inRoom && roomFlight > 0 && roomFlight < 1;
    packetMaterial.opacity = yardFlight || roomFlying ? 1 : 0;
    packetCoreMaterial.opacity = yardFlight || roomFlying ? 0.9 : 0;
    wallBurst.update(roomTarget, segment(s4, timing.arrive, timing.arrive + 0.06), 1.6);

    const { lineMat, dimMat, monitorMat, litMaterial, litFrameMaterial } = room.materials;
    lineMat.opacity = 0.75 * roomIn;
    dimMat.opacity = 0.3 * roomIn;
    monitorMat.opacity = 0.7 * roomIn;
    const monitorGlow = arrived * (reducedMotion ? 0.6 : 0.5 + 0.5 * Math.sin(seconds * 4));
    monitorMat.color.setHex(COLORS.line).lerp(new THREE.Color(COLORS.lime), monitorGlow * 0.7);
    litMaterial.opacity = arrived * 0.32 * roomIn;
    litFrameMaterial.opacity = arrived * roomIn;
    const ringPhase = reducedMotion ? 0.5 : (seconds * 0.6) % 1;
    wallRing.scale.setScalar(0.8 + ringPhase * 3);
    wallRingMaterial.opacity = arrived * roomIn * (1 - ringPhase) * 0.7;

    renderer.render(scene, activeCamera);
  };

  const loop = (timestamp: number) => {
    frameId = 0;
    if (disposed) return;
    render(timestamp / 1000);
    if (active && !reducedMotion) frameId = requestAnimationFrame(loop);
  };
  const schedule = () => {
    if (!disposed && frameId === 0) frameId = requestAnimationFrame(loop);
  };

  return {
    resize(nextWidth, nextHeight, pixelRatio) {
      if (disposed || nextWidth <= 0 || nextHeight <= 0) return;
      width = nextWidth;
      height = nextHeight;
      renderer.setPixelRatio(Math.min(1.75, Math.max(1, pixelRatio)));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      // Enquadra o pátio inteiro (largura das docas e profundidade até o fim do caminhão).
      const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
      const fitWidth = 9.4 / (Math.tan(halfFov) * camera.aspect);
      const fitHeight = 12.4 / Math.tan(halfFov);
      const distance = Math.max(fitWidth, fitHeight);
      camera.position.set(0, distance, 3.4 + distance * 0.12);
      camera.lookAt(0, 0, 1.6);
      camera.updateProjectionMatrix();
      roomCamera.aspect = camera.aspect;
      roomCamera.updateProjectionMatrix();
      schedule();
    },
    setProgress(next) {
      progress = clamp01(next);
      schedule();
    },
    setActive(next) {
      active = next;
      if (active) schedule();
    },
    dispose() {
      disposed = true;
      if (frameId) cancelAnimationFrame(frameId);
      stayArc.geometry.dispose();
      disposables.forEach((item) => item.dispose());
      room.group.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments || object instanceof THREE.LineLoop) object.geometry.dispose();
      });
      truckGroup.traverse((object) => {
        if (object instanceof THREE.LineSegments) object.geometry.dispose();
      });
      renderer.dispose();
    },
  };
}
