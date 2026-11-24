import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loaderTarget, nextDisplayed, loaderStage, formatCounter, tickDashArray, fleetRecovery, LOADER_MIN_MS, LOADER_MAX_MS } from '../.cache/tests/features/home/model.js';
import { CABIN_FIT, sampleHomeTimeline, storyLineAt } from '../.cache/tests/features/home/three/timeline.js';

const HOME_GLB_ASSETS = [
  {
    path: '../src/features/home/assets/rodar-truck-wireframe.glb',
    maxBytes: 800_000,
    roles: ['wheel', 'exhaust'],
  },
  {
    path: '../src/features/home/assets/rodar-brazil-topography.glb',
    maxBytes: 500_000,
    roles: [
      'brazil-topography-points',
      'brazil-topography-outline',
      'brazil-topography-contours',
    ],
  },
  {
    path: '../src/features/home/assets/rodar-world-wireframe.glb',
    maxBytes: 128_000,
    roles: ['world-shell', 'world-wireframe', 'world-points', 'world-coastline'],
  },
];

function readGlb(path) {
  const bytes = readFileSync(new URL(path, import.meta.url));
  assert.equal(bytes.subarray(0, 4).toString('ascii'), 'glTF');
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const jsonLength = bytes.readUInt32LE(12);
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8').trim());
  return { bytes, json };
}

test('assets 3D da home são GLBs compactos com os papéis esperados', () => {
  HOME_GLB_ASSETS.forEach(({ path, maxBytes, roles }) => {
    const { bytes, json } = readGlb(path);
    assert.ok(bytes.length <= maxBytes, `${path} excedeu ${maxBytes} bytes`);
    const metadata = JSON.stringify(json);
    roles.forEach((role) => assert.match(metadata, new RegExp(`"${role}"`)));
  });
});

test('home pré-carrega somente derivados web, nunca os modelos brutos', () => {
  const intro = readFileSync(
    new URL('../src/features/home/hooks/useHomeIntro.ts', import.meta.url),
    'utf8',
  );
  const mapAssets = readFileSync(
    new URL('../src/features/home/three/mapAssets.ts', import.meta.url),
    'utf8',
  );
  assert.match(intro, /HOME_TRUCK_WIREFRAME_URL/);
  assert.match(intro, /HOME_BRAZIL_TOPOGRAPHY_URL/);
  assert.match(intro, /HOME_WORLD_WIREFRAME_URL/);
  assert.doesNotMatch(`${intro}\n${mapAssets}`, /\.(?:stl|rar|obj|fbx)(?:\?url)?['"]/i);
});

test('hero reserva mais scroll e libera o mapa do texto em telas largas', () => {
  const css = readFileSync(
    new URL('../src/features/home/components/home.css', import.meta.url),
    'utf8',
  );
  assert.match(css, /\.home-experience\s*\{[^}]*height:\s*1400svh/s);
  assert.match(css, /@media \(min-width: 900px\)/);
  assert.match(css, /data-stage='brazil'[\s\S]*data-stage='world'[\s\S]*text-align:\s*left/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*height:\s*1150svh/);
});

test('globo balança mantendo o Brasil em destaque e colore os pontos conforme as rotas avançam', () => {
  const scene = readFileSync(
    new URL('../src/features/home/three/createHomeScene.ts', import.meta.url),
    'utf8',
  );
  assert.match(scene, /vertexColors:\s*true/);
  assert.match(scene, /setRouteProgress\(sample\.globeRoutes\)/);
  assert.match(scene, /globeSwayTime\s*\+=\s*deltaSeconds/);
  assert.match(scene, /globe\.group\.add\(brazil\.anchor\)/);
  assert.match(scene, /drive\s*>\s*0\.001\s*\|\|\s*globeVisible/);
});

test('contador só chega a 100 com arquivos prontos e tempo mínimo cumprido', () => {
  assert.equal(loaderTarget(1, 0), 0);
  assert.equal(loaderTarget(1, LOADER_MIN_MS / 2), 50);
  assert.equal(loaderTarget(1, LOADER_MIN_MS), 100);
  assert.equal(loaderTarget(0.4, LOADER_MIN_MS * 2), 40);
  assert.equal(loaderTarget(0.999, LOADER_MIN_MS * 2), 99);
});

test('limite de segurança libera a página mesmo com arquivo lento ou progresso inválido', () => {
  assert.equal(loaderTarget(0, LOADER_MAX_MS), 100);
  assert.equal(loaderTarget(Number.NaN, LOADER_MAX_MS - 1), 0);
  assert.equal(loaderTarget(-3, LOADER_MIN_MS), 0);
  assert.equal(loaderTarget(7, LOADER_MIN_MS), 100);
  assert.equal(loaderTarget(1, 10, 0), 100);
});

test('valor exibido avança em passos, nunca recua e nunca passa do alvo', () => {
  assert.equal(nextDisplayed(10, 5), 10);
  assert.equal(nextDisplayed(10, 10), 10);
  assert.equal(nextDisplayed(99, 100), 100);
  let shown = 0;
  const seen = [];
  while (shown < 100) { shown = nextDisplayed(shown, 100); seen.push(shown); }
  assert.ok(seen.length > 5, 'deve haver passos visíveis');
  assert.ok(seen.every((value, i) => i === 0 || value > seen[i - 1]));
  assert.equal(seen.at(-1), 100);
});

test('etapas e contador formatado cobrem as fronteiras', () => {
  assert.equal(loaderStage(0), 'routes');
  assert.equal(loaderStage(35), 'routes');
  assert.equal(loaderStage(36), 'fleet');
  assert.equal(loaderStage(71), 'cco');
  assert.equal(loaderStage(100), 'ready');
  assert.equal(formatCounter(7), '07');
  assert.equal(formatCounter(100), '100');
  assert.equal(formatCounter(-1), '00');
  assert.equal(formatCounter(Number.NaN), '00');
});

test('marcações do anel fecham a volta completa', () => {
  const [on, off] = tickDashArray(209, 120).split(' ').map(Number);
  assert.ok(Math.abs((on + off) * 120 - 2 * Math.PI * 209) < 0.2);
});

test('timeline mantém a narrativa chip, celular, caminhão, Brasil e mundo', () => {
  assert.equal(sampleHomeTimeline(0).stage, 'chip');
  assert.equal(sampleHomeTimeline(0.2).stage, 'phone');
  assert.equal(sampleHomeTimeline(0.5).stage, 'truck');
  assert.equal(sampleHomeTimeline(0.72).stage, 'brazil');
  assert.equal(sampleHomeTimeline(0.94).stage, 'world');
  assert.equal(sampleHomeTimeline(-10).progress, 0);
  assert.equal(sampleHomeTimeline(10).progress, 1);
});

test('objetos se transformam na mesma timeline sem saltos de câmera', () => {
  const bareMark = sampleHomeTimeline(0);
  const processor = sampleHomeTimeline(0.08);
  assert.ok(bareMark.chipOpacity < processor.chipOpacity);
  assert.ok(processor.chipTraceProgress > 0.5);

  const solidPhone = sampleHomeTimeline(0.25);
  const wirePhone = sampleHomeTimeline(0.38);
  assert.ok(solidPhone.phoneSolidOpacity > wirePhone.phoneSolidOpacity);
  assert.ok(solidPhone.phoneWireOpacity < wirePhone.phoneWireOpacity);
  assert.ok(wirePhone.phoneScale < solidPhone.phoneScale);
  const mountedPhone = sampleHomeTimeline(0.29);
  assert.ok(mountedPhone.cabinOpacity > 0.9);
  assert.ok(mountedPhone.phoneScale <= 0.055, 'celular montado precisa manter proporção realista');
  assert.ok(
    Math.hypot(...mountedPhone.cameraPosition.map(
      (value, index) => value - mountedPhone.cameraTarget[index],
    )) > 3.5 * CABIN_FIT.scale,
    'câmera frontal não pode deformar a cabine por excesso de proximidade',
  );
  assert.equal(sampleHomeTimeline(0.45).cabinOpacity, 0);
  assert.ok(wirePhone.truckWireOpacity > wirePhone.truckSolidOpacity);
  assert.equal(sampleHomeTimeline(0.43).phoneBodyOpacity, 0);
  assert.ok(sampleHomeTimeline(0.5).driveIntensity > 0.95);
  assert.ok(sampleHomeTimeline(0.5).driveGridOpacity > 0.9);
  assert.equal(sampleHomeTimeline(0.85).driveIntensity, 0);

  const beforeWire = sampleHomeTimeline(0.29);
  const afterWire = sampleHomeTimeline(0.36);
  assert.ok(beforeWire.truckSolidOpacity > afterWire.truckSolidOpacity);
  assert.ok(beforeWire.truckWireOpacity < afterWire.truckWireOpacity);

  const beforeBoundary = sampleHomeTimeline(0.7599).cameraPosition;
  const afterBoundary = sampleHomeTimeline(0.7601).cameraPosition;
  const delta = Math.hypot(...beforeBoundary.map((value, index) => value - afterBoundary[index]));
  assert.ok(delta < 0.1, `a câmera saltou ${delta}`);

  const transfer = sampleHomeTimeline(0.9);
  assert.ok(transfer.brazilOpacity > 0);
  assert.ok(transfer.globeOpacity > 0);
  assert.ok(transfer.brazilMorph > 0 && transfer.brazilMorph < 1);
  assert.equal(sampleHomeTimeline(0.5).worldZoom, 0, 'caminhão começa em escala real na estrada');
  const zooming = sampleHomeTimeline(0.68);
  assert.ok(zooming.worldZoom > 0 && zooming.worldZoom < 1 && zooming.truckOpacity > 0,
    'caminhão encolhe sobre o mapa enquanto a câmera afasta');
  assert.equal(sampleHomeTimeline(0.82).worldZoom, 1);
  const finale = sampleHomeTimeline(1);
  assert.equal(finale.brazilOpacity, 1, 'Brasil precisa terminar destacado no globo');
  assert.equal(finale.brazilMorph, 1);

  const routesBeginning = sampleHomeTimeline(0.89).globeRoutes;
  const routesMiddle = sampleHomeTimeline(0.94).globeRoutes;
  const routesComplete = sampleHomeTimeline(0.999).globeRoutes;
  assert.ok(routesBeginning > 0);
  assert.ok(routesMiddle > routesBeginning && routesMiddle < routesComplete);
  assert.equal(routesComplete, 1);
});

test('texto digitado revela uma linha por etapa e destaca o caractere corrente', () => {
  const beginning = storyLineAt(0.012);
  const typed = storyLineAt(0.09);
  const world = storyLineAt(0.98);
  assert.equal(beginning.line.stage, 'chip');
  assert.equal(typed.reveal, 1);
  assert.equal(world.line.stage, 'world');
  assert.equal(world.reveal, 1);
});

test('calculadora da home usa a regra de estadia (R5) e 22 dias úteis', () => {
  const result = fleetRecovery({ trucks: 20, deliveriesPerDay: 1.5, lateShare: 0.35, extraHours: 2, loadTons: 22 });
  assert.equal(result.lateDeliveries, 231);
  assert.equal(result.stoppedHours, 462);
  assert.equal(result.perDelivery, 110);
  assert.equal(result.monthly, 25410);
  assert.equal(result.yearly, 304920);
  assert.equal(fleetRecovery({ trucks: 10, deliveriesPerDay: 1, lateShare: 0, extraHours: 3, loadTons: 20 }).monthly, 0);
});
