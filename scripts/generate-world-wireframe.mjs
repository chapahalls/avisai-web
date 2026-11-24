import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const sourcePath = fileURLToPath(
  new URL(
    '../docs/RODAR-telas/landing-page/3d-model/world-source/Obj/earth.obj',
    import.meta.url,
  ),
);
const texturePath = fileURLToPath(
  new URL(
    '../docs/RODAR-telas/landing-page/3d-model/world-source/Texture/2k_earth_daymap.jpg',
    import.meta.url,
  ),
);
const outputDirectory = fileURLToPath(
  new URL('../src/features/home/assets/', import.meta.url),
);
const outputPath = fileURLToPath(
  new URL('../src/features/home/assets/rodar-world-wireframe.glb', import.meta.url),
);

const TARGET_RADIUS = 4.8;
const SHELL_RADIUS_FACTOR = 0.985;
const EDGE_ANGLE_DEGREES = 1;
const MERGE_TOLERANCE = 1e-5;
const MAX_OUTPUT_BYTES = 300 * 1024;
const MASK_WIDTH = 360;
const MASK_HEIGHT = 180;
const COAST_WIDTH = 180;
const COAST_HEIGHT = 90;
const LAND_RADIUS = TARGET_RADIUS;
const DOT_LATITUDE_STEP = 2.55;
const OCEAN_RGB = [30, 59, 117];
const OCEAN_DISTANCE_THRESHOLD = 26;

const ROOT_NAME = 'RODAR_World_Model';
const SHELL_NAME = 'RODAR_World_Shell';
const WIREFRAME_NAME = 'RODAR_World_Wireframe';
const POINTS_NAME = 'RODAR_World_Points';
const COASTLINE_NAME = 'RODAR_World_Coastline';

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

function collectWorldPositions(source) {
  source.updateMatrixWorld(true);
  const positions = [];
  let meshCount = 0;

  source.traverse((object) => {
    if (!object.isMesh) return;
    meshCount += 1;

    const geometry = object.geometry.index
      ? object.geometry.toNonIndexed()
      : object.geometry.clone();
    geometry.applyMatrix4(object.matrixWorld);
    const attribute = geometry.getAttribute('position');

    for (let index = 0; index < attribute.count; index += 1) {
      positions.push(
        attribute.getX(index),
        attribute.getY(index),
        attribute.getZ(index),
      );
    }

    geometry.dispose();
  });

  if (meshCount === 0 || positions.length === 0) {
    throw new Error('The source OBJ does not contain mesh positions.');
  }

  return { meshCount, positions };
}

function buildNormalizedGeometry(positions) {
  const rawGeometry = new THREE.BufferGeometry();
  rawGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(new Float32Array(positions), 3),
  );

  const geometry = mergeVertices(rawGeometry, MERGE_TOLERANCE);
  rawGeometry.dispose();
  geometry.computeBoundingSphere();

  const sourceCenter = geometry.boundingSphere.center.clone();
  const sourceRadius = geometry.boundingSphere.radius;
  if (!Number.isFinite(sourceRadius) || sourceRadius <= 0) {
    throw new Error(`Invalid source radius: ${sourceRadius}.`);
  }

  const scale = TARGET_RADIUS / sourceRadius;
  const attribute = geometry.getAttribute('position');
  const point = new THREE.Vector3();

  for (let index = 0; index < attribute.count; index += 1) {
    point.fromBufferAttribute(attribute, index);
    point.sub(sourceCenter).multiplyScalar(scale);
    attribute.setXYZ(index, point.x, point.y, point.z);
  }

  attribute.needsUpdate = true;
  geometry.deleteAttribute('normal');
  geometry.deleteAttribute('uv');
  geometry.deleteAttribute('color');
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return {
    geometry,
    sourceCenter,
    sourceRadius,
    scale,
  };
}

function createLineMaterial(name, color) {
  const material = new THREE.MeshBasicMaterial({ color });
  material.name = name;
  return material;
}

function decodeLandMask() {
  const result = spawnSync(
    'convert',
    [
      texturePath,
      '-resize',
      `${MASK_WIDTH}x${MASK_HEIGHT}!`,
      '-colorspace',
      'sRGB',
      '-depth',
      '8',
      'rgb:-',
    ],
    {
      encoding: null,
      maxBuffer: MASK_WIDTH * MASK_HEIGHT * 4,
    },
  );
  if (result.error) {
    throw new Error(
      `ImageMagick is required to derive the offline world mask: ${result.error.message}`,
    );
  }
  if (result.status !== 0) {
    throw new Error(
      `ImageMagick failed to decode the world texture: ${String(result.stderr).trim()}`,
    );
  }
  const pixels = new Uint8Array(
    result.stdout.buffer,
    result.stdout.byteOffset,
    result.stdout.byteLength,
  );
  const expectedBytes = MASK_WIDTH * MASK_HEIGHT * 3;
  if (pixels.byteLength !== expectedBytes) {
    throw new Error(
      `Decoded texture has ${pixels.byteLength} bytes; expected ${expectedBytes}.`,
    );
  }
  return pixels;
}

function isLandPixel(pixels, x, y) {
  const wrappedX = ((x % MASK_WIDTH) + MASK_WIDTH) % MASK_WIDTH;
  const clampedY = Math.max(0, Math.min(MASK_HEIGHT - 1, y));
  const offset = (clampedY * MASK_WIDTH + wrappedX) * 3;
  const redDelta = pixels[offset] - OCEAN_RGB[0];
  const greenDelta = pixels[offset + 1] - OCEAN_RGB[1];
  const blueDelta = pixels[offset + 2] - OCEAN_RGB[2];
  return Math.hypot(redDelta, greenDelta, blueDelta)
    > OCEAN_DISTANCE_THRESHOLD;
}

function lonLatToSphere(longitude, latitude, radius) {
  const lat = THREE.MathUtils.degToRad(latitude);
  const lon = THREE.MathUtils.degToRad(longitude + 55);
  const horizontal = Math.cos(lat) * radius;
  return new THREE.Vector3(
    Math.sin(lon) * horizontal,
    Math.sin(lat) * radius,
    Math.cos(lon) * horizontal,
  );
}

function texturePoint(pixels, longitude, latitude) {
  const x = Math.max(
    0,
    Math.min(
      MASK_WIDTH - 1,
      Math.round(((longitude + 180) / 360) * (MASK_WIDTH - 1)),
    ),
  );
  const y = Math.max(
    0,
    Math.min(
      MASK_HEIGHT - 1,
      Math.round(((90 - latitude) / 180) * (MASK_HEIGHT - 1)),
    ),
  );
  return isLandPixel(pixels, x, y);
}

function buildLandPointPositions(pixels) {
  const positions = [];
  let row = 0;
  for (
    let latitude = -84;
    latitude <= 84;
    latitude += DOT_LATITUDE_STEP, row += 1
  ) {
    const longitudeStep = DOT_LATITUDE_STEP / Math.max(
      Math.cos(THREE.MathUtils.degToRad(latitude)),
      0.42,
    );
    const offset = row % 2 ? longitudeStep / 2 : 0;
    for (
      let longitude = -180 + offset;
      longitude < 180;
      longitude += longitudeStep
    ) {
      if (!texturePoint(pixels, longitude, latitude)) continue;
      positions.push(
        ...lonLatToSphere(longitude, latitude, LAND_RADIUS).toArray(),
      );
    }
  }
  return new Float32Array(positions);
}

function buildCoastMask(pixels) {
  const scaleX = MASK_WIDTH / COAST_WIDTH;
  const scaleY = MASK_HEIGHT / COAST_HEIGHT;
  const mask = new Uint8Array(COAST_WIDTH * COAST_HEIGHT);
  for (let y = 0; y < COAST_HEIGHT; y += 1) {
    for (let x = 0; x < COAST_WIDTH; x += 1) {
      let landVotes = 0;
      let votes = 0;
      for (let sampleY = 0; sampleY < scaleY; sampleY += 1) {
        for (let sampleX = 0; sampleX < scaleX; sampleX += 1) {
          landVotes += Number(isLandPixel(
            pixels,
            Math.floor(x * scaleX + sampleX),
            Math.floor(y * scaleY + sampleY),
          ));
          votes += 1;
        }
      }
      mask[y * COAST_WIDTH + x] = landVotes >= Math.ceil(votes / 2) ? 1 : 0;
    }
  }

  const smoothed = new Uint8Array(mask.length);
  for (let y = 0; y < COAST_HEIGHT; y += 1) {
    for (let x = 0; x < COAST_WIDTH; x += 1) {
      let neighbors = 0;
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          const candidateY = y + offsetY;
          if (candidateY < 0 || candidateY >= COAST_HEIGHT) continue;
          const candidateX = (x + offsetX + COAST_WIDTH) % COAST_WIDTH;
          neighbors += mask[candidateY * COAST_WIDTH + candidateX];
        }
      }
      const index = y * COAST_WIDTH + x;
      smoothed[index] = mask[index]
        ? Number(neighbors >= 3)
        : Number(neighbors >= 6);
    }
  }
  return smoothed;
}

function buildCoastlinePositions(pixels) {
  const mask = buildCoastMask(pixels);
  const positions = [];
  const isLand = (x, y) => {
    if (y < 0 || y >= COAST_HEIGHT) return false;
    return Boolean(mask[y * COAST_WIDTH + ((x + COAST_WIDTH) % COAST_WIDTH)]);
  };
  const pushSegment = (firstLon, firstLat, secondLon, secondLat) => {
    positions.push(
      ...lonLatToSphere(firstLon, firstLat, LAND_RADIUS).toArray(),
      ...lonLatToSphere(secondLon, secondLat, LAND_RADIUS).toArray(),
    );
  };

  for (let y = 0; y < COAST_HEIGHT; y += 1) {
    const north = 90 - (y / COAST_HEIGHT) * 180;
    const south = 90 - ((y + 1) / COAST_HEIGHT) * 180;
    for (let x = 0; x < COAST_WIDTH; x += 1) {
      const land = isLand(x, y);
      const west = -180 + (x / COAST_WIDTH) * 360;
      const east = -180 + ((x + 1) / COAST_WIDTH) * 360;
      if (land !== isLand(x + 1, y)) {
        pushSegment(east, north, east, south);
      }
      if (land !== isLand(x, y + 1)) {
        pushSegment(west, south, east, south);
      }
      if (y === 0 && land) {
        pushSegment(west, north, east, north);
      }
    }
  }
  return new Float32Array(positions);
}

function buildWorldScene(source, pixels) {
  const { meshCount, positions } = collectWorldPositions(source);
  const normalized = buildNormalizedGeometry(positions);
  const { geometry } = normalized;
  const triangleCount = geometry.index
    ? geometry.index.count / 3
    : geometry.getAttribute('position').count / 3;

  const root = new THREE.Group();
  root.name = ROOT_NAME;
  root.userData = {
    role: 'world-root',
    sourceAsset: 'world-source/Obj/earth.obj',
    targetRadius: TARGET_RADIUS,
    coordinateSystem: 'Y_UP',
    photographicTextures: false,
    maskSource: 'world-source/Texture/2k_earth_daymap.jpg',
  };

  const shellGeometry = geometry.clone();
  shellGeometry.scale(
    SHELL_RADIUS_FACTOR,
    SHELL_RADIUS_FACTOR,
    SHELL_RADIUS_FACTOR,
  );
  shellGeometry.computeBoundingBox();
  shellGeometry.computeBoundingSphere();
  const shellMaterial = new THREE.MeshBasicMaterial({
    color: 0x010603,
    side: THREE.DoubleSide,
  });
  shellMaterial.name = 'rodar-world-shell-material';
  const shell = new THREE.Mesh(shellGeometry, shellMaterial);
  shell.name = SHELL_NAME;
  shell.userData = {
    role: 'world-shell',
    purpose: 'depth-occluder',
    radius: Number((TARGET_RADIUS * SHELL_RADIUS_FACTOR).toFixed(6)),
    triangleCount,
  };
  root.add(shell);

  const wireframeGeometry = new THREE.EdgesGeometry(
    geometry,
    EDGE_ANGLE_DEGREES,
  );
  const segmentCount = wireframeGeometry.getAttribute('position').count / 2;
  const wireframe = new THREE.LineSegments(
    wireframeGeometry,
    createLineMaterial('rodar-world-wireframe-material', 0xa2f200),
  );
  wireframe.name = WIREFRAME_NAME;
  wireframe.userData = {
    role: 'world-wireframe',
    radius: TARGET_RADIUS,
    segmentCount,
    edgeAngleDegrees: EDGE_ANGLE_DEGREES,
  };
  root.add(wireframe);

  const landPositions = buildLandPointPositions(pixels);
  const pointsGeometry = new THREE.BufferGeometry();
  pointsGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(landPositions, 3),
  );
  pointsGeometry.computeBoundingBox();
  pointsGeometry.computeBoundingSphere();
  // glTF has no portable point-size property. Export a supported unlit material
  // and retain the intended size as metadata for the runtime PointsMaterial.
  const pointsMaterial = new THREE.MeshBasicMaterial({ color: 0x66d7d1 });
  pointsMaterial.name = 'rodar-world-points-material';
  const points = new THREE.Points(pointsGeometry, pointsMaterial);
  points.name = POINTS_NAME;
  points.userData = {
    role: 'world-points',
    radius: TARGET_RADIUS,
    pointCount: pointsGeometry.getAttribute('position').count,
    pointSize: 0.145,
    distribution: 'texture-derived-land-mask',
    photographicTextureEmbedded: false,
  };
  root.add(points);

  const coastlinePositions = buildCoastlinePositions(pixels);
  const coastlineGeometry = new THREE.BufferGeometry();
  coastlineGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(coastlinePositions, 3),
  );
  coastlineGeometry.computeBoundingBox();
  coastlineGeometry.computeBoundingSphere();
  const coastline = new THREE.LineSegments(
    coastlineGeometry,
    createLineMaterial('rodar-world-coastline-material', 0xd5efe9),
  );
  coastline.name = COASTLINE_NAME;
  coastline.userData = {
    role: 'world-coastline',
    radius: LAND_RADIUS,
    segmentCount: coastlinePositions.length / 6,
    source: 'texture-derived-land-mask',
  };
  root.add(coastline);

  geometry.dispose();

  return {
    root,
    source: {
      meshCount,
      sourceCenter: normalized.sourceCenter
        .toArray()
        .map((value) => Number(value.toFixed(6))),
      sourceRadius: Number(normalized.sourceRadius.toFixed(6)),
      scale: Number(normalized.scale.toFixed(9)),
      triangleCount,
      uniqueVertexCount: geometry.getAttribute('position').count,
      textureBytes: statSync(texturePath).size,
    },
  };
}

async function exportBinary(scene) {
  return new GLTFExporter().parseAsync(scene, {
    binary: true,
    onlyVisible: true,
    truncateDrawRange: true,
  });
}

function objectMaxRadius(object) {
  object.updateMatrixWorld(true);
  let radius = 0;
  const point = new THREE.Vector3();

  object.traverse((child) => {
    if (!child.geometry) return;
    const positions = child.geometry.getAttribute('position');
    if (!positions) return;

    for (let index = 0; index < positions.count; index += 1) {
      point.fromBufferAttribute(positions, index);
      point.applyMatrix4(child.matrixWorld);
      radius = Math.max(radius, point.length());
    }
  });

  return radius;
}

function assertTextureFree(root) {
  const textureProperties = [
    'map',
    'normalMap',
    'bumpMap',
    'roughnessMap',
    'metalnessMap',
    'alphaMap',
    'aoMap',
    'emissiveMap',
  ];

  root.traverse((object) => {
    const materials = Array.isArray(object.material)
      ? object.material
      : object.material
        ? [object.material]
        : [];

    materials.forEach((material) => {
      textureProperties.forEach((property) => {
        if (material[property]) {
          throw new Error(
            `${object.name || object.type} unexpectedly contains ${property}.`,
          );
        }
      });
    });
  });
}

async function validateBinary(binary) {
  if (binary.byteLength > MAX_OUTPUT_BYTES) {
    throw new Error(
      `Generated GLB is ${binary.byteLength} bytes; limit is ${MAX_OUTPUT_BYTES}.`,
    );
  }

  const loaded = await new GLTFLoader().parseAsync(binary, `${projectRoot}/`);
  const root = loaded.scene.getObjectByName(ROOT_NAME);
  if (!root) throw new Error(`Exported GLB is missing ${ROOT_NAME}.`);

  const shell = root.getObjectByName(SHELL_NAME);
  const wireframe = root.getObjectByName(WIREFRAME_NAME);
  const points = root.getObjectByName(POINTS_NAME);
  const coastline = root.getObjectByName(COASTLINE_NAME);
  if (!shell?.isMesh || shell.userData.role !== 'world-shell') {
    throw new Error(`Exported GLB is missing the ${SHELL_NAME} mesh/role.`);
  }
  if (!wireframe?.isLineSegments || wireframe.userData.role !== 'world-wireframe') {
    throw new Error(`Exported GLB is missing the ${WIREFRAME_NAME} lines/role.`);
  }
  if (!points?.isPoints || points.userData.role !== 'world-points') {
    throw new Error(`Exported GLB is missing the ${POINTS_NAME} points/role.`);
  }
  if (!coastline?.isLineSegments || coastline.userData.role !== 'world-coastline') {
    throw new Error(`Exported GLB is missing the ${COASTLINE_NAME} lines/role.`);
  }

  assertTextureFree(root);
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  const center = bounds.getCenter(new THREE.Vector3());
  const dimensions = bounds.getSize(new THREE.Vector3());
  const maxRadius = objectMaxRadius(root);

  if (center.length() > 1e-4) {
    throw new Error(`Generated world is not centered: ${center.toArray()}.`);
  }
  if (Math.abs(maxRadius - TARGET_RADIUS) > 1e-4) {
    throw new Error(
      `Generated world radius is ${maxRadius}; expected ${TARGET_RADIUS}.`,
    );
  }

  const triangleCount = shell.geometry.index
    ? shell.geometry.index.count / 3
    : shell.geometry.getAttribute('position').count / 3;
  const segmentCount = wireframe.geometry.getAttribute('position').count / 2;
  const pointCount = points.geometry.getAttribute('position').count;
  const coastlineSegmentCount = coastline.geometry.getAttribute('position').count / 2;

  if (
    triangleCount <= 0
    || segmentCount <= 0
    || pointCount <= 0
    || coastlineSegmentCount <= 0
    || wireframe.userData.segmentCount !== segmentCount
    || points.userData.pointCount !== pointCount
    || coastline.userData.segmentCount !== coastlineSegmentCount
  ) {
    throw new Error('Generated world lost geometry or count metadata.');
  }

  return {
    bytes: binary.byteLength,
    center: center.toArray().map((value) => Number(value.toFixed(6))),
    dimensions: dimensions
      .toArray()
      .map((value) => Number(value.toFixed(6))),
    radius: Number(maxRadius.toFixed(6)),
    triangleCount,
    segmentCount,
    pointCount,
    coastlineSegmentCount,
    roles: root.children.map((child) => ({
      name: child.name,
      role: child.userData.role,
    })),
    textureFree: true,
  };
}

const source = new OBJLoader().parse(readFileSync(sourcePath, 'utf8'));
const pixels = decodeLandMask();
const { root, source: sourceStats } = buildWorldScene(source, pixels);
const binary = await exportBinary(root);
const validation = await validateBinary(binary);

mkdirSync(outputDirectory, { recursive: true });
writeFileSync(outputPath, Buffer.from(binary));

console.log(
  JSON.stringify(
    {
      sourcePath,
      sourceBytes: statSync(sourcePath).size,
      outputPath,
      ...sourceStats,
      ...validation,
    },
    null,
    2,
  ),
);
