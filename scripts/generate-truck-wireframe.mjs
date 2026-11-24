import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const sourcePath = fileURLToPath(
  new URL('../docs/RODAR-telas/landing-page/3d-model/truck.obj', import.meta.url),
);
const outputPath = fileURLToPath(
  new URL('../src/features/home/assets/rodar-truck-wireframe.glb', import.meta.url),
);

const MODEL_CENTERS_X = [-18.87, -12.2, -6.03, 1, 6.48, 13.2, 19.9, 26.77];
const MODEL_INDEX = 5;
const TARGET_LENGTH = 14;
const BODY_EDGE_ANGLE = 24;
const EXHAUST_EDGE_ANGLE = 18;
const TIRE_EDGE_ANGLE = 3;
const RIM_EDGE_ANGLE = 6;
const POSITION_PRECISION = 5;
const TIRE_MESH_NAMES = new Set(['Cylinder.059', 'Cylinder.063', 'Cylinder.106']);
const RIM_MESH_NAMES = new Set(['Cylinder.058', 'Cylinder.062', 'Cylinder.103']);
const WHEEL_MESH_NAMES = new Set([...TIRE_MESH_NAMES, ...RIM_MESH_NAMES]);
const EXHAUST_MESH_NAMES = new Set(['Cylinder.052', 'Cylinder.053']);
const TIRE_TO_RIM = new Map([
  ['Cylinder.059', 'Cylinder.058'],
  ['Cylinder.063', 'Cylinder.062'],
  ['Cylinder.106', 'Cylinder.103'],
]);
const AXLE_NAMES = ['front', 'tractor-a', 'tractor-b', 'trailer-a', 'trailer-b'];

class NodeFileReader {
  result = null;
  onloadend = null;

  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = buffer;
      this.onloadend?.();
    });
  }

  readAsDataURL(blob) {
    blob.arrayBuffer().then((buffer) => {
      const mediaType = blob.type || 'application/octet-stream';
      this.result = `data:${mediaType};base64,${Buffer.from(buffer).toString('base64')}`;
      this.onloadend?.();
    });
  }
}

if (!globalThis.FileReader) globalThis.FileReader = NodeFileReader;
if (!globalThis.ProgressEvent) {
  globalThis.ProgressEvent = class ProgressEvent {
    constructor(type, init = {}) {
      this.type = type;
      Object.assign(this, init);
    }
  };
}

function nearestModelIndex(x) {
  let index = 0;
  let distance = Number.POSITIVE_INFINITY;

  MODEL_CENTERS_X.forEach((center, candidate) => {
    const nextDistance = Math.abs(x - center);
    if (nextDistance < distance) {
      distance = nextDistance;
      index = candidate;
    }
  });

  return index;
}

function worldBounds(object) {
  object.geometry.computeBoundingBox();
  return object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld);
}

function createUnionFind(size) {
  const parent = Int32Array.from({ length: size }, (_, index) => index);
  const rank = new Uint8Array(size);

  const find = (value) => {
    let root = value;
    while (parent[root] !== root) root = parent[root];
    while (parent[value] !== value) {
      const next = parent[value];
      parent[value] = root;
      value = next;
    }
    return root;
  };

  const union = (first, second) => {
    let firstRoot = find(first);
    let secondRoot = find(second);
    if (firstRoot === secondRoot) return;
    if (rank[firstRoot] < rank[secondRoot]) [firstRoot, secondRoot] = [secondRoot, firstRoot];
    parent[secondRoot] = firstRoot;
    if (rank[firstRoot] === rank[secondRoot]) rank[firstRoot] += 1;
  };

  return { find, union };
}

function splitConnectedComponents(object) {
  const sourceGeometry = object.geometry.index
    ? object.geometry.toNonIndexed()
    : object.geometry.clone();
  sourceGeometry.applyMatrix4(object.matrixWorld);

  const positions = sourceGeometry.getAttribute('position');
  const triangleCount = positions.count / 3;
  const { find, union } = createUnionFind(triangleCount);
  const triangleByVertex = new Map();
  const point = new THREE.Vector3();

  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    for (let corner = 0; corner < 3; corner += 1) {
      point.fromBufferAttribute(positions, triangle * 3 + corner);
      const key = `${point.x.toFixed(POSITION_PRECISION)},${point.y.toFixed(
        POSITION_PRECISION,
      )},${point.z.toFixed(POSITION_PRECISION)}`;
      const connectedTriangle = triangleByVertex.get(key);
      if (connectedTriangle === undefined) triangleByVertex.set(key, triangle);
      else union(triangle, connectedTriangle);
    }
  }

  const trianglesByRoot = new Map();
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const root = find(triangle);
    const triangles = trianglesByRoot.get(root) ?? [];
    triangles.push(triangle);
    trianglesByRoot.set(root, triangles);
  }

  return [...trianglesByRoot.values()].map((triangles) => {
    const componentPositions = new Float32Array(triangles.length * 9);
    let offset = 0;

    triangles.forEach((triangle) => {
      for (let corner = 0; corner < 3; corner += 1) {
        point.fromBufferAttribute(positions, triangle * 3 + corner);
        componentPositions[offset] = point.x;
        componentPositions[offset + 1] = point.y;
        componentPositions[offset + 2] = point.z;
        offset += 3;
      }
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(componentPositions, 3));
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox.clone();

    return {
      bounds,
      center: bounds.getCenter(new THREE.Vector3()),
      geometry,
    };
  });
}

function normalizedPoint(point, modelBounds, modelCenter, scale) {
  return new THREE.Vector3(
    (point.z - modelCenter.z) * scale,
    (point.y - modelBounds.min.y) * scale,
    (point.x - modelCenter.x) * scale,
  );
}

function normalizedGeometry(geometry, modelBounds, modelCenter, scale, pivot = null) {
  const output = geometry.clone();
  const positions = output.getAttribute('position');
  const point = new THREE.Vector3();
  const normalizedPivot = pivot
    ? normalizedPoint(pivot, modelBounds, modelCenter, scale)
    : null;

  for (let index = 0; index < positions.count; index += 1) {
    point.fromBufferAttribute(positions, index);
    point.copy(normalizedPoint(point, modelBounds, modelCenter, scale));
    if (normalizedPivot) point.sub(normalizedPivot);
    positions.setXYZ(index, point.x, point.y, point.z);
  }

  positions.needsUpdate = true;
  output.deleteAttribute('normal');
  output.deleteAttribute('uv');
  output.computeBoundingBox();
  output.computeBoundingSphere();
  return output;
}

function appendPositions(target, geometry) {
  const positions = geometry.getAttribute('position');
  for (let index = 0; index < positions.count; index += 1) {
    target.push(positions.getX(index), positions.getY(index), positions.getZ(index));
  }
}

function componentDistanceSquared(first, second) {
  return first.center.distanceToSquared(second.center);
}

function createLineMaterial(name, color) {
  // GLTF stores line primitives with standard glTF materials. GLTFLoader converts
  // them back to LineBasicMaterial when the primitive mode is LINES.
  const material = new THREE.MeshBasicMaterial({ color });
  material.name = name;
  return material;
}

function buildTruckScene(source) {
  source.updateMatrixWorld(true);

  const selectedMeshes = [];
  source.traverse((object) => {
    if (!object.isMesh) return;
    const center = worldBounds(object).getCenter(new THREE.Vector3());
    if (nearestModelIndex(center.x) === MODEL_INDEX) selectedMeshes.push(object);
  });

  if (selectedMeshes.length !== 64) {
    throw new Error(`Expected 64 meshes in model 6, found ${selectedMeshes.length}.`);
  }

  const modelBounds = new THREE.Box3();
  selectedMeshes.forEach((object) => modelBounds.union(worldBounds(object)));
  const modelCenter = modelBounds.getCenter(new THREE.Vector3());
  const modelSize = modelBounds.getSize(new THREE.Vector3());
  const scale = TARGET_LENGTH / modelSize.z;
  const bodyPositions = [];
  const componentsByMesh = new Map();
  const exhaustMeshes = [];

  selectedMeshes.forEach((object) => {
    if (WHEEL_MESH_NAMES.has(object.name)) {
      componentsByMesh.set(object.name, splitConnectedComponents(object));
      return;
    }
    if (EXHAUST_MESH_NAMES.has(object.name)) {
      exhaustMeshes.push(object);
      return;
    }

    const sourceGeometry = object.geometry.clone();
    sourceGeometry.applyMatrix4(object.matrixWorld);
    const geometry = normalizedGeometry(sourceGeometry, modelBounds, modelCenter, scale);
    const edges = new THREE.EdgesGeometry(geometry, BODY_EDGE_ANGLE);
    appendPositions(bodyPositions, edges);
    edges.dispose();
    geometry.dispose();
    sourceGeometry.dispose();
  });

  const root = new THREE.Group();
  root.name = 'RODAR_Truck_Model_6';

  const bodyGeometry = new THREE.BufferGeometry();
  bodyGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(new Float32Array(bodyPositions), 3),
  );
  const body = new THREE.LineSegments(
    bodyGeometry,
    createLineMaterial('body-wireframe', 0xa2f200),
  );
  body.name = 'truck-body';
  root.add(body);

  exhaustMeshes
    .sort((first, second) => worldBounds(first).getCenter(new THREE.Vector3()).x
      - worldBounds(second).getCenter(new THREE.Vector3()).x)
    .forEach((object, index) => {
      const sourceGeometry = object.geometry.clone();
      sourceGeometry.applyMatrix4(object.matrixWorld);
      const geometry = normalizedGeometry(sourceGeometry, modelBounds, modelCenter, scale);
      const indexedGeometry = mergeVertices(geometry, 1e-5);
      const exhaustGeometry = new THREE.EdgesGeometry(
        indexedGeometry,
        EXHAUST_EDGE_ANGLE,
      );
      const exhaust = new THREE.LineSegments(
        exhaustGeometry,
        createLineMaterial(`exhaust-${index + 1}-wireframe`, 0xa2f200),
      );
      exhaust.name = `truck-exhaust-${index + 1}`;
      exhaust.userData = { role: 'exhaust' };
      root.add(exhaust);
      geometry.dispose();
      indexedGeometry.dispose();
      sourceGeometry.dispose();
    });

  if (exhaustMeshes.length !== 2) {
    throw new Error(`Expected 2 exhaust meshes, found ${exhaustMeshes.length}.`);
  }

  const tireComponents = [];
  TIRE_MESH_NAMES.forEach((meshName) => {
    const components = componentsByMesh.get(meshName);
    if (!components) throw new Error(`Missing tire mesh ${meshName}.`);
    components.forEach((component) => {
      tireComponents.push({ ...component, meshName, rims: [] });
    });
  });

  if (tireComponents.length !== 10) {
    throw new Error(`Expected 10 tire components, found ${tireComponents.length}.`);
  }

  TIRE_TO_RIM.forEach((rimMeshName, tireMeshName) => {
    const matchingTires = tireComponents.filter((component) => component.meshName === tireMeshName);
    const rimComponents = componentsByMesh.get(rimMeshName);
    if (!rimComponents) throw new Error(`Missing rim mesh ${rimMeshName}.`);

    rimComponents.forEach((rim) => {
      const nearestTire = matchingTires.reduce((nearest, tire) =>
        componentDistanceSquared(rim, tire) < componentDistanceSquared(rim, nearest)
          ? tire
          : nearest,
      );
      nearestTire.rims.push(rim);
    });
  });

  tireComponents.sort(
    (first, second) =>
      second.center.z - first.center.z || first.center.x - second.center.x,
  );

  tireComponents.forEach((tire, index) => {
    const axleIndex = Math.floor(index / 2);
    const side = index % 2 === 0 ? 'left' : 'right';
    const wheelName = `wheel-${AXLE_NAMES[axleIndex]}-${side}`;
    const pivot = normalizedPoint(tire.center, modelBounds, modelCenter, scale);
    const wheel = new THREE.Group();
    wheel.name = wheelName;
    wheel.position.copy(pivot);
    wheel.userData = {
      axle: 'z',
      radius: Number(((tire.bounds.max.y - tire.bounds.min.y) * scale * 0.5).toFixed(6)),
      role: 'wheel',
    };

    const tireGeometry = normalizedGeometry(
      tire.geometry,
      modelBounds,
      modelCenter,
      scale,
      tire.center,
    );
    const indexedTireGeometry = mergeVertices(tireGeometry, 1e-5);
    const tireWireframe = new THREE.EdgesGeometry(indexedTireGeometry, TIRE_EDGE_ANGLE);
    const tireLines = new THREE.LineSegments(
      tireWireframe,
      createLineMaterial(`${wheelName}-tire-material`, 0xf6f8f6),
    );
    tireLines.name = `${wheelName}-tire`;
    wheel.add(tireLines);
    tireGeometry.dispose();
    indexedTireGeometry.dispose();

    tire.rims
      .sort((first, second) => first.center.x - second.center.x)
      .forEach((rim, rimIndex) => {
        const rimGeometry = normalizedGeometry(
          rim.geometry,
          modelBounds,
          modelCenter,
          scale,
          tire.center,
        );
        const indexedRimGeometry = mergeVertices(rimGeometry, 1e-5);
        const rimWireframe = new THREE.EdgesGeometry(indexedRimGeometry, RIM_EDGE_ANGLE);
        const rimLines = new THREE.LineSegments(
          rimWireframe,
          createLineMaterial(`${wheelName}-rim-material`, 0xa2f200),
        );
        rimLines.name = `${wheelName}-rim-${rimIndex + 1}`;
        wheel.add(rimLines);
        rimGeometry.dispose();
        indexedRimGeometry.dispose();
      });

    if (wheel.children.length !== 3) {
      throw new Error(`${wheelName} must contain one tire and two rim components.`);
    }

    root.add(wheel);
  });

  return root;
}

async function exportBinary(scene) {
  const exporter = new GLTFExporter();
  return exporter.parseAsync(scene, {
    binary: true,
    onlyVisible: true,
    truncateDrawRange: true,
  });
}

async function validateBinary(binary) {
  const loaded = await new GLTFLoader().parseAsync(binary, `${projectRoot}/`);
  loaded.scene.updateMatrixWorld(true);
  const truck = loaded.scene.getObjectByName('RODAR_Truck_Model_6');
  if (!truck) throw new Error('Exported GLB does not contain the truck root.');

  const wheels = truck.children.filter((child) => child.name.startsWith('wheel-'));
  if (wheels.length !== 10) {
    throw new Error(`Exported GLB contains ${wheels.length} wheels instead of 10.`);
  }

  wheels.forEach((wheel) => {
    if (wheel.children.length !== 3) {
      throw new Error(`${wheel.name} lost its tire/rim hierarchy after export.`);
    }
  });

  const exhausts = truck.children.filter((child) => child.userData.role === 'exhaust');
  if (exhausts.length !== 2) {
    throw new Error(`Exported GLB contains ${exhausts.length} exhausts instead of 2.`);
  }

  const bounds = new THREE.Box3().setFromObject(truck);
  const size = bounds.getSize(new THREE.Vector3());

  return {
    bytes: binary.byteLength,
    dimensions: size.toArray().map((value) => Number(value.toFixed(4))),
    exhausts: exhausts.map((exhaust) => exhaust.name),
    wheels: wheels.map((wheel) => ({
      name: wheel.name,
      pivot: wheel.position.toArray().map((value) => Number(value.toFixed(4))),
      radius: wheel.userData.radius,
      children: wheel.children.map((child) => child.name),
    })),
  };
}

const source = new OBJLoader().parse(readFileSync(sourcePath, 'utf8'));
const truck = buildTruckScene(source);
const binary = await exportBinary(truck);
const validation = await validateBinary(binary);

mkdirSync(fileURLToPath(new URL('../src/features/home/assets/', import.meta.url)), {
  recursive: true,
});
writeFileSync(outputPath, Buffer.from(binary));
console.log(JSON.stringify({ outputPath, ...validation }, null, 2));
