import * as THREE from 'three';
import { brazilMapToLonLat } from './mapAssets';
import {
  BRAZIL_CITIES,
  BRAZIL_ROUTES,
  type LonLat,
  loadBrazilTopographyAsset,
  loadWorldWireframeAsset,
  lonLatToSphere,
  projectPositionsToRadius,
} from './sharedAssets';

/**
 * Globo do login: o mesmo mundo e o mesmo relevo do Brasil da hero, com a malha
 * de rotas rodoviárias desenhada sobre o país e caminhões percorrendo os trechos.
 */

const COLORS = {
  night: 0x050806,
  lime: 0xa2f200,
  limeDark: 0x426e0c,
  line: 0xd6ddd6,
};
const RADIUS = 4.8;
/** Centro aproximado do Brasil: fica de frente para a câmera. */
const BRAZIL_FOCUS: LonLat = [-50, -15];
const TRUCKS_PER_ROUTE = 2;

export type LoginGlobeController = {
  resize: (width: number, height: number, pixelRatio: number) => void;
  setActive: (active: boolean) => void;
  dispose: () => void;
};

/** Estatísticas da malha exibida, para a legenda da tela. */
export const LOGIN_ROUTE_STATS = {
  corridors: BRAZIL_ROUTES.length,
  cities: new Set(BRAZIL_ROUTES.flat().map((city) => city.join(','))).size,
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

/** Trecho rodoviário sobre a esfera: interpola lon/lat e levanta um pouco o meio. */
function routeOnSphere(cities: readonly LonLat[], samplesPerLeg = 40) {
  const points: THREE.Vector3[] = [];
  for (let leg = 0; leg < cities.length - 1; leg += 1) {
    const [lonA, latA] = cities[leg];
    const [lonB, latB] = cities[leg + 1];
    for (let step = leg === 0 ? 0 : 1; step <= samplesPerLeg; step += 1) {
      const t = step / samplesPerLeg;
      const lift = Math.sin(Math.PI * t) * 0.06;
      points.push(lonLatToSphere(
        [THREE.MathUtils.lerp(lonA, lonB, t), THREE.MathUtils.lerp(latA, latB, t)],
        RADIUS + 0.09 + lift,
      ));
    }
  }
  return points;
}

export async function createLoginGlobe(
  canvas: HTMLCanvasElement,
  { reducedMotion = false } = {},
): Promise<LoginGlobeController> {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(COLORS.night, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(0, 0, 17.5);
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(item: T) => {
    disposables.push(item);
    return item;
  };

  // `outer` orienta o Brasil para a câmera; `inner` usa o mesmo referencial do GLB.
  const outer = new THREE.Group();
  const inner = new THREE.Group();
  outer.add(inner);
  scene.add(outer);

  const [world, brazil] = await Promise.all([
    loadWorldWireframeAsset().catch(() => null),
    loadBrazilTopographyAsset().catch(() => null),
  ]);

  // Esfera opaca para esconder o lado de trás das linhas.
  const occluder = new THREE.Mesh(
    track(world ? world.shell.clone().scale(1.01, 1.01, 1.01) : new THREE.SphereGeometry(RADIUS - 0.01, 64, 40)),
    track(new THREE.MeshBasicMaterial({ color: COLORS.night })),
  );
  inner.add(occluder);
  if (world) {
    world.shell.dispose();
    const wire = new THREE.BufferGeometry();
    wire.setAttribute('position', new THREE.Float32BufferAttribute(projectPositionsToRadius(world.wireframe, RADIUS + 0.035), 3));
    inner.add(new THREE.LineSegments(track(wire), track(lineMaterial(COLORS.lime, 0.08))));
    const coast = new THREE.BufferGeometry();
    coast.setAttribute('position', new THREE.Float32BufferAttribute(projectPositionsToRadius(world.coastline, RADIUS + 0.06), 3));
    inner.add(new THREE.LineSegments(track(coast), track(lineMaterial(COLORS.line, 0.32))));
    const dots = new THREE.BufferGeometry();
    dots.setAttribute('position', new THREE.Float32BufferAttribute(projectPositionsToRadius(world.points, RADIUS + 0.07), 3));
    inner.add(new THREE.Points(track(dots), track(new THREE.PointsMaterial({
      color: COLORS.line,
      size: 0.045,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    }))));
  }

  // Brasil em destaque: relevo e contorno da hero projetados na esfera.
  if (brazil) {
    const toSphere = (values: Float32Array, lift: number) => {
      const projected = new Float32Array(values.length);
      for (let offset = 0; offset < values.length; offset += 3) {
        lonLatToSphere(brazilMapToLonLat(values[offset], values[offset + 1]), RADIUS + lift)
          .toArray(projected, offset);
      }
      return projected;
    };
    const points = new THREE.BufferGeometry();
    points.setAttribute('position', new THREE.Float32BufferAttribute(toSphere(brazil.points, 0.08), 3));
    inner.add(new THREE.Points(track(points), track(new THREE.PointsMaterial({
      color: COLORS.lime,
      size: 0.045,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }))));
    const outline = new THREE.BufferGeometry();
    outline.setAttribute('position', new THREE.Float32BufferAttribute(toSphere(brazil.outline, 0.085), 3));
    inner.add(new THREE.LineSegments(track(outline), track(lineMaterial(COLORS.lime, 0.9))));
  }

  // Rotas rodoviárias: desenho progressivo em sequência e caminhões andando.
  const routeMaterial = track(new THREE.LineBasicMaterial({ color: COLORS.lime, toneMapped: false }));
  const routes = BRAZIL_ROUTES.map((cities, index) => {
    const points = routeOnSphere(cities);
    const geometry = track(new THREE.BufferGeometry().setFromPoints(points));
    geometry.setDrawRange(0, reducedMotion ? points.length : 0);
    inner.add(new THREE.Line(geometry, routeMaterial));
    return { points, geometry, delay: index * 0.55 };
  });
  const truckGeometry = track(new THREE.SphereGeometry(0.05, 12, 8));
  const truckMaterial = track(new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const trucks = routes.flatMap((route, routeIndex) =>
    Array.from({ length: TRUCKS_PER_ROUTE }, (_, truckIndex) => {
      const mesh = new THREE.Mesh(truckGeometry, truckMaterial);
      mesh.visible = false;
      inner.add(mesh);
      return { mesh, route, phase: (truckIndex / TRUCKS_PER_ROUTE + routeIndex * 0.17) % 1 };
    }));

  // Cidades da malha e o CCO (São Paulo) pulsando.
  const cityMaterial = track(new THREE.MeshBasicMaterial({ color: COLORS.lime, side: THREE.DoubleSide }));
  const cityGeometry = track(new THREE.CircleGeometry(0.045, 16));
  const facing = new THREE.Vector3();
  new Set(BRAZIL_ROUTES.flat()).forEach((city) => {
    const position = lonLatToSphere(city, RADIUS + 0.1);
    const mesh = new THREE.Mesh(cityGeometry, cityMaterial);
    mesh.position.copy(position);
    mesh.lookAt(facing.copy(position).multiplyScalar(2));
    if (city === BRAZIL_CITIES.saoPaulo) mesh.scale.setScalar(1.8);
    inner.add(mesh);
  });
  const hubPosition = lonLatToSphere(BRAZIL_CITIES.saoPaulo, RADIUS + 0.11);
  const hubRings = Array.from({ length: 2 }, () => {
    const material = track(new THREE.MeshBasicMaterial({
      color: COLORS.lime,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    const mesh = new THREE.Mesh(track(new THREE.RingGeometry(0.16, 0.19, 40)), material);
    mesh.position.copy(hubPosition);
    mesh.lookAt(facing.copy(hubPosition).multiplyScalar(2));
    inner.add(mesh);
    return { mesh, material };
  });

  // Orientação: Brasil de frente, norte para cima, levemente inclinado.
  const focus = lonLatToSphere(BRAZIL_FOCUS, 1).normalize();
  const baseYaw = -Math.atan2(focus.x, focus.z);
  const basePitch = Math.asin(focus.y);
  const yawQuaternion = new THREE.Quaternion();
  const pitchQuaternion = new THREE.Quaternion();
  const tiltQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -0.18);
  const yAxis = new THREE.Vector3(0, 1, 0);
  const xAxis = new THREE.Vector3(1, 0, 0);

  let active = true;
  let disposed = false;
  let frameId = 0;
  let start = -1;

  const render = (timestamp: number) => {
    if (start < 0) start = timestamp;
    const seconds = reducedMotion ? 6 : (timestamp - start) / 1000;
    const sway = reducedMotion ? 0 : Math.sin(seconds * 0.12) * 0.32;
    yawQuaternion.setFromAxisAngle(yAxis, baseYaw + sway);
    pitchQuaternion.setFromAxisAngle(xAxis, basePitch + 0.08);
    outer.quaternion.copy(tiltQuaternion).multiply(pitchQuaternion).multiply(yawQuaternion);
    // Entrada: o globo cresce ao carregar.
    outer.scale.setScalar(reducedMotion ? 1 : 0.86 + 0.14 * Math.min(1, seconds / 1.6) ** 0.5);

    routes.forEach((route) => {
      if (reducedMotion) return;
      const drawn = THREE.MathUtils.clamp((seconds - 0.6 - route.delay) / 1.8, 0, 1);
      route.geometry.setDrawRange(0, Math.round(route.points.length * (1 - (1 - drawn) ** 3)));
    });
    trucks.forEach(({ mesh, route, phase }) => {
      const ready = reducedMotion || seconds > 0.6 + route.delay + 1.8;
      mesh.visible = ready;
      if (!ready) return;
      const along = (phase + seconds * 0.045) % 1;
      const position = along * (route.points.length - 1);
      const index = Math.floor(position);
      mesh.position.lerpVectors(
        route.points[index],
        route.points[Math.min(route.points.length - 1, index + 1)],
        position - index,
      );
    });
    hubRings.forEach(({ mesh, material }, ringIndex) => {
      const ring = reducedMotion ? 0.5 : (seconds * 0.5 + ringIndex / hubRings.length) % 1;
      mesh.scale.setScalar(1 + ring * 4);
      material.opacity = (1 - ring) * 0.8;
    });

    renderer.render(scene, camera);
  };

  const loop = (timestamp: number) => {
    frameId = 0;
    if (disposed) return;
    render(timestamp);
    if (active && !reducedMotion) frameId = requestAnimationFrame(loop);
  };
  const schedule = () => {
    if (!disposed && frameId === 0) frameId = requestAnimationFrame(loop);
  };
  schedule();

  return {
    resize(width, height, pixelRatio) {
      if (disposed || width <= 0 || height <= 0) return;
      renderer.setPixelRatio(Math.min(1.75, Math.max(1, pixelRatio)));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      // Mantém o globo inteiro visível em telas estreitas.
      const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
      const fit = (RADIUS * 1.32) / Math.tan(halfFov);
      camera.position.z = Math.max(fit, fit / Math.min(1, camera.aspect));
      camera.updateProjectionMatrix();
      schedule();
    },
    setActive(next) {
      active = next;
      if (active) schedule();
    },
    dispose() {
      disposed = true;
      if (frameId) cancelAnimationFrame(frameId);
      disposables.forEach((item) => item.dispose());
      renderer.dispose();
    },
  };
}
