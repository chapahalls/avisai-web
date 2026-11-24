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
    markAlt: 'Símbolo da RODAR',
  },
  story: {
    label: 'Experiência RODAR: do chip à malha global',
    nav: { platform: 'Plataforma', how: 'Como funciona', calculator: 'Calculadora', product: 'Ver produto', demo: 'Agendar demo' },
    chip: {
      kicker: 'INTELIGÊNCIA PARA A ESTRADA',
      title: 'Tudo começa num chip de inteligência.',
      body: 'O símbolo da RODAR concentra a inteligência que conecta cada ponto da operação.',
    },
    phone: {
      kicker: 'NO CELULAR DO MOTORISTA',
      title: 'Que cabe no celular do motorista…',
      body: 'O AvisAI acompanha a rota, confirma a doca e conversa sem tirar a atenção da estrada.',
    },
    truck: {
      kicker: 'DENTRO DO CAMINHÃO',
      title: '…e transforma cada caminhão em dado vivo.',
      body: 'O caminhão deixa de ser uma caixa-preta e passa a responder à operação em tempo real.',
    },
    brazil: {
      kicker: 'VISÃO DO CCO',
      title: 'Cada rota do Brasil, ao vivo, num só mapa.',
      body: 'Da câmera sobre o veículo à operação inteira: rotas, alertas e evidências em uma só visão.',
    },
    world: {
      kicker: 'ESCALA',
      title: 'Do motorista ao CCO. Do Brasil para o mundo.',
      body: 'A mesma plataforma acompanha qualquer malha rodoviária, em qualquer escala.',
    },
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
    markAlt: 'RODAR logo',
  },
  story: {
    label: 'RODAR experience: from the chip to the global network',
    nav: { platform: 'Platform', how: 'How it works', calculator: 'Calculator', product: 'Explore product', demo: 'Book a demo' },
    chip: {
      kicker: 'INTELLIGENCE FOR THE ROAD',
      title: 'It all starts with an intelligence chip.',
      body: 'The RODAR symbol contains the intelligence connecting every point in the operation.',
    },
    phone: {
      kicker: 'ON THE DRIVER’S PHONE',
      title: 'That fits inside the driver’s phone…',
      body: 'AvisAI follows the route, confirms the dock, and talks without taking attention away from the road.',
    },
    truck: {
      kicker: 'INSIDE THE TRUCK',
      title: '…and turns every truck into live data.',
      body: 'The truck stops being a black box and starts responding to the operation in real time.',
    },
    brazil: {
      kicker: 'CONTROL CENTER VIEW',
      title: 'Every route in Brazil, live, on one map.',
      body: 'From the camera over the vehicle to the full operation: routes, alerts, and evidence in one view.',
    },
    world: {
      kicker: 'SCALE',
      title: 'From the driver to the control center. From Brazil to the world.',
      body: 'The same platform follows any road network, at any scale.',
    },
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
