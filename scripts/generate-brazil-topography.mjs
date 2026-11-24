import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const sourcePath = fileURLToPath(
  new URL('../docs/RODAR-telas/landing-page/3d-model/brazil_topo.stl', import.meta.url),
);
const outputDirectory = fileURLToPath(
  new URL('../src/features/home/assets/', import.meta.url),
);
const outputPath = fileURLToPath(
  new URL('../src/features/home/assets/rodar-brazil-topography.glb', import.meta.url),
);

const TARGET_POINT_COUNT = 1350;
const MIN_POINT_COUNT = 1000;
const MAX_POINT_COUNT = 1500;
const TARGET_FRAME = {
  minX: -3.4,
  maxX: 3.46,
  minY: -4.43,
  maxY: 4.5,
};
const TARGET_WIDTH = TARGET_FRAME.maxX - TARGET_FRAME.minX;
const TARGET_HEIGHT = TARGET_FRAME.maxY - TARGET_FRAME.minY;
const TARGET_RELIEF = 0.18;
const TARGET_MAX_Z = 0.04;
const TARGET_MIN_Z = TARGET_MAX_Z - TARGET_RELIEF;
const TOP_FACE_EPSILON = 1e-9;
const POSITION_PRECISION = 5;
const CONTOUR_LEVELS = [0.32, 0.5, 0.68, 0.84];
const MAX_OUTPUT_BYTES = 500_000;

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

function pointKey(point) {
  return `${point.x.toFixed(POSITION_PRECISION)},${point.y.toFixed(
    POSITION_PRECISION,
  )},${point.z.toFixed(POSITION_PRECISION)}`;
}

function edgeKey(first, second) {
  const firstKey = pointKey(first);
  const secondKey = pointKey(second);
  return firstKey < secondKey
    ? `${firstKey}|${secondKey}`
    : `${secondKey}|${firstKey}`;
}

function parseTopSurface(stlBytes) {
  const arrayBuffer = stlBytes.buffer.slice(
    stlBytes.byteOffset,
    stlBytes.byteOffset + stlBytes.byteLength,
  );
  const geometry = new STLLoader().parse(arrayBuffer);
  geometry.computeBoundingBox();

  const positions = geometry.getAttribute('position');
  const first = new THREE.Vector3();
  const second = new THREE.Vector3();
  const third = new THREE.Vector3();
  const firstEdge = new THREE.Vector3();
  const secondEdge = new THREE.Vector3();
  const topTriangles = [];
  const topVertices = new Map();

  for (let offset = 0; offset < positions.count; offset += 3) {
    first.fromBufferAttribute(positions, offset);
    second.fromBufferAttribute(positions, offset + 1);
    third.fromBufferAttribute(positions, offset + 2);
    const normalZ = firstEdge
      .subVectors(second, first)
      .cross(secondEdge.subVectors(third, first)).z;
    if (normalZ <= TOP_FACE_EPSILON) continue;

    const triangle = [first.clone(), second.clone(), third.clone()];
    topTriangles.push(triangle);
    triangle.forEach((point) => topVertices.set(pointKey(point), point));
  }

  if (topTriangles.length === 0) {
    throw new Error('The STL does not contain an upward-facing top surface.');
  }

  const sourceBounds = geometry.boundingBox.clone();
  const topBounds = new THREE.Box3().setFromPoints([...topVertices.values()]);
  geometry.dispose();

  return {
    sourceBounds,
    topBounds,
    topTriangles,
    topVertices: [...topVertices.values()],
  };
}

function sampleTopPoints(points, bounds) {
  const size = bounds.getSize(new THREE.Vector3());
  let best = null;

  for (let columns = 35; columns <= 70; columns += 1) {
    const rows = Math.max(1, Math.round(columns * size.y / size.x));
    const buckets = new Map();

    points.forEach((point) => {
      const normalizedX = (point.x - bounds.min.x) / size.x;
      const normalizedY = (point.y - bounds.min.y) / size.y;
      const column = Math.min(columns - 1, Math.floor(normalizedX * columns));
      const row = Math.min(rows - 1, Math.floor(normalizedY * rows));
      const centerX = (column + 0.5) / columns;
      const centerY = (row + 0.5) / rows;
      const distance =
        (normalizedX - centerX) ** 2 + (normalizedY - centerY) ** 2;
      const key = `${column},${row}`;
      const current = buckets.get(key);
      const candidateKey = pointKey(point);

      if (
        !current
        || distance < current.distance - Number.EPSILON
        || (
          Math.abs(distance - current.distance) <= Number.EPSILON
          && candidateKey < current.key
        )
      ) {
        buckets.set(key, { distance, key: candidateKey, point });
      }
    });

    const candidate = {
      columns,
      rows,
      points: [...buckets.values()].map(({ point }) => point),
    };
    const candidateDistance = Math.abs(candidate.points.length - TARGET_POINT_COUNT);
    const bestDistance = best
      ? Math.abs(best.points.length - TARGET_POINT_COUNT)
      : Number.POSITIVE_INFINITY;
    if (
      candidateDistance < bestDistance
      || (candidateDistance === bestDistance && columns < best.columns)
    ) {
      best = candidate;
    }
  }

  if (!best) throw new Error('Unable to sample the top surface.');
  best.points.sort((first, second) =>
    first.y - second.y || first.x - second.x || first.z - second.z,
  );
  return best;
}

function normalizePoint(point, topBounds, zOffset = 0) {
  const size = topBounds.getSize(new THREE.Vector3());
  const normalizedX = (point.x - topBounds.min.x) / size.x;
  const normalizedY = (point.y - topBounds.min.y) / size.y;
  const normalizedZ = (point.z - topBounds.min.z) / size.z;
  return new THREE.Vector3(
    THREE.MathUtils.lerp(TARGET_FRAME.minX, TARGET_FRAME.maxX, normalizedX),
    THREE.MathUtils.lerp(TARGET_FRAME.minY, TARGET_FRAME.maxY, normalizedY),
    THREE.MathUtils.lerp(TARGET_MIN_Z, TARGET_MAX_Z, normalizedZ) + zOffset,
  );
}

function collectOutlineEdges(topTriangles) {
  const edgeCounts = new Map();

  topTriangles.forEach((triangle) => {
    for (let index = 0; index < 3; index += 1) {
      const first = triangle[index];
      const second = triangle[(index + 1) % 3];
      const key = edgeKey(first, second);
      const edge = edgeCounts.get(key);
      if (edge) edge.count += 1;
      else edgeCounts.set(key, { count: 1, first, second });
    }
  });

  return [...edgeCounts.entries()]
    .filter(([, edge]) => edge.count === 1)
    .sort(([firstKey], [secondKey]) => firstKey.localeCompare(secondKey))
    .map(([, edge]) => [edge.first, edge.second]);
}

function uniqueIntersections(intersections) {
  const unique = new Map();
  intersections.forEach((point) => unique.set(pointKey(point), point));
  return [...unique.values()];
}

function farthestPair(points) {
  let pair = [points[0], points[1]];
  let distance = pair[0].distanceToSquared(pair[1]);
  for (let first = 0; first < points.length - 1; first += 1) {
    for (let second = first + 1; second < points.length; second += 1) {
      const candidateDistance = points[first].distanceToSquared(points[second]);
      if (candidateDistance > distance) {
        distance = candidateDistance;
        pair = [points[first], points[second]];
      }
    }
  }
  return pair;
}

function contourSegment(triangle, level) {
  const intersections = [];
  const epsilon = 1e-7;

  for (let index = 0; index < 3; index += 1) {
    const first = triangle[index];
    const second = triangle[(index + 1) % 3];
    const firstDelta = first.z - level;
    const secondDelta = second.z - level;

    if (Math.abs(firstDelta) <= epsilon) intersections.push(first.clone());
    if (firstDelta * secondDelta < 0) {
      const amount = (level - first.z) / (second.z - first.z);
      intersections.push(first.clone().lerp(second, amount));
    }
  }

  const unique = uniqueIntersections(intersections);
  if (unique.length < 2) return null;
  return unique.length === 2 ? unique : farthestPair(unique);
}

function collectContourSegments(topTriangles, topBounds) {
  const zSize = topBounds.max.z - topBounds.min.z;
  const levels = CONTOUR_LEVELS.map(
    (amount) => topBounds.min.z + zSize * amount,
  );
  const segments = new Map();

  levels.forEach((level, levelIndex) => {
    topTriangles.forEach((triangle) => {
      const minimum = Math.min(triangle[0].z, triangle[1].z, triangle[2].z);
      const maximum = Math.max(triangle[0].z, triangle[1].z, triangle[2].z);
      if (level < minimum || level > maximum) return;
      const segment = contourSegment(triangle, level);
      if (!segment) return;
      const key = `${levelIndex}:${edgeKey(segment[0], segment[1])}`;
      segments.set(key, segment);
    });
  });

  return {
    levels,
    segments: [...segments.entries()]
      .sort(([firstKey], [secondKey]) => firstKey.localeCompare(secondKey))
      .map(([, segment]) => segment),
  };
}

function positionsFromPoints(points, topBounds, zOffset = 0) {
  const values = new Float32Array(points.length * 3);
  points.forEach((point, index) => {
    const normalized = normalizePoint(point, topBounds, zOffset);
    normalized.toArray(values, index * 3);
  });
  return values;
}

function positionsFromSegments(segments, topBounds, zOffset = 0) {
  const values = new Float32Array(segments.length * 6);
  segments.forEach(([first, second], index) => {
    normalizePoint(first, topBounds, zOffset).toArray(values, index * 6);
    normalizePoint(second, topBounds, zOffset).toArray(values, index * 6 + 3);
  });
  return values;
}

function createLineMaterial(name, color) {
  const material = new THREE.MeshBasicMaterial({ color });
  material.name = name;
  return material;
}

function buildBrazilScene(surface) {
  const sampled = sampleTopPoints(surface.topVertices, surface.topBounds);
  if (
    sampled.points.length < MIN_POINT_COUNT
    || sampled.points.length > MAX_POINT_COUNT
  ) {
    throw new Error(
      `Sampled ${sampled.points.length} points; expected ${MIN_POINT_COUNT}-${MAX_POINT_COUNT}.`,
    );
  }

  const outlineEdges = collectOutlineEdges(surface.topTriangles);
  const contours = collectContourSegments(
    surface.topTriangles,
    surface.topBounds,
  );

  const root = new THREE.Group();
  root.name = 'RODAR_Brazil_Topography';
  root.userData = {
    role: 'brazil-topography',
    source: 'brazil_topo.stl',
    normalization: {
      frame: TARGET_FRAME,
      relief: TARGET_RELIEF,
      zRange: [TARGET_MIN_Z, TARGET_MAX_Z],
    },
  };

  const pointsGeometry = new THREE.BufferGeometry();
  pointsGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(
      positionsFromPoints(sampled.points, surface.topBounds),
      3,
    ),
  );
  const pointsMaterial = new THREE.MeshBasicMaterial({
    color: 0xa2f200,
  });
  pointsMaterial.name = 'brazil-topography-points-material';
  const points = new THREE.Points(pointsGeometry, pointsMaterial);
  points.name = 'brazil-topography-points';
  points.userData = {
    role: 'brazil-topography-points',
    pointCount: sampled.points.length,
    sampling: {
      columns: sampled.columns,
      rows: sampled.rows,
      strategy: 'nearest-to-cell-center',
    },
  };
  root.add(points);

  const outlineGeometry = new THREE.BufferGeometry();
  outlineGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(
      positionsFromSegments(outlineEdges, surface.topBounds, 0.004),
      3,
    ),
  );
  const outline = new THREE.LineSegments(
    outlineGeometry,
    createLineMaterial('brazil-topography-outline-material', 0x6e9d2d),
  );
  outline.name = 'brazil-topography-outline';
  outline.userData = {
    role: 'brazil-topography-outline',
    segmentCount: outlineEdges.length,
  };
  root.add(outline);

  const contourGeometry = new THREE.BufferGeometry();
  contourGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(
      positionsFromSegments(contours.segments, surface.topBounds, 0.008),
      3,
    ),
  );
  const contourLines = new THREE.LineSegments(
    contourGeometry,
    createLineMaterial('brazil-topography-contours-material', 0x426e0c),
  );
  contourLines.name = 'brazil-topography-contours';
  contourLines.userData = {
    role: 'brazil-topography-contours',
    contourLevels: CONTOUR_LEVELS,
    segmentCount: contours.segments.length,
  };
  root.add(contourLines);

  return root;
}

async function exportBinary(scene) {
  return new GLTFExporter().parseAsync(scene, {
    binary: true,
    onlyVisible: true,
    truncateDrawRange: true,
  });
}

function roundedVector(vector) {
  return vector.toArray().map((value) => Number(value.toFixed(4)));
}

async function validateBinary(binary) {
  if (binary.byteLength > MAX_OUTPUT_BYTES) {
    throw new Error(
      `Generated GLB is ${binary.byteLength} bytes; maximum is ${MAX_OUTPUT_BYTES}.`,
    );
  }

  const loaded = await new GLTFLoader().parseAsync(binary, `${projectRoot}/`);
  const root = loaded.scene.getObjectByName('RODAR_Brazil_Topography');
  if (!root) throw new Error('Exported GLB does not contain the Brazil root.');

  const points = root.getObjectByName('brazil-topography-points');
  const outline = root.getObjectByName('brazil-topography-outline');
  const contours = root.getObjectByName('brazil-topography-contours');
  if (!points?.isPoints) throw new Error('Brazil points lost their POINTS primitive.');
  if (!outline?.isLineSegments) throw new Error('Brazil outline lost its LINES primitive.');
  if (!contours?.isLineSegments) {
    throw new Error('Brazil contours lost their LINES primitive.');
  }

  const pointCount = points.geometry.getAttribute('position').count;
  const outlineSegments = outline.geometry.getAttribute('position').count / 2;
  const contourSegments = contours.geometry.getAttribute('position').count / 2;
  if (points.userData.role !== 'brazil-topography-points') {
    throw new Error('Brazil point role did not survive export.');
  }
  if (outline.userData.role !== 'brazil-topography-outline') {
    throw new Error('Brazil outline role did not survive export.');
  }
  if (contours.userData.role !== 'brazil-topography-contours') {
    throw new Error('Brazil contour role did not survive export.');
  }
  if (pointCount < MIN_POINT_COUNT || pointCount > MAX_POINT_COUNT) {
    throw new Error(`Exported GLB contains an invalid point count: ${pointCount}.`);
  }

  loaded.scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  const size = bounds.getSize(new THREE.Vector3());
  const tolerance = 0.001;
  if (
    Math.abs(size.x - TARGET_WIDTH) > tolerance
    || Math.abs(size.y - TARGET_HEIGHT) > tolerance
    || size.z > TARGET_RELIEF + 0.01
  ) {
    throw new Error(
      `Exported bounds are outside the expected frame: ${roundedVector(size).join(' x ')}.`,
    );
  }

  return {
    bounds: {
      min: roundedVector(bounds.min),
      max: roundedVector(bounds.max),
      size: roundedVector(size),
    },
    bytes: binary.byteLength,
    contourSegments,
    outlineSegments,
    pointCount,
    roles: {
      contours: contours.userData.role,
      outline: outline.userData.role,
      points: points.userData.role,
      root: root.userData.role,
    },
  };
}

const sourceBytes = readFileSync(sourcePath);
const surface = parseTopSurface(sourceBytes);
const brazil = buildBrazilScene(surface);
const binary = await exportBinary(brazil);
const validation = await validateBinary(binary);

mkdirSync(outputDirectory, { recursive: true });
writeFileSync(outputPath, Buffer.from(binary));
console.log(JSON.stringify({
  outputPath,
  source: {
    bytes: sourceBytes.byteLength,
    bounds: {
      min: roundedVector(surface.sourceBounds.min),
      max: roundedVector(surface.sourceBounds.max),
      size: roundedVector(surface.sourceBounds.getSize(new THREE.Vector3())),
    },
    topTriangles: surface.topTriangles.length,
    topVertices: surface.topVertices.length,
  },
  ...validation,
}, null, 2));
