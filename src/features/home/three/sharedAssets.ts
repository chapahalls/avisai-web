import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HOME_BRAZIL_TOPOGRAPHY_URL, HOME_WORLD_WIREFRAME_URL } from './mapAssets';

/** Modelos e projeções compartilhados entre a hero 3D e o globo do login. */

export type LonLat = readonly [longitude: number, latitude: number];

/** Giro do globo que alinha o GLB do mundo com `lonLatToSphere`. */
export const WORLD_ROTATION_OFFSET = -1.25;

export type BrazilTopographyAsset = {
  points: Float32Array;
  outline: Float32Array;
  contours: Float32Array;
};

export type WorldWireframeAsset = {
  shell: THREE.BufferGeometry;
  wireframe: Float32Array;
  points: Float32Array;
  coastline: Float32Array;
};

export type GeometryObject = THREE.Object3D & {
  geometry?: THREE.BufferGeometry;
  material?: THREE.Material | THREE.Material[];
};

export function findGeometryByRole(root: THREE.Object3D, role: string) {
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

export function copyWorldPositions(object: GeometryObject) {
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

export function cloneWorldGeometry(object: GeometryObject) {
  if (!object.geometry) {
    throw new Error(`Objeto sem geometria: ${object.name || object.type}`);
  }
  object.updateWorldMatrix(true, false);
  const geometry = object.geometry.clone();
  geometry.applyMatrix4(object.matrixWorld);
  return geometry;
}

export function disposeDetachedAsset(root: THREE.Object3D) {
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

export async function loadBrazilTopographyAsset(): Promise<BrazilTopographyAsset> {
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

export async function loadWorldWireframeAsset(): Promise<WorldWireframeAsset> {
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

export function lonLatToSphere([longitude, latitude]: LonLat, radius: number) {
  const lat = THREE.MathUtils.degToRad(latitude);
  const lon = THREE.MathUtils.degToRad(longitude + 55);
  const horizontal = Math.cos(lat) * radius;
  return new THREE.Vector3(
    Math.sin(lon) * horizontal,
    Math.sin(lat) * radius,
    Math.cos(lon) * horizontal,
  );
}

export function projectPositionsToRadius(
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

export const BRAZIL_CITIES = {
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

// Hub-and-spoke from São Paulo (same hub as the globe routes), each leg
// passing through real cities along the main federal highways.
export const BRAZIL_ROUTES: readonly (readonly LonLat[])[] = [
  [BRAZIL_CITIES.saoPaulo, BRAZIL_CITIES.campoGrande, BRAZIL_CITIES.cuiaba, BRAZIL_CITIES.portoVelho, BRAZIL_CITIES.manaus],
  [BRAZIL_CITIES.saoPaulo, BRAZIL_CITIES.brasilia, BRAZIL_CITIES.palmas, BRAZIL_CITIES.belem],
  [BRAZIL_CITIES.saoPaulo, BRAZIL_CITIES.beloHorizonte, BRAZIL_CITIES.salvador, BRAZIL_CITIES.recife],
  [BRAZIL_CITIES.salvador, BRAZIL_CITIES.fortaleza],
  [BRAZIL_CITIES.saoPaulo, BRAZIL_CITIES.curitiba, BRAZIL_CITIES.portoAlegre],
];
