import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HOME_TRUCK_WIREFRAME_URL } from './truckAsset';
import { brazilLonLatToMap, HOME_BRAZIL_TOPOGRAPHY_URL, HOME_CCO_LON_LAT } from './mapAssets';
import { clamp01, segment, smoothstep } from './timeline';

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

export const DOCK_STEPS = ['notify', 'arrive', 'talk', 'prove'] as const;
export type DockStep = (typeof DOCK_STEPS)[number];

/** Etapa ativa e progresso dentro dela, a partir do progresso da seção. */
export function dockStepAt(progress: number): { step: DockStep; index: number; local: number } {
  const scaled = clamp01(progress) * DOCK_STEPS.length;
  const index = Math.min(DOCK_STEPS.length - 1, Math.floor(scaled));
  return { step: DOCK_STEPS[index], index, local: clamp01(scaled - index) };
}

/**
 * Linha do tempo da etapa 4 (progresso local da etapa): o anel da estadia
 * chega a 100% e o comprovante sai como um pacote até o nó do CCO.
 */
export const DOCK_PROVE_TIMING = {
  ringEnd: 0.3,
  flightStart: 0.32,
  flightEnd: 0.5,
} as const;

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

/** Mesmo relevo do Brasil da hero (pontos + contorno), para o destino do comprovante. */
async function loadBrazil() {
  const gltf = await new GLTFLoader().loadAsync(HOME_BRAZIL_TOPOGRAPHY_URL);
  const pointsMaterial = new THREE.PointsMaterial({
    color: COLORS.lime,
    size: 0.05,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const outlineMaterial = lineMaterial(COLORS.lime, 0);
  const group = new THREE.Group();
  gltf.scene.traverse((object) => {
    const role = object.userData.role;
    if (role === 'brazil-topography-points' && object instanceof THREE.Points) {
      group.add(new THREE.Points(object.geometry, pointsMaterial));
    }
    if (role === 'brazil-topography-outline' && object instanceof THREE.LineSegments) {
      group.add(new THREE.LineSegments(object.geometry, outlineMaterial));
    }
  });
  return { group, pointsMaterial, outlineMaterial };
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

  // Mapa do Brasil da hero no canto do pátio; o CCO fica em Campinas/SP.
  const MAP_SCALE = 0.48;
  const mapOrigin = new THREE.Vector3(7.7, 0.05, 5.6);
  const brazil = await loadBrazil().catch(() => null);
  const brazilGroup = brazil?.group ?? new THREE.Group();
  brazilGroup.rotation.x = -Math.PI / 2; // norte para cima na tela
  brazilGroup.scale.setScalar(MAP_SCALE);
  brazilGroup.position.copy(mapOrigin);
  scene.add(brazilGroup);
  if (brazil) disposables.push(brazil.pointsMaterial, brazil.outlineMaterial);
  const [ccoMapX, ccoMapY] = brazilLonLatToMap(HOME_CCO_LON_LAT);

  // Nó do CCO e pacote do comprovante (etapa 4).
  const ccoPoint = new THREE.Vector3(
    mapOrigin.x + ccoMapX * MAP_SCALE,
    mapOrigin.y + 0.08,
    mapOrigin.z - ccoMapY * MAP_SCALE,
  );
  const ccoDotMaterial = track(new THREE.MeshBasicMaterial({ color: COLORS.lime, transparent: true, opacity: 0 }));
  const ccoDot = new THREE.Mesh(track(new THREE.CircleGeometry(0.2, 32)), ccoDotMaterial);
  ccoDot.rotation.x = -Math.PI / 2;
  ccoDot.position.copy(ccoPoint);
  scene.add(ccoDot);
  const ccoRings = Array.from({ length: 2 }, () => {
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
    mesh.position.copy(ccoPoint);
    scene.add(mesh);
    return { mesh, material };
  });
  const flightCurve = new THREE.QuadraticBezierCurve3(
    stayCenter.clone(),
    new THREE.Vector3((stayCenter.x + ccoPoint.x) / 2 + 1.5, 9, (stayCenter.z + ccoPoint.z) / 2 - 2),
    ccoPoint.clone().setY(0.6),
  );
  const flightPoints = flightCurve.getPoints(140);
  const flightGeometry = track(new THREE.BufferGeometry().setFromPoints(flightPoints));
  flightGeometry.setDrawRange(0, 0);
  const flightMaterial = track(new THREE.LineDashedMaterial({
    color: COLORS.lime,
    dashSize: 0.3,
    gapSize: 0.18,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  }));
  const flightLine = new THREE.Line(flightGeometry, flightMaterial);
  flightLine.computeLineDistances();
  scene.add(flightLine);
  const packetMaterial = track(new THREE.MeshBasicMaterial({ color: COLORS.lime, transparent: true, opacity: 0, wireframe: true }));
  const packet = new THREE.Mesh(track(new THREE.BoxGeometry(0.7, 0.7, 0.7)), packetMaterial);
  scene.add(packet);
  const packetCoreMaterial = track(new THREE.MeshBasicMaterial({ color: COLORS.lime, transparent: true, opacity: 0 }));
  const packetCore = new THREE.Mesh(track(new THREE.BoxGeometry(0.34, 0.34, 0.34)), packetCoreMaterial);
  packet.add(packetCore);
  const projected = new THREE.Vector3();

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

    // Pacote voando do caminhão ao CCO; o nó pulsa ao receber.
    const ccoIn = smoothstep(segment(s4, 0.12, DOCK_PROVE_TIMING.flightStart));
    const flight = segment(s4, DOCK_PROVE_TIMING.flightStart, DOCK_PROVE_TIMING.flightEnd);
    const flightEase = flight * flight * (3 - 2 * flight);
    const delivered = s4 >= DOCK_PROVE_TIMING.flightEnd ? 1 : 0;
    ccoDotMaterial.opacity = ccoIn * (0.45 + 0.55 * delivered);
    if (brazil) {
      brazil.pointsMaterial.opacity = ccoIn * (0.55 + 0.4 * delivered);
      brazil.outlineMaterial.opacity = ccoIn * (0.6 + 0.35 * delivered);
    }
    flightMaterial.opacity = 0.85 * ccoIn * (1 - 0.6 * delivered);
    flightGeometry.setDrawRange(0, Math.round(flightPoints.length * flightEase));
    const inFlight = flight > 0 && flight < 1;
    packetMaterial.opacity = inFlight ? 1 : 0;
    packetCoreMaterial.opacity = inFlight ? 0.9 : 0;
    packet.position.copy(flightCurve.getPoint(flightEase));
    packet.rotation.set(seconds * 1.6, seconds * 2.1, 0);
    ccoRings.forEach(({ mesh, material }, ringIndex) => {
      const phase = reducedMotion ? 0.5 : (seconds * 0.8 + ringIndex / ccoRings.length) % 1;
      mesh.scale.setScalar(0.25 + phase * 1.1);
      material.opacity = delivered * ccoIn * (1 - phase) * 0.85;
    });
    projected.copy(ccoPoint).project(camera);
    const holder = canvas.parentElement;
    if (holder) {
      holder.style.setProperty('--cco-x', `${((projected.x + 1) / 2) * 100}%`);
      holder.style.setProperty('--cco-y', `${((1 - projected.y) / 2) * 100}%`);
    }

    renderer.render(scene, camera);
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
      brazilGroup.traverse((object) => {
        if (object instanceof THREE.Points || object instanceof THREE.LineSegments) object.geometry.dispose();
      });
      truckGroup.traverse((object) => {
        if (object instanceof THREE.LineSegments) object.geometry.dispose();
      });
      renderer.dispose();
    },
  };
}
