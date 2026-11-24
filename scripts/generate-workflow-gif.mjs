import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const output = join(root, 'docs/assets/avisai-workflow.gif');
const frames = mkdtempSync(join(tmpdir(), 'avisai-workflow-'));
const width = 960;
const height = 540;
const stageCount = 6;

const stages = [
  { title: 'Rota publicada', detail: 'CCO registra origem, destino e carga.', action: 'Nova rota criada', icon: '↗' },
  { title: 'Motorista atribuído', detail: 'A rota e os arquivos chegam ao celular.', action: 'Rota disponível no app', icon: '⇄' },
  { title: 'Viagem monitorada', detail: 'O CCO acompanha o progresso e os eventos.', action: 'GPS e eventos em tempo real', icon: '⌁' },
  { title: 'Aviso de aproximação', detail: 'Recebedor e central recebem o aviso prévio.', action: 'Doca e previsão registradas', icon: '!' },
  { title: 'Chegada e Task', detail: 'A estadia inicia e a central assume a Task.', action: 'Task aguardando ação', icon: '✓' },
  { title: 'Descarga confirmada', detail: 'A Task fecha com o resumo da operação.', action: 'Estadia finalizada', icon: '●' },
];

const escapeXml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

const text = (x, y, value, size, color = '#d9e2f2', weight = 500, anchor = 'start') =>
  `<text x="${x}" y="${y}" fill="${color}" font-family="DejaVu Sans, sans-serif" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}">${escapeXml(value)}</text>`;

const rounded = (x, y, w, h, fill, stroke = 'none', radius = 12, opacity = 1) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${fill}" stroke="${stroke}" opacity="${opacity}"/>`;

const statusCard = (stage) => {
  const card = stages[stage];
  const labels = [
    ['Origem', 'Centro de distribuição'],
    ['Destino', 'Supermercado Campinas'],
    ['Carga', '28 t · NF 000.482.913'],
  ];

  if (stage === 1) labels[0] = ['Motorista', 'Marina Souza'];
  if (stage === 2) labels[0] = ['Veículo', 'ABC1D23 · em trânsito'];
  if (stage === 3) labels[1] = ['Recebedor', 'Doca 4 · previsão 09:30'];
  if (stage === 4) labels[2] = ['Estadia', 'Iniciada · 00h 18min'];
  if (stage === 5) labels[2] = ['Resumo', '3h 30min · R$ 890,00'];

  return `
    ${rounded(24, 116, 226, 346, '#101a2d', '#223250')}
    ${text(42, 146, 'OPERAÇÃO', 11, '#8fa2c4', 700)}
    ${text(42, 176, 'ABC1D23', 24, '#f4f7ff', 750)}
    ${rounded(42, 190, 144, 24, '#112942', '#1d6fae', 6)}
    ${text(52, 207, stage === 5 ? 'descarga concluída' : 'rota em acompanhamento', 10, '#73c7ff', 700)}
    ${labels.map(([label, value], index) => {
      const y = 248 + index * 66;
      return `${text(42, y, label.toUpperCase(), 10, '#7f93b4', 700)}${text(42, y + 22, value, 12, '#e5ecfa', 600)}`;
    }).join('')}
    <line x1="42" y1="392" x2="232" y2="392" stroke="#293c5d"/>
    ${text(42, 420, 'AÇÃO DO CCO', 10, '#7f93b4', 700)}
    ${rounded(42, 432, 190, 22, stage === 4 ? '#0d8ee6' : '#152642', stage === 4 ? '#55b8ff' : '#29476d', 6)}
    ${text(137, 447, stage === 4 ? 'Assumir Task' : card.action, 10, '#ffffff', 700, 'middle')}
  `;
};

const workflow = (stage) => `
  ${rounded(718, 116, 218, 346, '#101a2d', '#223250')}
  ${text(738, 146, 'WORKFLOW', 11, '#8fa2c4', 700)}
  ${text(738, 169, 'Da rota à descarga', 16, '#f4f7ff', 700)}
  ${stages.map((item, index) => {
    const y = 202 + index * 40;
    const active = index === stage;
    const done = index < stage;
    const fill = active ? '#0d8ee6' : done ? '#1c845c' : '#1a2944';
    const line = index < stageCount - 1
      ? `<line x1="750" y1="${y + 18}" x2="750" y2="${y + 38}" stroke="${done ? '#2cb67d' : '#314460'}" stroke-width="2"/>`
      : '';
    return `${line}${rounded(738, y, 24, 24, fill, active ? '#7cd2ff' : 'none', 12)}${text(750, y + 16, done ? '✓' : String(index + 1), 11, '#ffffff', 800, 'middle')}${text(774, y + 16, item.title, 11, active ? '#ffffff' : '#b2c0d8', active ? 750 : 550)}`;
  }).join('')}
`;

const mapPanel = (stage, frameWithinStage) => {
  const progress = Math.min(1, (stage + frameWithinStage * 0.5) / (stageCount - 1));
  const x = 286 + progress * 385;
  const y = 379 - progress * 112;
  const active = stages[stage];
  const routeSegments = [
    'M 304 398 C 362 392 369 344 421 340 S 501 365 542 316 S 612 225 678 251',
  ];
  const path = routeSegments[0];

  return `
    ${rounded(266, 116, 432, 346, '#101a2d', '#223250')}
    ${text(288, 146, 'FROTA E MAPA', 11, '#8fa2c4', 700)}
    ${text(288, 169, 'Campinas · operação monitorada', 16, '#f4f7ff', 700)}
    ${rounded(288, 187, 176, 24, '#142640', '#274361', 6)}
    ${text(300, 204, '●  Dados fictícios da demo', 10, '#8fd0ff', 650)}
    <path d="${path}" fill="none" stroke="#3f5979" stroke-width="6" stroke-linecap="round"/>
    <path d="${path}" fill="none" stroke="#0d9cf5" stroke-width="6" stroke-linecap="round" pathLength="100" stroke-dasharray="${Math.max(4, progress * 100)} 100"/>
    <circle cx="304" cy="398" r="8" fill="#1b2a45" stroke="#8fa2c4" stroke-width="2"/>
    <circle cx="678" cy="251" r="8" fill="#143451" stroke="#5abaff" stroke-width="2"/>
    ${text(304, 422, 'origem', 10, '#8fa2c4', 600, 'middle')}
    ${text(678, 238, 'destino', 10, '#8fa2c4', 600, 'middle')}
    <circle cx="${x}" cy="${y}" r="14" fill="#0d9cf5" stroke="#b8e6ff" stroke-width="3"/>
    ${text(x, y + 5, '▰', 14, '#ffffff', 800, 'middle')}
    ${rounded(458, 258, 210, 62, '#13233d', '#2b4569', 10)}
    ${text(474, 281, active.icon + '  ' + active.title, 13, '#ffffff', 700)}
    ${text(474, 303, active.detail, 10, '#b8c8df', 550)}
  `;
};

const render = (frame) => {
  const stage = Math.floor(frame / 2);
  const phase = frame % 2;
  const item = stages[stage];
  const footerX = 96 + stage * 154 + phase * 42;

  return `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="${width}" height="${height}" fill="#08111f"/>
    <rect x="0" y="0" width="${width}" height="80" fill="#0d1727"/>
    <line x1="0" y1="80" x2="${width}" y2="80" stroke="#223250"/>
    ${rounded(24, 20, 36, 36, '#0c3152', '#147bc0', 10)}
    ${text(42, 44, '▰', 18, '#6cc7ff', 700, 'middle')}
    ${text(74, 43, 'RODAR', 24, '#f4f7ff', 800)}
    ${text(74, 61, 'CENTRAL DE OPERAÇÃO · DEMO', 10, '#77c8ff', 700)}
    ${rounded(722, 24, 214, 30, '#13233d', '#2a466b', 7)}
    ${text(829, 44, 'Workflow operacional', 12, '#d9e7f9', 700, 'middle')}
    ${text(24, 103, 'Do cadastro da rota à confirmação da descarga', 20, '#ffffff', 750)}
    ${text(24, 486, `Etapa ${stage + 1}/6 · ${item.title}`, 13, '#ffffff', 700)}
    ${text(24, 508, item.detail, 11, '#a8b9d3', 500)}
    ${statusCard(stage)}
    ${mapPanel(stage, phase)}
    ${workflow(stage)}
    <line x1="24" y1="524" x2="936" y2="524" stroke="#273a57" stroke-width="4" stroke-linecap="round"/>
    <line x1="24" y1="524" x2="${footerX}" y2="524" stroke="#0d9cf5" stroke-width="4" stroke-linecap="round"/>
    ${[0, 1, 2, 3, 4, 5].map((index) => {
      const x = 96 + index * 154;
      const fill = index < stage ? '#2cb67d' : index === stage ? '#0d9cf5' : '#223955';
      return `<circle cx="${x}" cy="524" r="7" fill="${fill}" stroke="${index === stage ? '#b6e7ff' : 'none'}" stroke-width="2"/>`;
    }).join('')}
  </svg>`;
};

try {
  mkdirSync(dirname(output), { recursive: true });
  const pngs = [];
  for (let frame = 0; frame < stageCount * 2; frame += 1) {
    const svg = join(frames, `frame-${String(frame).padStart(2, '0')}.svg`);
    const png = join(frames, `frame-${String(frame).padStart(2, '0')}.png`);
    writeFileSync(svg, render(frame));
    execFileSync('convert', ['-background', '#08111f', '-density', '96', svg, '-resize', '960x540', '-colors', '96', png], { stdio: 'inherit' });
    pngs.push(png);
  }
  execFileSync('convert', ['-delay', '62', '-loop', '0', ...pngs, '-layers', 'Optimize', '-colors', '96', output], { stdio: 'inherit' });
  process.stdout.write(`Generated ${output}\n`);
} finally {
  rmSync(frames, { recursive: true, force: true });
}
