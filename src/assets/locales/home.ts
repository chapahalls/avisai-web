export const homePt = {
  pageTitle: 'RODAR · Inteligência para a estrada',
  loader: {
    label: 'Carregando a página da RODAR',
    brand: 'RODAR · AvisAI',
    stages: { routes: 'Carregando rotas', fleet: 'Sincronizando frota', cco: 'Conectando ao CCO', ready: 'Pronto para rodar' },
    origin: 'CCO · Campinas/SP',
    coordinates: '22.91° S · 47.06° O',
  },
  hero: {
    eyebrow: 'Transporte rodoviário · voz · CCO',
    title: 'Tudo começa num chip de inteligência.',
    subtitle: 'A RODAR liga o motorista, o recebedor e o Centro de Controle Operacional por voz. Cada hora parada vira prova.',
    primary: 'Entrar no painel',
    secondary: 'Ver como funciona',
    scroll: 'Role para explorar',
    chipAlt: 'Chip da RODAR',
  },
  pillars: {
    title: 'Uma plataforma, três pontos da operação',
    items: {
      road: { title: 'Na estrada', body: 'O AvisAI conversa com o motorista por voz, sem ele precisar tocar na tela.' },
      receiver: { title: 'No recebedor', body: 'Doca confirmada por telefone antes da chegada e espera registrada com horário.' },
      cco: { title: 'No CCO', body: 'Alertas por prioridade e o agente escalando só o que precisa de uma pessoa.' },
    },
  },
};

export const homeEn: typeof homePt = {
  pageTitle: 'RODAR · Intelligence for the road',
  loader: {
    label: 'Loading the RODAR page',
    brand: 'RODAR · AvisAI',
    stages: { routes: 'Loading routes', fleet: 'Syncing fleet', cco: 'Connecting to the control center', ready: 'Ready to roll' },
    origin: 'Control center · Campinas, Brazil',
    coordinates: '22.91° S · 47.06° W',
  },
  hero: {
    eyebrow: 'Road transport · voice · control center',
    title: 'It all starts with an intelligence chip.',
    subtitle: 'RODAR connects the driver, the receiver and the operations control center by voice. Every hour of waiting becomes evidence.',
    primary: 'Open the dashboard',
    secondary: 'See how it works',
    scroll: 'Scroll to explore',
    chipAlt: 'RODAR chip',
  },
  pillars: {
    title: 'One platform, three points of the operation',
    items: {
      road: { title: 'On the road', body: 'AvisAI talks to the driver by voice, with no need to touch the screen.' },
      receiver: { title: 'At the receiver', body: 'Dock confirmed by phone before arrival and waiting time recorded with timestamps.' },
      cco: { title: 'In the control center', body: 'Alerts by priority, with the agent escalating only what needs a person.' },
    },
  },
};
